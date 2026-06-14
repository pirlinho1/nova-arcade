/* Snake — NOVA ARCADE (v2)
   Movimiento interpolado suave (rAF), cuerpo continuo con cabeza animada,
   partículas, popups, screen-shake, comida bonus, velocidad progresiva y skins. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"),
    ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), bestEl = document.getElementById("best");

  const BASE = { facil: 7, normal: 10, dificil: 14 };           // pasos/seg base
  const SKINS = {
    verde: { a: "#b6ff3b", b: "#3ba33a", head: "#e6ffb0" },
    cian: { a: "#5ce0ff", b: "#0e84b4", head: "#c4f4ff" },
    ambar: { a: "#ffd23b", b: "#e07a1a", head: "#ffe9a6" },
    rosa: { a: "#ff6bb0", b: "#d11e6a", head: "#ffc0dd" },
  };
  const defaults = { speed: "normal", grid: "20", wrap: false, glow: true, showGrid: true, skin: "verde" };
  let cfg = Object.assign({}, defaults, NovaSettings.loadCfg("snake"));

  let cols, cell, cells, oldCells, dir, dirQueue, food, score, combo = 0, lastEat = 0;
  let best = +(localStorage.getItem("snake-best") || 0);
  let state = "idle";              // idle | play | pause | over
  let acc = 0, tickT = 0, lastFrame = 0, raf = null;
  let particles = [], popups = [], shake = 0, deadT = 0;
  bestEl.textContent = best;

  // ---- audio local (respeta volúmenes de NovaAudio) ----
  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._snA || (window._snA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, type, v, slide) {
    try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(slide, A.currentTime + d);
      const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4);
      g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d);
      o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02);
    } catch (e) {}
  }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  const skin = () => SKINS[cfg.skin] || SKINS.verde;
  function curSpeed() { return Math.min(22, BASE[cfg.speed] + Math.floor(score / 5)); }

  function setup() {
    cols = parseInt(cfg.grid);
    cell = Math.floor(440 / cols);
    cv.width = cv.height = cols * cell;
    const mid = Math.floor(cols / 2);
    cells = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    oldCells = cells.map(c => ({ ...c }));
    dir = { x: 1, y: 0 }; dirQueue = [];
    score = 0; combo = 0; scoreEl.textContent = 0;
    particles = []; popups = []; shake = 0; deadT = 0; acc = 0; tickT = 0;
    placeFood();
  }
  function placeFood() {
    let f; do { f = { x: (Math.random() * cols) | 0, y: (Math.random() * cols) | 0 }; } while (cells.some(s => s.x === f.x && s.y === f.y));
    f.bonus = Math.random() < 0.16; f.born = performance.now(); f.ttl = f.bonus ? 6000 : Infinity; food = f;
  }

  function start() {
    if (state === "play") return;
    if (state === "over" || state === "idle") setup();
    state = "play"; ov.classList.remove("show"); actx();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 112);
    lastFrame = performance.now(); ensure();
  }
  function ensure() { if (raf == null) raf = requestAnimationFrame(frame); }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - lastFrame) / 1000; lastFrame = now; if (dt > .1) dt = .1;
    if (state === "play") {
      const interval = 1 / curSpeed();
      acc += dt;
      while (acc >= interval) { acc -= interval; step(); }
      tickT = acc / interval;
    }
    // efectos
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
    popups.forEach(p => { p.y -= 26 * dt; p.life -= dt; });
    popups = popups.filter(p => p.life > 0);
    if (shake > 0) shake -= dt * 3;
    if (state === "over") deadT += dt;
    render();
    if (state !== "play" && !particles.length && !popups.length && shake <= 0 && state !== "pause") { /* sigue por overlay */ }
  }

  function step() {
    // aplicar giro encolado válido
    while (dirQueue.length) { const nd = dirQueue.shift(); if (!(nd.x === -dir.x && nd.y === -dir.y) && !(nd.x === dir.x && nd.y === dir.y)) { dir = nd; break; } }
    oldCells = cells.map(c => ({ ...c }));
    const head = { x: cells[0].x + dir.x, y: cells[0].y + dir.y };
    if (cfg.wrap) { head.x = (head.x + cols) % cols; head.y = (head.y + cols) % cols; }
    else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= cols) return die();
    if (cells.some((s, i) => i < cells.length - 1 && s.x === head.x && s.y === head.y)) return die();
    cells.unshift(head);
    if (head.x === food.x && head.y === food.y) eat();
    else cells.pop();
    // expirar bonus
    if (food.bonus && performance.now() - food.born > food.ttl) placeFood();
  }
  function eat() {
    const now = performance.now();
    combo = (now - lastEat < 2600) ? combo + 1 : 0; lastEat = now;
    const gain = food.bonus ? 5 : 1;
    score += gain; scoreEl.textContent = score;
    const px = (food.x + .5) * cell, py = (food.y + .5) * cell;
    burst(px, py, food.bonus ? "#ffd24d" : skin().a, food.bonus ? 22 : 12);
    popups.push({ x: px, y: py, txt: "+" + gain + (combo > 1 ? " x" + (combo + 1) : ""), life: .9, c: food.bonus ? "#ffd24d" : "#fff" });
    shake = Math.min(1, .35 + (food.bonus ? .4 : 0));
    const base = 520 + Math.min(8, combo) * 60;
    tone(base, .08, "square", .45, base * 1.5); if (food.bonus) setTimeout(() => tone(1180, .12, "triangle", .5), 70);
    placeFood();
  }
  function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 60 + Math.random() * 160; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: .5 + Math.random() * .4, c: color, r: 2 + Math.random() * 3 }); } }

  function die() {
    state = "over"; deadT = 0; shake = 1; NovaAudio.stopMusic();
    tone(300, .18, "sawtooth", .5, 90); setTimeout(() => tone(160, .25, "sawtooth", .4, 70), 130);
    cells.forEach((s, i) => { if (i % 2 === 0) burst((s.x + .5) * cell, (s.y + .5) * cell, skin().a, 4); });
    if (score > best) { best = score; localStorage.setItem("snake-best", best); bestEl.textContent = best; }
    setTimeout(() => {
      if (state !== "over") return;
      ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose";
      ovMsg.innerHTML = `Puntos: <b>${score}</b> · Récord: <b>${best}</b>`;
      ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show");
    }, 650);
  }

  // ---- render ----
  function lerp(a, b, t) { return a + (b - a) * t; }
  function segPos(i) {
    const to = cells[i], from = oldCells[Math.min(i, oldCells.length - 1)] || to;
    if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) return { x: (to.x + .5) * cell, y: (to.y + .5) * cell, snap: true };
    return { x: (lerp(from.x, to.x, tickT) + .5) * cell, y: (lerp(from.y, to.y, tickT) + .5) * cell };
  }
  function render() {
    const W = cv.width, H = cv.height;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 8 * shake, (Math.random() - .5) * 8 * shake);
    // fondo
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0e1320"); bg.addColorStop(1, "#0a0d16");
    ctx.fillStyle = bg; ctx.fillRect(-12, -12, W + 24, H + 24);
    if (cfg.showGrid) { ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1; for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke(); } }

    drawFood();

    // cuerpo como polilínea gruesa con cortes en los wraps
    const pts = cells.map((_, i) => segPos(i));
    const sk = skin();
    const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
    grad.addColorStop(0, sk.a); grad.addColorStop(1, sk.b);
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = grad; ctx.lineWidth = cell * 0.82;
    if (cfg.glow) { ctx.shadowColor = sk.a; ctx.shadowBlur = 12; }
    ctx.beginPath(); let started = false;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].snap && i > 0) { ctx.stroke(); ctx.beginPath(); started = false; }
      if (!started) { ctx.moveTo(pts[i].x, pts[i].y); started = true; } else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    // brillo dorsal
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = cell * 0.3; ctx.beginPath(); started = false;
    for (let i = 0; i < pts.length; i++) { if (pts[i].snap && i > 0) { ctx.stroke(); ctx.beginPath(); started = false; } if (!started) { ctx.moveTo(pts[i].x, pts[i].y); started = true; } else ctx.lineTo(pts[i].x, pts[i].y); }
    ctx.stroke();

    drawHead(pts[0]);
    drawParticles(); drawPopups();
    ctx.restore();
  }
  function drawHead(p) {
    const sk = skin(), r = cell * 0.46;
    ctx.fillStyle = sk.head; if (cfg.glow) { ctx.shadowColor = sk.a; ctx.shadowBlur = 14; }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    // ojos según dirección
    const ang = Math.atan2(dir.y, dir.x), ox = Math.cos(ang), oy = Math.sin(ang);
    const ex = -oy, ey = ox; const er = r * 0.26;
    [[ex, ey], [-ex, -ey]].forEach(([sx, sy]) => {
      const cx = p.x + ox * r * .35 + sx * r * .42, cy = p.y + oy * r * .35 + sy * r * .42;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, er, 0, 7); ctx.fill();
      ctx.fillStyle = "#101418"; ctx.beginPath(); ctx.arc(cx + ox * er * .4, cy + oy * er * .4, er * .55, 0, 7); ctx.fill();
    });
    // lengua intermitente
    if (state === "play" && Math.floor(performance.now() / 260) % 4 === 0) {
      ctx.strokeStyle = "#ff4b6e"; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(p.x + ox * r, p.y + oy * r); ctx.lineTo(p.x + ox * r * 1.7, p.y + oy * r * 1.7); ctx.stroke();
    }
  }
  function drawFood() {
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    const x = (food.x + .5) * cell, y = (food.y + .5) * cell, r = cell * 0.33 * pulse;
    if (food.bonus) {
      // diamante dorado con destello
      ctx.save(); ctx.translate(x, y); ctx.rotate(performance.now() / 600);
      ctx.shadowColor = "#ffd24d"; ctx.shadowBlur = 16; ctx.fillStyle = "#ffd24d";
      ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(-r * .25, -r * .3, r * .22, 0, 7); ctx.fill(); ctx.restore();
      const left = food.ttl - (performance.now() - food.born);
      if (left < 2200) { ctx.strokeStyle = "rgba(255,210,77," + (0.4 + Math.sin(performance.now() / 90) * .3) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.stroke(); }
    } else {
      ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = cfg.glow ? 12 : 0;
      ctx.fillStyle = "#e8332f"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .32, r * .22, 0, 7); ctx.fill();
      ctx.strokeStyle = "#3ba33a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .4, y - r * 1.4); ctx.stroke();
    }
  }
  function drawParticles() { particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 1.6); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }); ctx.globalAlpha = 1; }
  function drawPopups() { popups.forEach(p => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.font = "700 16px 'Chakra Petch', sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.txt, p.x, p.y); }); ctx.globalAlpha = 1; }

  // ---- control ----
  function pause() {
    if (state === "play") { state = "pause"; NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); }
    else if (state === "pause") { ov.classList.remove("show"); state = "play"; if (!NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 112); lastFrame = performance.now(); }
  }
  function turn(d) {
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const nd = map[d]; if (!nd) return;
    if (state === "idle" || state === "over") { start(); }
    if (dirQueue.length < 2) dirQueue.push(nd);
  }
  const keymap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  document.addEventListener("keydown", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === " " || k === "p") { e.preventDefault(); pause(); return; }
    const d = keymap[k]; if (d) { e.preventDefault(); turn(d); }
  });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => turn(b.dataset.dir));
  let tsx, tsy;
  cv.addEventListener("touchstart", e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy; if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? "right" : "left"); else turn(dy > 0 ? "down" : "up"); });
  ovBtn.onclick = () => { if (state === "pause") pause(); else start(); };
  document.getElementById("pause").onclick = pause;
  document.getElementById("restart").onclick = () => { state = "over"; setup(); start(); };

  NovaSettings.mount({
    gameId: "snake",
    onChange: (k) => { cfg = Object.assign(cfg, NovaSettings.loadCfg("snake")); if (k === "grid") { state = "idle"; setup(); ovTitle.textContent = "SNAKE"; ovTitle.className = ""; ovMsg.textContent = "Flechas o WASD para moverte. Come, crece, no choques."; ovBtn.textContent = "▶ Jugar"; ov.classList.add("show"); ensure(); } },
    extra: [
      { title: "Juego", rows: [
        { type: "select", key: "speed", label: "Dificultad", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
        { type: "select", key: "grid", label: "Tamaño del tablero", default: "20", options: [{ value: "14", label: "Pequeño" }, { value: "20", label: "Mediano" }, { value: "28", label: "Grande" }] },
        { type: "toggle", key: "wrap", label: "Atravesar paredes", default: false, hint: "sin morir en el borde" },
      ]},
      { title: "Aspecto", rows: [
        { type: "select", key: "skin", label: "Piel", default: "verde", options: [{ value: "verde", label: "Verde" }, { value: "cian", label: "Cian" }, { value: "ambar", label: "Ámbar" }, { value: "rosa", label: "Rosa" }] },
        { type: "toggle", key: "glow", label: "Brillo neón", default: true },
        { type: "toggle", key: "showGrid", label: "Cuadrícula", default: true },
      ]},
      { title: "Controles", rows: [
        { type: "keys", label: "Mover", value: "Flechas / WASD / swipe" },
        { type: "keys", label: "Pausa", value: "Espacio / P" },
        { type: "info", label: "Bonus 💎", value: "+5 puntos (temporal)" },
      ]},
    ],
  });
  document.addEventListener("nova-theme-change", render);
  setup(); render();
})();
