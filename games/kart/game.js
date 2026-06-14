/* Turbo Cups — NOVA ARCADE. Racer top-down con física arcade, drift y rivales IA. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const $ = id => document.getElementById(id);

  let cfg = Object.assign({ diff: "normal", laps: 3 }, NovaSettings.loadCfg("kart"));
  const DIFF = { facil: 0.82, normal: 0.92, dificil: 1.0 };

  // ---- circuito: waypoints (centro de pista) en bucle ----
  const WP = [
    [120, 340], [120, 120], [260, 90], [340, 160], [460, 110], [560, 160],
    [560, 320], [440, 360], [360, 300], [260, 350], [200, 360],
  ];
  const ROAD_W = 56;
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy; return { d: Math.hypot(px - cx, py - cy), t };
  }
  function onRoad(x, y) {
    let best = 1e9; for (let i = 0; i < WP.length; i++) { const a = WP[i], b = WP[(i + 1) % WP.length]; best = Math.min(best, segDist(x, y, a[0], a[1], b[0], b[1]).d); }
    return best < ROAD_W / 2 + 6;
  }

  let cars, state = "menu", t0, elapsed = 0, raf = null, keys = {};
  function mkCar(x, y, ang, color, isPlayer) {
    return { x, y, ang, vx: 0, vy: 0, speed: 0, color, isPlayer, lap: 0, wp: 0, prog: 0, finished: false, drift: 0, place: 1 };
  }
  function reset() {
    cars = [];
    const sx = WP[0][0], sy = WP[0][1];
    cars.push(mkCar(sx - 10, sy - 18, -Math.PI / 2, "#ff3b3b", true));
    const cols = ["#3bff9e", "#ffd23b", "#7a5cff"];
    for (let i = 0; i < 3; i++) cars.push(mkCar(sx + 14 + (i % 2) * 8, sy - 18 + i * 16, -Math.PI / 2, cols[i], false));
    elapsed = 0;
  }
  function start() { if (state === "play") return; reset(); state = "play"; ov.classList.remove("show"); NovaAudio.resume(); if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("neon", 130); t0 = performance.now(); loop(t0); }

  function stepCar(c, dt) {
    if (c.finished) { c.speed *= 0.95; }
    else if (c.isPlayer) {
      const up = keys["arrowup"] || keys["w"], dn = keys["arrowdown"] || keys["s"];
      const lf = keys["arrowleft"] || keys["a"], rt = keys["arrowright"] || keys["d"];
      const accel = up ? 240 : dn ? -150 : 0;
      c.speed += accel * dt; c.speed *= 0.985;
      const steer = (lf ? -1 : 0) + (rt ? 1 : 0);
      const grip = keys[" "] ? 2.4 : 1.0;
      c.ang += steer * 2.6 * dt * Math.min(1, Math.abs(c.speed) / 40) * grip;
      c.drift = keys[" "] && steer ? Math.min(1, c.drift + dt * 3) : Math.max(0, c.drift - dt * 4);
    } else {
      // IA: apuntar al siguiente waypoint
      const tgt = WP[(c.wp + 1) % WP.length];
      const desired = Math.atan2(tgt[1] - c.y, tgt[0] - c.x);
      let d = desired - c.ang; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
      c.ang += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
      c.speed += 200 * DIFF[cfg.diff] * dt; c.speed *= 0.985;
    }
    const maxS = 200 * (c.isPlayer ? 1 : DIFF[cfg.diff]);
    c.speed = Math.max(-90, Math.min(maxS, c.speed));
    // off-road frena
    const nx = c.x + Math.cos(c.ang) * c.speed * dt, ny = c.y + Math.sin(c.ang) * c.speed * dt;
    if (!onRoad(nx, ny)) { c.speed *= 0.92; }
    c.x += Math.cos(c.ang) * c.speed * dt; c.y += Math.sin(c.ang) * c.speed * dt;
    c.x = Math.max(8, Math.min(W - 8, c.x)); c.y = Math.max(8, Math.min(H - 8, c.y));
    // progreso por waypoints (para vueltas y posición)
    const nextWp = (c.wp + 1) % WP.length, tw = WP[nextWp];
    if (Math.hypot(tw[0] - c.x, tw[1] - c.y) < ROAD_W) {
      c.wp = nextWp; if (nextWp === 0) { c.lap++; if (c.isPlayer) NovaAudio.play("point"); if (c.lap >= cfg.laps && !c.finished) { c.finished = true; c.finishT = elapsed; } }
    }
    c.prog = c.lap * WP.length + c.wp + (1 - Math.hypot(tw[0] - c.x, tw[1] - c.y) / 200);
  }

  function loop(now) {
    let dt = (now - (loop._l || now)) / 1000; loop._l = now; if (dt > 0.05) dt = 0.05;
    if (state === "play") {
      elapsed += dt;
      cars.forEach(c => stepCar(c, dt));
      // colisiones simples entre karts
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 22 && d > 0) { const p = (22 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; a.speed *= 0.9; b.speed *= 0.9; }
      }
      // posiciones
      const sorted = [...cars].sort((a, b) => b.prog - a.prog); sorted.forEach((c, i) => c.place = i + 1);
      const p = cars[0];
      $("pos").textContent = p.place + "/4"; $("lap").textContent = Math.min(cfg.laps, p.lap + 1) + "/" + cfg.laps;
      $("time").textContent = elapsed.toFixed(1); $("speed").textContent = Math.round(Math.abs(p.speed) * 0.9);
      if (cars.every(c => c.finished)) finish();
    }
    draw();
    if (state === "play") raf = requestAnimationFrame(loop);
  }

  function finish() {
    state = "end"; NovaAudio.stopMusic();
    const me = cars[0];
    const pos = me.place;
    NovaAudio.play(pos === 1 ? "win" : "over");
    ovTitle.textContent = pos === 1 ? "🏆 ¡1er lugar!" : pos + "º lugar";
    ovTitle.className = pos === 1 ? "win" : "lose";
    ovMsg.textContent = "Tu tiempo: " + (me.finishT || elapsed).toFixed(1) + "s";
    ovBtn.textContent = "↻ Otra carrera"; ov.classList.add("show");
    ovBtn.onclick = start;
  }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function draw() {
    ctx.fillStyle = css("--bg-2") || "#1a2e1a"; ctx.fillStyle = "#1f3a24"; ctx.fillRect(0, 0, W, H);
    // pista
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "#2b2f38"; ctx.lineWidth = ROAD_W; ctx.beginPath();
    WP.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
    // bordes
    ctx.strokeStyle = "#e8e8ef"; ctx.lineWidth = 3; ctx.setLineDash([10, 10]); ctx.stroke(); ctx.setLineDash([]);
    // línea de meta
    const a = WP[0], b = WP[WP.length - 1];
    ctx.save(); ctx.translate(a[0], a[1]); const ang = Math.atan2(a[1] - WP[1][1], a[0] - WP[1][0]); ctx.rotate(ang + Math.PI / 2);
    for (let i = -ROAD_W / 2; i < ROAD_W / 2; i += 8) for (let j = 0; j < 2; j++) { ctx.fillStyle = ((i / 8 + j) % 2) ? "#fff" : "#222"; ctx.fillRect(i, j * 8 - 8, 8, 8); }
    ctx.restore();
    // karts
    cars.forEach(c => drawCar(c));
    // minimapa de posición ya en HUD
  }
  function drawCar(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
    if (c.drift > 0.3) { ctx.fillStyle = "rgba(120,120,120,.4)"; ctx.fillRect(-14, -7, 6, 14); }
    ctx.fillStyle = c.color; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1.5;
    roundRect(-11, -8, 22, 16, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)"; roundRect(2, -5, 7, 10, 2); ctx.fill(); // parabrisas
    ctx.fillStyle = "#222"; ctx.fillRect(-12, -10, 5, 4); ctx.fillRect(-12, 6, 5, 4); ctx.fillRect(7, -10, 5, 4); ctx.fillRect(7, 6, 5, 4); // ruedas
    if (c.isPlayer) { ctx.fillStyle = "#fff"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("▲", 0, 1); }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // controles táctiles
  document.querySelectorAll("#dpad [data-k]").forEach(b => {
    const k = "arrow" + b.dataset.k;
    const on = e => { e.preventDefault(); keys[k] = true; }, off = e => { e.preventDefault(); keys[k] = false; };
    b.addEventListener("touchstart", on); b.addEventListener("touchend", off);
    b.addEventListener("mousedown", on); b.addEventListener("mouseup", off); b.addEventListener("mouseleave", off);
  });
  document.addEventListener("keydown", e => { const k = e.key.toLowerCase(); if (k.startsWith("arrow") || k === " ") e.preventDefault(); keys[k] = true; });
  document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
  $("restart").onclick = start; ovBtn.onclick = start;

  NovaSettings.mount({
    gameId: "kart", onChange: (k, v) => { cfg[k] = (k === "diff") ? v : +v; }, extra: [
      { title: "Carrera", rows: [
        { type: "select", key: "diff", label: "Dificultad rivales", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
        { type: "select", key: "laps", label: "Vueltas", default: 3, options: [{ value: 2, label: "2" }, { value: 3, label: "3" }, { value: 5, label: "5" }] },
        { type: "keys", label: "Conducir", value: "↑↓←→ / WASD" },
        { type: "keys", label: "Derrape", value: "Espacio" },
      ]},
    ]
  });
  cfg.laps = +cfg.laps || 3;
  document.addEventListener("nova-theme-change", draw);
  reset(); draw();
})();
