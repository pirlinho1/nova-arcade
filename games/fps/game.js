/* NOVA ARCADE — Strike 5v5
   FPS de raycasting (pseudo-3D) en canvas puro. Sin dependencias.
   Tú + 4 bots aliados (Rojo) vs 5 bots enemigos (Azul). Deathmatch por equipos
   con objetivo de bomba (C4). Gana quien llegue a 3 rondas. */
(function () {
  "use strict";
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const mini = document.getElementById("mini"), mctx = mini.getContext("2d");
  const $ = id => document.getElementById(id);
  const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");

  // ---------- mapa (16x16). 1=muro gris, 2=ladrillo, 3=metal, A/B=bases, X/Y=sitios bomba ----------
  const MAP_STR = [
    "1111111111111111",
    "1A....2....2...1",
    "1.AAA.2.XX.2...1",
    "1.A...........1.",  // (se normaliza abajo)
    "1...3333...3..11",
    "1...3.........11",
    "1.2.3.2222.2..11",
    "1...........2.11",
    "11.2.......2..11",
    "11..2222.3....11",
    "11.......3.2..11",
    "1...2.YY.2....11",
    "1...2....2.BBB11",
    "1.........B...B1",
    "1...2....2...B.1",
    "1111111111111111",
  ];
  // normalizar a 16 columnas exactas
  const MAP = MAP_STR.map(r => (r + "................").slice(0, 16).split(""));
  const MS = MAP.length;                       // map size (16)
  const solid = (mx, my) => {
    if (mx < 0 || my < 0 || mx >= MS || my >= MS) return true;
    const c = MAP[my][mx];
    return c === "1" || c === "2" || c === "3";
  };
  const wallTex = (mx, my) => MAP[my][mx];     // para color
  // sitios de bomba (centro de las celdas X/Y)
  const bombSites = [];
  MAP.forEach((row, y) => row.forEach((c, x) => { if (c === "X" || c === "Y") bombSites.push({ x: x + 0.5, y: y + 0.5 }); }));
  // puntos de spawn por equipo (celdas A=rojo, B=azul)
  function spawnsFor(letter) {
    const out = [];
    MAP.forEach((row, y) => row.forEach((c, x) => { if (c === letter) out.push({ x: x + 0.5, y: y + 0.5 }); }));
    return out;
  }

  // ---------- estado ----------
  const DIFF = { facil: { acc: .35, react: 55, dmg: .7 }, normal: { acc: .55, react: 32, dmg: 1 }, dificil: { acc: .78, react: 16, dmg: 1.35 } };
  let cfg = { sens: 0.0024, diff: "normal", fov: 0.66, run: true };
  let keys = {}, mouseLocked = false;
  let player, agents, bullets, bomb, round, score, state, msgTimer, lastTime, raf = null;
  let zbuf = new Float32Array(W);

  // ---------- armas ----------
  const WEAPONS = {
    pistol: { name: "Pistola", dmg: 26, rof: 320, spread: .03, mag: 12, reserve: Infinity, reload: 900, auto: false, pellets: 1, range: 18, snd: () => sfxShot(520, .07) },
    rifle: { name: "Rifle", dmg: 19, rof: 95, spread: .05, mag: 30, reserve: 90, reload: 1400, auto: true, pellets: 1, range: 22, snd: () => sfxShot(360, .05) },
    shotgun: { name: "Escopeta", dmg: 11, rof: 700, spread: .14, mag: 7, reserve: 28, reload: 1700, auto: false, pellets: 7, range: 9, snd: () => sfxShot(140, .12) },
  };
  const WLIST = ["pistol", "rifle", "shotgun"];

  function sfxShot(freq, dur) { try { NovaAudio.resume(); const a = NovaAudio; a.play && null; blip(freq, dur, "sawtooth"); } catch (e) {} }
  // mini sintetizador local para disparos/impactos (usa el contexto de NovaAudio vía blip público no existe → fallback)
  function blip(freq, dur, type) {
    try {
      NovaAudio.resume();
      const A = window._fpsAudio || (window._fpsAudio = new (window.AudioContext || window.webkitAudioContext)());
      const st = NovaAudio.get();
      const o = A.createOscillator(), g = A.createGain();
      o.type = type; o.frequency.value = freq;
      const vol = (st.muteSfx ? 0 : st.sfx) * st.master * 0.5;
      g.gain.setValueAtTime(0.0001, A.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), A.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + dur);
      o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + dur + 0.02);
    } catch (e) {}
  }

  // ---------- inicialización de ronda ----------
  function newAgent(team, isPlayer, idx) {
    const sp = spawnsFor(team === "red" ? "A" : "B");
    const s = sp[idx % sp.length] || { x: team === "red" ? 2.5 : 13.5, y: team === "red" ? 2.5 : 13.5 };
    return {
      team, isPlayer: !!isPlayer, alive: true,
      x: s.x + (Math.random() - .5) * .4, y: s.y + (Math.random() - .5) * .4,
      dir: team === "red" ? 0 : Math.PI, hp: 100, armor: isPlayer ? 0 : 25,
      weapon: isPlayer ? "pistol" : (Math.random() < .5 ? "rifle" : "shotgun"),
      mag: 0, reserve: 0, reloadUntil: 0, nextFire: 0,
      state: "patrol", targetCell: null, seeT: 0, name: (team === "red" ? "R" : "B") + idx,
      bob: 0,
    };
  }
  function giveAmmo(ag) { const w = WEAPONS[ag.weapon]; ag.mag = w.mag; ag.reserve = w.reserve === Infinity ? Infinity : w.reserve; }

  function startRound() {
    agents = [];
    player = newAgent("red", true, 0); giveAmmo(player); agents.push(player);
    for (let i = 1; i < 5; i++) { const a = newAgent("red", false, i); giveAmmo(a); agents.push(a); }
    for (let i = 0; i < 5; i++) { const a = newAgent("blue", false, i); giveAmmo(a); agents.push(a); }
    bullets = [];
    bomb = { planted: false, by: null, site: null, timer: 0, defuser: null, defTime: 0, carrier: player };
    state = "play"; msgTimer = 0;
    ov.classList.remove("show");
    updateHUD(); feedClear();
    showMsg("¡Ronda " + round + "!", 1.6);
    if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("chip", 120);
    lastTime = performance.now();
    if (raf) cancelAnimationFrame(raf);
    loop(lastTime);
  }
  function newMatch() {
    round = 1; score = { red: 0, blue: 0 };
    startRound();
  }

  // ---------- raycasting ----------
  function castColumns() {
    const px = player.x, py = player.y, dir = player.dir;
    const dirx = Math.cos(dir), diry = Math.sin(dir);
    const planex = -diry * cfg.fov, planey = dirx * cfg.fov;
    // cielo y suelo
    const top = ctx.createLinearGradient(0, 0, 0, H / 2);
    top.addColorStop(0, "#1a2030"); top.addColorStop(1, "#0c0f16");
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H / 2);
    const flo = ctx.createLinearGradient(0, H / 2, 0, H);
    flo.addColorStop(0, "#10131b"); flo.addColorStop(1, "#1c222e");
    ctx.fillStyle = flo; ctx.fillRect(0, H / 2, W, H / 2);

    for (let col = 0; col < W; col++) {
      const camx = 2 * col / W - 1;
      const rdx = dirx + planex * camx, rdy = diry + planey * camx;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let stepx, stepy, sdx, sdy;
      if (rdx < 0) { stepx = -1; sdx = (px - mx) * ddx; } else { stepx = 1; sdx = (mx + 1 - px) * ddx; }
      if (rdy < 0) { stepy = -1; sdy = (py - my) * ddy; } else { stepy = 1; sdy = (my + 1 - py) * ddy; }
      let side = 0, hit = false, guard = 0;
      while (!hit && guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stepx; side = 0; } else { sdy += ddy; my += stepy; side = 1; }
        if (solid(mx, my)) hit = true;
      }
      const dist = side === 0 ? (sdx - ddx) : (sdy - ddy);
      zbuf[col] = dist;
      const lh = Math.min(H * 3, H / Math.max(0.05, dist));
      const y0 = (H - lh) / 2, y1 = y0 + lh;
      // color por textura + sombreado
      const tex = wallTex(mx, my);
      let base = tex === "2" ? [150, 80, 60] : tex === "3" ? [90, 110, 130] : [110, 110, 120];
      let sh = side === 1 ? 0.72 : 1;
      const fog = Math.max(0.25, 1 - dist / 16);
      sh *= fog;
      ctx.fillStyle = `rgb(${base[0] * sh | 0},${base[1] * sh | 0},${base[2] * sh | 0})`;
      ctx.fillRect(col, y0, 1, y1 - y0);
    }
  }

  // sprites (otros agentes vivos + bomba) proyectados sobre el zbuffer
  function drawSprites() {
    const px = player.x, py = player.y, dir = player.dir;
    const dirx = Math.cos(dir), diry = Math.sin(dir);
    const planex = -diry * cfg.fov, planey = dirx * cfg.fov;
    const inv = 1 / (planex * diry - dirx * planey);
    const list = [];
    agents.forEach(a => { if (a !== player && a.alive) list.push({ x: a.x, y: a.y, kind: "agent", a }); });
    if (bomb.planted) list.push({ x: bomb.site.x, y: bomb.site.y, kind: "bomb" });
    list.forEach(s => s.d = (s.x - px) ** 2 + (s.y - py) ** 2);
    list.sort((p, q) => q.d - p.d);
    list.forEach(s => {
      const rx = s.x - px, ry = s.y - py;
      const tx = inv * (diry * rx - dirx * ry);
      const ty = inv * (-planey * rx + planex * ry);
      if (ty <= 0.1) return;
      const screenX = (W / 2) * (1 + tx / ty);
      const size = Math.min(H * 2.5, Math.abs(H / ty));
      const w = s.kind === "bomb" ? size * .35 : size * .5;
      const h = s.kind === "bomb" ? size * .35 : size * .92;
      const y1 = H / 2 + size / 2, y0 = y1 - h;
      const x0 = screenX - w / 2;
      const fog = Math.max(0.3, 1 - ty / 16);
      for (let col = Math.max(0, x0 | 0); col < Math.min(W, x0 + w); col++) {
        if (ty < zbuf[col]) { /* visible en esta columna */ }
        else continue;
        const u = (col - x0) / w;
        if (s.kind === "bomb") drawBombStripe(col, y0, h, u, fog);
        else drawAgentStripe(col, y0, h, w, u, s.a, fog, ty);
      }
    });
  }
  function drawAgentStripe(col, y0, h, w, u, ag, fog, ty) {
    // silueta simple tipo soldado: cuerpo (torso/piernas) + cabeza
    const teamC = ag.team === "red" ? [230, 70, 90] : [70, 130, 235];
    const dark = c => Math.max(0, c * fog) | 0;
    // proporciones verticales
    const headTop = 0.0, headBot = 0.22, bodyBot = 0.62, legBot = 1.0;
    // recorte de silueta por u (más estrecho en cabeza)
    const headHalf = 0.18, bodyHalf = 0.42;
    function band(yu, half, r, g, b) {
      if (Math.abs(u - .5) > half) return false;
      ctx.fillStyle = `rgb(${dark(r)},${dark(g)},${dark(b)})`;
      return true;
    }
    // cabeza
    let yy0 = y0 + h * headTop, yy1 = y0 + h * headBot;
    if (band(0, headHalf, 235, 200, 170)) ctx.fillRect(col, yy0, 1, yy1 - yy0);
    // torso (color de equipo)
    yy0 = y0 + h * headBot; yy1 = y0 + h * bodyBot;
    if (band(0, bodyHalf, teamC[0], teamC[1], teamC[2])) ctx.fillRect(col, yy0, 1, yy1 - yy0);
    // arma (banda horizontal a media altura, lado)
    if (u > .55 && u < .92) { ctx.fillStyle = `rgb(${dark(40)},${dark(42)},${dark(48)})`; ctx.fillRect(col, y0 + h * .34, 1, h * .08); }
    // piernas
    yy0 = y0 + h * bodyBot; yy1 = y0 + h * legBot;
    const legGap = Math.abs(u - .5) < .06;
    if (!legGap && band(0, 0.34, 35, 38, 48)) ctx.fillRect(col, yy0, 1, yy1 - yy0);
    // marcador de daño reciente (flash blanco)
    if (ag._hitFlash > 0 && Math.abs(u - .5) < bodyHalf) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(col, y0 + h * headBot, 1, h * (bodyBot - headBot)); }
  }
  function drawBombStripe(col, y0, h, u, fog) {
    const d = c => (c * fog) | 0;
    const blink = (performance.now() % 600) < 300;
    ctx.fillStyle = `rgb(${d(40)},${d(42)},${d(46)})`; ctx.fillRect(col, y0 + h * .25, 1, h * .6);
    if (Math.abs(u - .5) < .2 && blink) { ctx.fillStyle = "#ff3b3b"; ctx.fillRect(col, y0 + h * .35, 1, h * .12); }
  }

  // ---------- arma en pantalla (viewmodel) ----------
  function drawViewmodel() {
    const w = WEAPONS[player.weapon];
    const cx = W * 0.62, by = H;
    const bob = Math.sin(player.bob) * 4;
    ctx.save();
    ctx.translate(0, bob);
    // muzzle flash
    if (player._flash > 0) {
      ctx.fillStyle = "rgba(255,220,120," + player._flash + ")";
      ctx.beginPath(); ctx.arc(cx + 4, by - 92, 22 * player._flash + 8, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#23262e"; ctx.strokeStyle = "#0b0d12"; ctx.lineWidth = 2;
    if (player.weapon === "pistol") {
      ctx.fillRect(cx - 8, by - 86, 24, 26); ctx.strokeRect(cx - 8, by - 86, 24, 26);
      ctx.fillRect(cx - 4, by - 60, 16, 60); ctx.strokeRect(cx - 4, by - 60, 16, 60);
    } else if (player.weapon === "rifle") {
      ctx.fillRect(cx - 30, by - 96, 70, 14); ctx.strokeRect(cx - 30, by - 96, 70, 14);
      ctx.fillRect(cx - 6, by - 82, 26, 82); ctx.strokeRect(cx - 6, by - 82, 26, 82);
      ctx.fillRect(cx + 28, by - 95, 30, 8);
    } else {
      ctx.fillRect(cx - 34, by - 90, 84, 18); ctx.strokeRect(cx - 34, by - 90, 84, 18);
      ctx.fillRect(cx - 8, by - 74, 30, 74); ctx.strokeRect(cx - 8, by - 74, 30, 74);
    }
    // recarga: bajar el arma
    ctx.restore();
  }

  // ---------- minimapa ----------
  function drawMini() {
    const s = mini.width / MS;
    mctx.clearRect(0, 0, mini.width, mini.height);
    for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
      const c = MAP[y][x];
      if (c === "1" || c === "2" || c === "3") { mctx.fillStyle = "#3a3f4d"; mctx.fillRect(x * s, y * s, s, s); }
      else if (c === "X" || c === "Y") { mctx.fillStyle = "rgba(255,200,60,.4)"; mctx.fillRect(x * s, y * s, s, s); }
    }
    if (bomb.planted) { mctx.fillStyle = (performance.now() % 600 < 300) ? "#ff3b3b" : "#882020"; mctx.fillRect(bomb.site.x * s - 2, bomb.site.y * s - 2, 4, 4); }
    agents.forEach(a => {
      if (!a.alive) return;
      mctx.fillStyle = a.team === "red" ? "#ff465a" : "#4f8cff";
      mctx.beginPath(); mctx.arc(a.x * s, a.y * s, a.isPlayer ? 3.4 : 2.4, 0, 7); mctx.fill();
      if (a.isPlayer) { mctx.strokeStyle = "#fff"; mctx.beginPath(); mctx.moveTo(a.x * s, a.y * s); mctx.lineTo((a.x + Math.cos(a.dir) * .9) * s, (a.y + Math.sin(a.dir) * .9) * s); mctx.stroke(); }
    });
  }

  // ---------- disparo (hitscan) ----------
  function fire(ag) {
    const w = WEAPONS[ag.weapon];
    const now = performance.now();
    if (now < ag.nextFire || now < ag.reloadUntil) return;
    if (ag.mag <= 0) { reload(ag); return; }
    ag.nextFire = now + w.rof; ag.mag--;
    if (ag.isPlayer) { player._flash = 1; player.bob += .6; w.snd(); }
    else blip(WEAPONS[ag.weapon] === WEAPONS.shotgun ? 150 : 360, .05, "sawtooth");
    for (let p = 0; p < w.pellets; p++) {
      const spread = (Math.random() - .5) * w.spread * (ag.isPlayer ? 1 : (2 - DIFF[cfg.diff].acc * 2 + 0.6));
      const ang = ag.dir + spread + (p ? (Math.random() - .5) * w.spread : 0);
      hitscan(ag, ang, w);
    }
    if (ag.isPlayer) updateHUD();
  }
  function hitscan(shooter, ang, w) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let bx = shooter.x, by = shooter.y;
    const stepN = 120; const stepLen = w.range / stepN;
    for (let i = 0; i < stepN; i++) {
      bx += dx * stepLen; by += dy * stepLen;
      if (solid(Math.floor(bx), Math.floor(by))) { spawnBullet(bx, by, true); return; }
      for (const a of agents) {
        if (!a.alive || a.team === shooter.team || a === shooter) continue;
        if ((a.x - bx) ** 2 + (a.y - by) ** 2 < 0.10) {
          let dmg = w.dmg;
          if (!shooter.isPlayer) dmg *= DIFF[cfg.diff].dmg;
          applyDamage(a, dmg, shooter);
          spawnBullet(bx, by, false);
          return;
        }
      }
    }
  }
  function spawnBullet(x, y, wall) { bullets.push({ x, y, life: wall ? .12 : .18, wall }); }

  function applyDamage(a, dmg, by) {
    if (a.armor > 0) { const ab = Math.min(a.armor, dmg * .5); a.armor -= ab; dmg -= ab; }
    a.hp -= dmg; a._hitFlash = 1;
    if (a.isPlayer) { flashDmg(); }
    if (a.hp <= 0 && a.alive) {
      a.alive = false;
      feed(by.isPlayer ? "Tú" : by.name, a.isPlayer ? "Tú" : a.name, a.team);
      blip(90, .25, "sawtooth");
      checkRoundEnd();
    }
    if (a.isPlayer) updateHUD();
  }
  function reload(ag) {
    const w = WEAPONS[ag.weapon];
    if (ag.mag >= w.mag || ag.reserve <= 0) return;
    if (performance.now() < ag.reloadUntil) return;
    ag.reloadUntil = performance.now() + w.reload;
    setTimeout(() => {
      if (!ag.alive) return;
      const need = w.mag - ag.mag;
      if (ag.reserve === Infinity) { ag.mag = w.mag; }
      else { const take = Math.min(need, ag.reserve); ag.mag += take; ag.reserve -= take; }
      if (ag.isPlayer) updateHUD();
    }, w.reload);
    if (ag.isPlayer) { updateHUD(); blip(300, .06, "square"); }
  }
  function switchWeapon(ag, name) {
    if (ag.weapon === name || performance.now() < ag.reloadUntil) return;
    ag.weapon = name; const w = WEAPONS[name];
    if (ag.isPlayer && ag.mag === 0 && ag.reserve === 0) { ag.mag = w.mag; ag.reserve = w.reserve; }
    blip(440, .05, "sine"); if (ag.isPlayer) updateHUD();
  }

  // ---------- IA de bots ----------
  function canSee(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > 14) return false;
    const sx = dx / d, sy = dy / d; let cx = a.x, cy = a.y;
    for (let i = 0; i < d * 8; i++) { cx += sx / 8; cy += sy / 8; if (solid(Math.floor(cx), Math.floor(cy))) return false; }
    return true;
  }
  function nearestEnemy(a) {
    let best = null, bd = 1e9;
    for (const e of agents) { if (e.alive && e.team !== a.team) { const d = (e.x - a.x) ** 2 + (e.y - a.y) ** 2; if (d < bd) { bd = d; best = e; } } }
    return best;
  }
  function botStep(a, dt) {
    if (!a.alive || a.isPlayer) return;
    const enemy = nearestEnemy(a);
    const sees = enemy && canSee(a, enemy);
    if (sees) {
      a.seeT += dt;
      // apuntar gradualmente al enemigo
      const want = Math.atan2(enemy.y - a.y, enemy.x - a.x);
      let diff = want - a.dir; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      a.dir += Math.max(-4 * dt, Math.min(4 * dt, diff));
      const dist = Math.hypot(enemy.x - a.x, enemy.y - a.y);
      // moverse a distancia media
      const desired = a.weapon === "shotgun" ? 2.5 : 5;
      const mv = (dist > desired ? 1 : -0.6) * 1.6 * dt;
      tryMove(a, a.x + Math.cos(a.dir) * mv, a.y + Math.sin(a.dir) * mv);
      // strafe leve
      const st = Math.sin(performance.now() / 600 + a.x) * 1.2 * dt;
      tryMove(a, a.x + Math.cos(a.dir + 1.57) * st, a.y + Math.sin(a.dir + 1.57) * st);
      // disparar si ya apunta bien y reacciona
      if (Math.abs(diff) < 0.14 && a.seeT > DIFF[cfg.diff].react / 1000) {
        if (a.mag <= 0) reload(a); else fire(a);
      }
    } else {
      a.seeT = 0;
      // patrulla: ir hacia objetivo (bomba o spawn enemigo) o vagar
      if (!a.targetCell || Math.hypot(a.targetCell.x - a.x, a.targetCell.y - a.y) < .6) {
        const goals = a.team === "blue" && bomb.planted ? [bomb.site] : bombSites.concat(spawnsFor(a.team === "red" ? "B" : "A"));
        a.targetCell = goals[Math.floor(Math.random() * goals.length)] || { x: 8, y: 8 };
      }
      const want = Math.atan2(a.targetCell.y - a.y, a.targetCell.x - a.x);
      let diff = want - a.dir; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      a.dir += Math.max(-3 * dt, Math.min(3 * dt, diff));
      tryMove(a, a.x + Math.cos(a.dir) * 1.7 * dt, a.y + Math.sin(a.dir) * 1.7 * dt);
      if (a.mag < WEAPONS[a.weapon].mag) reload(a);
      // bots rojos plantan bomba si llegan a un sitio
      botBombLogic(a);
    }
    if (a._hitFlash > 0) a._hitFlash -= dt * 3;
  }
  function botBombLogic(a) {
    if (a.team !== "red" || bomb.planted) return;
    for (const s of bombSites) if (Math.hypot(s.x - a.x, s.y - a.y) < .5) { plantBomb(a, s); break; }
  }
  function tryMove(a, nx, ny) {
    const r = 0.22;
    if (!solid(Math.floor(nx + Math.sign(nx - a.x) * r), Math.floor(a.y))) a.x = nx;
    if (!solid(Math.floor(a.x), Math.floor(ny + Math.sign(ny - a.y) * r))) a.y = ny;
  }

  // ---------- bomba ----------
  function plantBomb(by, site) {
    bomb.planted = true; bomb.by = by; bomb.site = site; bomb.timer = 30;
    showMsg("¡Bomba plantada! 30s", 1.6); blip(660, .15, "square");
    feed("🧨 " + (by.isPlayer ? "Tú" : by.name), "plantó C4", "red");
  }
  function tickBomb(dt) {
    if (!bomb.planted) return;
    bomb.timer -= dt;
    // beep
    if (Math.floor(bomb.timer * 2) !== bomb._lb) { bomb._lb = Math.floor(bomb.timer * 2); blip(880, .03, "sine"); }
    if (bomb.timer <= 0) {
      // explota → gana rojo
      blip(60, .5, "sawtooth"); endRound("red", "💥 La bomba explotó");
      bomb.planted = false;
    }
    // defusa: un azul cerca y manteniendo E (solo el jugador si es azul no aplica; bots azules defusan)
    let defuser = null;
    for (const a of agents) if (a.alive && a.team === "blue" && Math.hypot(a.x - bomb.site.x, a.y - bomb.site.y) < .6) { defuser = a; break; }
    if (defuser) { bomb.defTime += dt; if (bomb.defTime > 5) { endRound("blue", "🛡️ Bomba desactivada"); bomb.planted = false; } }
    else bomb.defTime = 0;
  }

  // ---------- fin de ronda / partida ----------
  function aliveCount(team) { return agents.filter(a => a.alive && a.team === team).length; }
  function checkRoundEnd() {
    if (state !== "play") return;
    if (aliveCount("blue") === 0 && !bomb.planted) endRound("red", "Equipo Azul eliminado");
    else if (aliveCount("red") === 0) { if (bomb.planted) { /* sigue corriendo el timer */ } else endRound("blue", "Equipo Rojo eliminado"); }
  }
  function endRound(winner, why) {
    if (state !== "play") return;
    state = "roundend";
    score[winner]++;
    NovaAudio.play(winner === "red" ? "win" : "over");
    const me = winner === "red";
    if (score.red >= 3 || score.blue >= 3) { endMatch(score.red >= 3); return; }
    ovTitle.textContent = me ? "¡Ronda ganada!" : "Ronda perdida";
    ovTitle.className = me ? "win" : "lose";
    ovMsg.innerHTML = why + "<br>Marcador — Rojo " + score.red + " · Azul " + score.blue;
    ovBtn.textContent = "▶ Siguiente ronda";
    ov.classList.add("show");
    updateHUD();
    ovBtn.onclick = () => { round++; startRound(); };
  }
  function endMatch(won) {
    state = "matchend"; NovaAudio.stopMusic();
    NovaAudio.play(won ? "win" : "over");
    ovTitle.textContent = won ? "🏆 ¡VICTORIA!" : "DERROTA";
    ovTitle.className = won ? "win" : "lose";
    ovMsg.innerHTML = "Resultado final — Rojo " + score.red + " · Azul " + score.blue;
    ovBtn.textContent = "↻ Nueva partida";
    ov.classList.add("show");
    ovBtn.onclick = () => newMatch();
  }

  // ---------- HUD / feed / mensajes ----------
  function updateHUD() {
    $("hp").textContent = Math.max(0, Math.round(player.hp));
    $("armor").textContent = Math.round(player.armor);
    $("wname").textContent = WEAPONS[player.weapon].name.toUpperCase();
    $("ammo").textContent = player.mag;
    $("reserve").textContent = player.reserve === Infinity ? "∞" : player.reserve;
    $("sRed").textContent = score.red; $("sBlue").textContent = score.blue;
    $("sRound").textContent = "Ronda " + round;
  }
  const feedEl = $("feed");
  function feed(killer, victim, victimTeam) {
    const d = document.createElement("div");
    d.style.color = victimTeam === "red" ? "#ff8b97" : "#9cc0ff";
    d.innerHTML = `<b>${killer}</b> ✖ ${victim}`;
    feedEl.appendChild(d); setTimeout(() => d.remove(), 3500);
    while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
  }
  function feedClear() { feedEl.innerHTML = ""; }
  let msg = "", msgT = 0;
  function showMsg(t, dur) { msg = t; msgT = dur; }
  function flashDmg() { const d = $("dmg"); d.classList.add("on"); clearTimeout(flashDmg._t); flashDmg._t = setTimeout(() => d.classList.remove("on"), 90); }

  // ---------- bucle principal ----------
  function loop(t) {
    raf = requestAnimationFrame(loop);
    let dt = (t - lastTime) / 1000; lastTime = t;
    if (dt > 0.05) dt = 0.05;
    if (state === "play") {
      updatePlayer(dt);
      agents.forEach(a => botStep(a, dt));
      tickBomb(dt);
      if (msgT > 0) msgT -= dt;
      // decaimientos
      if (player._flash > 0) player._flash -= dt * 6;
      bullets.forEach(b => b.life -= dt); bullets = bullets.filter(b => b.life > 0);
    }
    render();
  }

  function updatePlayer(dt) {
    if (!player.alive) return;
    const w = WEAPONS[player.weapon];
    const run = (cfg.run && (keys["shift"])) ? 1.7 : 1;
    const sp = 2.6 * run * dt;
    let mvx = 0, mvy = 0;
    if (keys["w"] || keys["arrowup"]) { mvx += Math.cos(player.dir); mvy += Math.sin(player.dir); }
    if (keys["s"] || keys["arrowdown"]) { mvx -= Math.cos(player.dir); mvy -= Math.sin(player.dir); }
    if (keys["a"]) { mvx += Math.cos(player.dir - 1.57); mvy += Math.sin(player.dir - 1.57); }
    if (keys["d"]) { mvx -= Math.cos(player.dir - 1.57); mvy -= Math.sin(player.dir - 1.57); }
    const ml = Math.hypot(mvx, mvy);
    if (ml > 0) { mvx /= ml; mvy /= ml; tryMove(player, player.x + mvx * sp, player.y + mvy * sp); player.bob += sp * 4; }
    // giro por teclado si no hay pointer lock
    if (!mouseLocked) {
      if (keys["arrowleft"]) player.dir -= 2.4 * dt;
      if (keys["arrowright"]) player.dir += 2.4 * dt;
    }
    // disparo automático
    if (keys["_mouse"] && w.auto) fire(player);
    if (player._hitFlash > 0) player._hitFlash -= dt * 3;
  }

  function render() {
    castColumns();
    drawSprites();
    // balas trazadoras (puntos sobre proyección rápida)
    drawViewmodel();
    drawMini();
    // mensaje central
    if (msgT > 0) {
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, H / 2 - 26, W, 40);
      ctx.fillStyle = "#fff"; ctx.font = "700 22px 'Bungee', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(msg, W / 2, H / 2 + 2); ctx.textAlign = "left";
    }
    if (!player.alive && state === "play") {
      ctx.fillStyle = "rgba(120,0,0,.35)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "700 18px 'Chakra Petch',sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Eliminado — tus aliados siguen luchando…", W / 2, H / 2); ctx.textAlign = "left";
    }
  }

  // ---------- input ----------
  document.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    keys[k] = true;
    if (state !== "play") return;
    if (k === "1") switchWeapon(player, "pistol");
    if (k === "2") switchWeapon(player, "rifle");
    if (k === "3") switchWeapon(player, "shotgun");
    if (k === "r") reload(player);
    if (k === "e") tryInteract();
  });
  document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

  function tryInteract() {
    if (!player.alive) return;
    if (!bomb.planted) {
      for (const s of bombSites) if (Math.hypot(s.x - player.x, s.y - player.y) < .6) { plantBomb(player, s); return; }
    }
  }

  cv.addEventListener("click", () => {
    NovaAudio.resume();
    if (state === "play" && !mouseLocked) { cv.requestPointerLock && cv.requestPointerLock(); return; }
  });
  cv.addEventListener("mousedown", e => {
    if (state !== "play" || !player.alive) return;
    keys["_mouse"] = true;
    if (!WEAPONS[player.weapon].auto) fire(player);
  });
  document.addEventListener("mouseup", () => keys["_mouse"] = false);
  document.addEventListener("mousemove", e => {
    if (mouseLocked && state === "play") player.dir += e.movementX * cfg.sens;
  });
  document.addEventListener("pointerlockchange", () => {
    mouseLocked = document.pointerLockElement === cv;
    $("lockHint").classList.toggle("hide", mouseLocked);
  });

  $("restart").onclick = () => { document.exitPointerLock && document.exitPointerLock(); newMatch(); };
  ovBtn.onclick = () => newMatch();

  // ---------- settings ----------
  NovaSettings.mount({
    gameId: "fps",
    extra: [{
      title: "Juego", rows: [
        { type: "select", key: "diff", label: "Dificultad IA", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
        { type: "range", key: "sens", label: "Sensibilidad ratón", default: 0.0024, min: 0.0008, max: 0.006, step: 0.0002, fmt: v => Math.round(v * 1000) },
        { type: "range", key: "fov", label: "Campo de visión", default: 0.66, min: 0.5, max: 0.9, step: 0.02, fmt: v => Math.round(Math.atan(v) * 2 * 57.3) + "°" },
        { type: "toggle", key: "run", label: "Correr con Shift", default: true },
        { type: "keys", label: "Mover", value: "WASD" },
        { type: "keys", label: "Apuntar / disparar", value: "Ratón / Clic" },
        { type: "keys", label: "Armas · Recargar · C4", value: "1·2·3 · R · E" },
      ]
    }],
    onChange: (k, v) => { cfg[k] = (k === "diff" || k === "run") ? v : parseFloat(v); }
  });
  const saved = NovaSettings.loadCfg("fps");
  Object.assign(cfg, { sens: +saved.sens || cfg.sens, diff: saved.diff || cfg.diff, fov: +saved.fov || cfg.fov, run: saved.run !== undefined ? saved.run : cfg.run });

  // ---------- arranque ----------
  ovBtn.onclick = () => { NovaAudio.resume(); newMatch(); };
})();
