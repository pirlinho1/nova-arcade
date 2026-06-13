/* Blocks (Tetris) — NOVA ARCADE */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const nx = document.getElementById("next"), nctx = nx.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), linesEl = document.getElementById("lines"), levelEl = document.getElementById("level");
  const COLS = 10, ROWS = 20, CELL = 30;

  const SHAPES = {
    I: [[1,1,1,1]], O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1]], S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]], J: [[1,0,0],[1,1,1]], L: [[0,0,1],[1,1,1]]
  };
  const COLORS = { I: "--accent", O: "--accent-3", T: "--accent-2", S: "--accent-3", Z: "--accent-2", J: "--accent", L: "--accent-2" };
  const KEYS = Object.keys(SHAPES);

  let cfg = Object.assign({ startLevel: "1", ghost: true, showGrid: true, glow: true }, NovaSettings.loadCfg("tetris"));
  let board, cur, next, score, lines, level, dropTimer = null, dropMs, state = "idle";
  let best = +(localStorage.getItem("tetris-best") || 0);

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function empty() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }
  function rand() { const k = KEYS[(Math.random() * KEYS.length) | 0]; return { k, m: SHAPES[k].map(r => r.slice()), x: 3, y: 0 }; }
  function rotate(m) { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
  function collide(p, m = p.m, ox = p.x, oy = p.y) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++)
      if (m[y][x]) { const nxp = ox + x, nyp = oy + y; if (nxp < 0 || nxp >= COLS || nyp >= ROWS || (nyp >= 0 && board[nyp][nxp])) return true; }
    return false;
  }
  function merge() { cur.m.forEach((r, y) => r.forEach((v, x) => { if (v) board[cur.y + y][cur.x + x] = cur.k; })); }

  function setup() {
    board = empty(); score = 0; lines = 0; level = parseInt(cfg.startLevel);
    next = rand(); spawn(); updateHUD(); dropMs = speedFor(level);
  }
  function speedFor(l) { return Math.max(90, 800 - (l - 1) * 70); }
  function spawn() { cur = next; cur.x = ((COLS / 2) | 0) - ((cur.m[0].length / 2) | 0); cur.y = 0; next = rand(); if (collide(cur)) gameOver(); drawNext(); }
  function updateHUD() { scoreEl.textContent = score; linesEl.textContent = lines; levelEl.textContent = level; }

  function start() {
    if (state === "play") return;
    if (state !== "pause") setup();
    state = "play"; ov.classList.remove("show"); NovaAudio.resume();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 120);
    schedule(); draw();
  }
  function schedule() { clearInterval(dropTimer); dropTimer = setInterval(() => softDrop(), dropMs); }

  function softDrop() {
    if (state !== "play") return;
    if (!collide(cur, cur.m, cur.x, cur.y + 1)) { cur.y++; }
    else { lock(); }
    draw();
  }
  function lock() {
    merge(); NovaAudio.play("drop");
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) if (board[y].every(c => c)) { board.splice(y, 1); board.unshift(Array(COLS).fill(0)); cleared++; y++; }
    if (cleared) {
      lines += cleared; score += [0, 100, 300, 500, 800][cleared] * level;
      NovaAudio.play("clear");
      const nl = Math.floor(lines / 10) + parseInt(cfg.startLevel);
      if (nl > level) { level = nl; dropMs = speedFor(level); schedule(); }
      updateHUD();
    }
    spawn();
  }
  function hardDrop() { while (!collide(cur, cur.m, cur.x, cur.y + 1)) { cur.y++; score += 2; } lock(); updateHUD(); draw(); }
  function move(dx) { if (!collide(cur, cur.m, cur.x + dx, cur.y)) { cur.x += dx; NovaAudio.play("move"); draw(); } }
  function rot() { const m = rotate(cur.m); for (const k of [0, -1, 1, -2, 2]) if (!collide(cur, m, cur.x + k, cur.y)) { cur.m = m; cur.x += k; NovaAudio.play("rotate"); draw(); return; } }

  function cellRect(c, x, y, g, gctx = ctx) {
    gctx.fillStyle = css(COLORS[c] || "--accent");
    if (cfg.glow && gctx === ctx) { gctx.shadowColor = gctx.fillStyle; gctx.shadowBlur = 10; }
    gctx.fillRect(x * g + 1, y * g + 1, g - 2, g - 2); gctx.shadowBlur = 0;
    gctx.fillStyle = "rgba(255,255,255,.18)"; gctx.fillRect(x * g + 1, y * g + 1, g - 2, 3);
  }
  function draw() {
    ctx.fillStyle = css("--bg-2"); ctx.fillRect(0, 0, cv.width, cv.height);
    if (cfg.showGrid) { ctx.strokeStyle = css("--border"); ctx.globalAlpha = .3; for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, cv.height); ctx.stroke(); } for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(cv.width, y * CELL); ctx.stroke(); } ctx.globalAlpha = 1; }
    board.forEach((r, y) => r.forEach((c, x) => { if (c) cellRect(c, x, y, CELL); }));
    if (cur) {
      if (cfg.ghost) { let gy = cur.y; while (!collide(cur, cur.m, cur.x, gy + 1)) gy++; ctx.globalAlpha = .22; cur.m.forEach((r, y) => r.forEach((v, x) => { if (v) cellRect(cur.k, cur.x + x, gy + y, CELL); })); ctx.globalAlpha = 1; }
      cur.m.forEach((r, y) => r.forEach((v, x) => { if (v) cellRect(cur.k, cur.x + x, cur.y + y, CELL); }));
    }
  }
  function drawNext() {
    nctx.clearRect(0, 0, nx.width, nx.height);
    const m = next.m, g = 22, ox = (nx.width - m[0].length * g) / 2, oy = (nx.height - m.length * g) / 2;
    m.forEach((r, y) => r.forEach((v, x) => { if (v) { nctx.fillStyle = css(COLORS[next.k]); nctx.fillRect(ox + x * g + 1, oy + y * g + 1, g - 2, g - 2); } }));
  }
  function gameOver() {
    state = "over"; clearInterval(dropTimer); NovaAudio.stopMusic(); NovaAudio.play("over");
    if (score > best) { best = score; localStorage.setItem("tetris-best", best); }
    ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose";
    ovMsg.textContent = `Puntos: ${score} · Líneas: ${lines} · Récord: ${best}`; ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show");
  }
  function togglePause() {
    if (state === "play") { state = "pause"; clearInterval(dropTimer); NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); }
    else if (state === "pause") start();
  }

  document.addEventListener("keydown", e => {
    if (["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," "].includes(e.key)) e.preventDefault();
    if (e.key === "p" || e.key === "P") return togglePause();
    if (state !== "play") return;
    if (e.key === "ArrowLeft" || e.key === "a") move(-1);
    else if (e.key === "ArrowRight" || e.key === "d") move(1);
    else if (e.key === "ArrowDown" || e.key === "s") softDrop();
    else if (e.key === "ArrowUp" || e.key === "w") rot();
    else if (e.key === " ") hardDrop();
  });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => {
    if (state !== "play") return; const a = b.dataset.act;
    if (a === "left") move(-1); else if (a === "right") move(1); else if (a === "down") softDrop(); else if (a === "rotate") rot();
  });
  ovBtn.onclick = start;
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("restart").onclick = () => { state = "pause"; setup(); start(); };

  NovaSettings.mount({
    gameId: "tetris",
    onChange: () => draw(),
    extra: [
      { title: "Juego", rows: [
        { type: "select", key: "startLevel", label: "Nivel inicial", default: "1", options: [1,2,3,5,8].map(n => ({ value: String(n), label: "Nivel " + n })) },
        { type: "toggle", key: "ghost", label: "Pieza fantasma", default: true, hint: "muestra dónde cae" },
      ]},
      { title: "Gráficos", rows: [
        { type: "toggle", key: "glow", label: "Brillo neón", default: true },
        { type: "toggle", key: "showGrid", label: "Cuadrícula", default: true },
      ]},
      { title: "Controles", rows: [
        { type: "keys", label: "Mover / bajar", value: "← → ↓ (o A D S)" },
        { type: "keys", label: "Rotar", value: "↑ / W" },
        { type: "keys", label: "Caída dura", value: "Espacio" },
        { type: "keys", label: "Pausa", value: "P" },
      ]},
    ],
  });
  document.addEventListener("nova-theme-change", () => { draw(); drawNext(); });
  setup(); draw();
})();
