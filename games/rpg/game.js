/* Soul Tale — NOVA ARCADE. Combate narrativo por turnos con fase de esquiva (estilo Undertale). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const $ = id => document.getElementById(id);
  const actsEl = $("acts");

  const ENEMIES = [
    { name: "Floweling", maxhp: 60, atk: 4, gold: 8, spareAt: 0.4, color: "#ffd23b", quotes: ["te observa con curiosidad", "tararea una canción", "parece menos hostil"], act: "Le hablas con dulzura." },
    { name: "Glob", maxhp: 90, atk: 6, gold: 14, spareAt: 0.5, color: "#3bff9e", quotes: ["se sacude, gelatinoso", "te salpica sin querer", "se está calmando"], act: "Imitas su forma. Se ríe." },
    { name: "Sentry", maxhp: 130, atk: 7, gold: 22, spareAt: 0.6, color: "#7a5cff", quotes: ["escanea tu alma", "baja la guardia", "ya no te ve como amenaza"], act: "Saludas con respeto militar." },
  ];

  let cfg = NovaSettings.loadCfg("rpg");
  let player, enemyIdx, enemy, sel = 0, phase = "menu", soul, bullets, dodgeT, mercy, msg, msgT, raf = null, keys = {};
  const ACTS = ["fight", "act", "mercy"];

  // caja de esquiva
  const BOX = { x: W / 2 - 130, y: 150, w: 260, h: 150 };

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._rpgA || (window._rpgA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.value = f; const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function newGame() { player = { hp: 20, maxhp: 20, lvl: 1, gold: 0, atk: 0 }; enemyIdx = 0; loadEnemy(); updateHUD(); }
  function loadEnemy() {
    enemy = Object.assign({}, ENEMIES[enemyIdx]); enemy.hp = enemy.maxhp; mercy = 0;
    phase = "menu"; sel = 0; setSel(); say(enemy.name + " aparece.", 2);
    if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("chip", 110);
  }
  function start() { ov.classList.remove("show"); newGame(); if (raf == null) loop(performance.now()); }
  function updateHUD() { $("hp").textContent = Math.max(0, player.hp); $("lvl").textContent = player.lvl; $("gold").textContent = player.gold; }
  function say(t, d) { msg = t; msgT = d || 2.2; }

  function setSel() { actsEl.querySelectorAll(".btn").forEach((b, i) => b.classList.toggle("sel", i === sel)); }

  function choose() {
    if (phase !== "menu") return;
    const a = ACTS[sel];
    if (a === "fight") {
      // golpe con factor de "timing" aleatorio leve
      const dmg = 8 + player.lvl * 4 + (Math.random() * 6 | 0);
      enemy.hp -= dmg; tone(220, .08, "square", .5); flash = 8;
      say("Golpeas a " + enemy.name + " por " + dmg + ".", 1.6);
      if (enemy.hp <= 0) return victory(false);
    } else if (a === "act") {
      mercy = Math.min(1, mercy + 0.34); tone(660, .1, "sine", .4);
      say(enemy.name + " " + enemy.quotes[Math.min(2, Math.floor(mercy * 3))] + ".", 1.8);
    } else if (a === "mercy") {
      if (mercy >= enemy.spareAt || enemy.hp <= enemy.maxhp * 0.25) { return victory(true); }
      else { say(enemy.name + " no quiere ser perdonado… aún.", 1.8); tone(330, .12, "triangle", .35); }
    }
    // turno del enemigo: fase de esquiva
    setTimeout(() => startDodge(), 700);
  }

  function startDodge() {
    if (player.hp <= 0) return;
    phase = "dodge"; dodgeT = 4.5; bullets = [];
    soul = { x: W / 2, y: BOX.y + BOX.h / 2, r: 6 };
    say("¡Esquiva! (flechas/WASD)", 1.2);
  }
  function spawnBullet() {
    const side = (Math.random() * 4) | 0; let x, y, vx, vy; const sp = 90 + enemy.atk * 16;
    if (side === 0) { x = BOX.x; y = BOX.y + Math.random() * BOX.h; vx = sp; vy = (Math.random() - .5) * 40; }
    else if (side === 1) { x = BOX.x + BOX.w; y = BOX.y + Math.random() * BOX.h; vx = -sp; vy = (Math.random() - .5) * 40; }
    else if (side === 2) { x = BOX.x + Math.random() * BOX.w; y = BOX.y; vx = (Math.random() - .5) * 40; vy = sp; }
    else { x = BOX.x + Math.random() * BOX.w; y = BOX.y + BOX.h; vx = (Math.random() - .5) * 40; vy = -sp; }
    bullets.push({ x, y, vx, vy, r: 5 });
  }

  let flash = 0, bulletTimer = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - (loop._l || now)) / 1000; loop._l = now; if (dt > .05) dt = .05;
    if (phase === "dodge") {
      dodgeT -= dt; bulletTimer -= dt;
      if (bulletTimer <= 0) { spawnBullet(); bulletTimer = Math.max(0.12, 0.5 - enemy.atk * 0.04); }
      const sp = 150;
      if (keys["arrowleft"] || keys["a"]) soul.x -= sp * dt; if (keys["arrowright"] || keys["d"]) soul.x += sp * dt;
      if (keys["arrowup"] || keys["w"]) soul.y -= sp * dt; if (keys["arrowdown"] || keys["s"]) soul.y += sp * dt;
      soul.x = Math.max(BOX.x + soul.r, Math.min(BOX.x + BOX.w - soul.r, soul.x));
      soul.y = Math.max(BOX.y + soul.r, Math.min(BOX.y + BOX.h - soul.r, soul.y));
      bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
      bullets = bullets.filter(b => b.x > BOX.x - 20 && b.x < BOX.x + BOX.w + 20 && b.y > BOX.y - 20 && b.y < BOX.y + BOX.h + 20);
      for (const b of bullets) if (Math.hypot(b.x - soul.x, b.y - soul.y) < b.r + soul.r) { hitPlayer(); b.x = -999; }
      if (dodgeT <= 0) { phase = "menu"; sel = 0; setSel(); say("Tu turno.", 1); }
    }
    if (msgT > 0) msgT -= dt; if (flash > 0) flash--;
    draw();
  }
  function hitPlayer() {
    if (phase !== "dodge") return;
    player.hp -= 1 + (enemy.atk / 3 | 0); tone(160, .12, "sawtooth", .4); flash = 6; updateHUD();
    if (player.hp <= 0) gameOver();
  }

  function victory(spared) {
    phase = "win"; player.gold += enemy.gold; player.lvl++; updateHUD();
    NovaAudio.play("win"); tone(700, .15, "triangle", .5);
    enemyIdx++;
    if (enemyIdx >= ENEMIES.length) {
      NovaAudio.stopMusic();
      ovTitle.textContent = "🌟 FINAL"; ovTitle.className = "win";
      ovMsg.textContent = (spared ? "Elegiste la piedad. " : "") + "Has superado a todos. Nivel " + player.lvl + ", " + player.gold + " de oro.";
      ovBtn.textContent = "↻ Jugar de nuevo"; ov.classList.add("show"); ovBtn.onclick = start; return;
    }
    say((spared ? "Perdonaste a " : "Venciste a ") + enemy.name + ". +" + enemy.gold + " oro", 2.2);
    setTimeout(loadEnemy, 1400);
  }
  function gameOver() {
    phase = "over"; NovaAudio.stopMusic(); NovaAudio.play("over");
    ovTitle.textContent = "💔 Tu alma se rompió"; ovTitle.className = "lose";
    ovMsg.textContent = "Llegaste al nivel " + player.lvl + ". Inténtalo de nuevo.";
    ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show"); ovBtn.onclick = start;
  }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function draw() {
    ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);
    if (flash > 0) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(0, 0, W, H); }
    // enemigo (criatura simple)
    if (enemy) {
      const ex = W / 2, ey = 86, bob = Math.sin(performance.now() / 400) * 4;
      ctx.fillStyle = enemy.color; ctx.beginPath(); ctx.arc(ex, ey + bob, 36, 0, 7); ctx.fill();
      ctx.fillStyle = "#0b0d12"; ctx.beginPath(); ctx.arc(ex - 12, ey + bob - 4, 5, 0, 7); ctx.arc(ex + 12, ey + bob - 4, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#0b0d12"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey + bob + 8, 12, 0.1, Math.PI - 0.1); ctx.stroke();
      // barra de vida del enemigo
      ctx.fillStyle = "#333"; ctx.fillRect(ex - 50, ey + 44, 100, 8);
      ctx.fillStyle = "#ff3b3b"; ctx.fillRect(ex - 50, ey + 44, 100 * Math.max(0, enemy.hp / enemy.maxhp), 8);
      // medidor de piedad
      ctx.fillStyle = "#1c2438"; ctx.fillRect(ex - 50, ey + 56, 100, 5);
      ctx.fillStyle = "#ffd23b"; ctx.fillRect(ex - 50, ey + 56, 100 * mercy, 5);
      ctx.fillStyle = "#888"; ctx.font = "9px 'Chakra Petch'"; ctx.textAlign = "left"; ctx.fillText("PIEDAD", ex - 50, ey + 70);
    }
    // caja de esquiva (siempre visible como marco de batalla)
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);
    if (phase === "dodge") {
      bullets.forEach(b => { ctx.fillStyle = "#ff5b6e"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); });
      // alma
      ctx.fillStyle = "#ff3b6e"; drawHeart(soul.x, soul.y, soul.r);
      ctx.fillStyle = "#fff"; ctx.font = "11px 'Chakra Petch'"; ctx.textAlign = "right"; ctx.fillText(dodgeT.toFixed(1) + "s", BOX.x + BOX.w, BOX.y - 6);
    } else if (phase === "menu") {
      ctx.fillStyle = "#9aa"; ctx.font = "13px 'Chakra Petch'"; ctx.textAlign = "center";
      ctx.fillText("Elige una acción abajo · ←→ y Enter", W / 2, BOX.y + BOX.h / 2);
    }
    // mensaje
    if (msgT > 0 && msg) { ctx.fillStyle = "#fff"; ctx.font = "14px 'Chakra Petch'"; ctx.textAlign = "center"; ctx.fillText(msg, W / 2, H - 16); }
  }
  function drawHeart(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(0, s * 0.7); ctx.bezierCurveTo(s, -s * 0.3, s * 0.5, -s, 0, -s * 0.3); ctx.bezierCurveTo(-s * 0.5, -s, -s, -s * 0.3, 0, s * 0.7); ctx.fill(); ctx.restore(); }

  // ---- input ----
  function pick(i) { sel = (i + ACTS.length) % ACTS.length; setSel(); tone(500, .03, "sine", .3); }
  actsEl.querySelectorAll(".btn").forEach((b, i) => b.onclick = () => { sel = i; setSel(); choose(); });
  document.addEventListener("keydown", e => {
    const k = e.key.toLowerCase(); keys[k] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (phase === "menu") { if (k === "arrowleft") pick(sel - 1); if (k === "arrowright") pick(sel + 1); if (k === "enter" || k === " ") choose(); }
  });
  document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

  NovaSettings.mount({ gameId: "rpg", extra: [
    { title: "Cómo jugar", rows: [
      { type: "info", label: "LUCHAR", value: "Daño al enemigo" },
      { type: "info", label: "ACTUAR", value: "Sube la PIEDAD" },
      { type: "info", label: "PIEDAD", value: "Perdona si la barra basta" },
      { type: "keys", label: "Menú · Esquivar", value: "←→/Enter · WASD" },
    ]},
  ]});
  ovBtn.onclick = start;
  draw();
})();
