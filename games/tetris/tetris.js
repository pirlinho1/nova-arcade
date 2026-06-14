/* Blocks (Tetris) — NOVA ARCADE (v2)
   Jugabilidad sólida: gravedad + lock delay, DAS/ARR (auto-repeat), 7-bag,
   pieza guardada (hold), soft/hard drop con puntaje, cola de 3 y colores por pieza. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const nx = document.getElementById("next"), nctx = nx.getContext("2d");
  const hd = document.getElementById("hold"), hctx = hd.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), linesEl = document.getElementById("lines"), levelEl = document.getElementById("level");
  const COLS = 10, ROWS = 20, CELL = 30;

  const SHAPES = {
    I: [[1, 1, 1, 1]], O: [[1, 1], [1, 1]], T: [[0, 1, 0], [1, 1, 1]], S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]], J: [[1, 0, 0], [1, 1, 1]], L: [[0, 0, 1], [1, 1, 1]]
  };
  const COLORS = { I: "#19d3e6", O: "#ffd23b", T: "#b06bff", S: "#3bdf6a", Z: "#ff4b5c", J: "#4f8cff", L: "#ff9d2e" };
  const KEYS = Object.keys(SHAPES);
  const DAS = 0.15, ARR = 0.035, LOCK_DELAY = 0.5, MAX_RESETS = 15;

  let cfg = Object.assign({ startLevel: "1", ghost: true, showGrid: true, glow: true }, NovaSettings.loadCfg("tetris"));
  let board, cur, queue, bag, hold, canHold, score, lines, level, state = "idle";
  let gravAccum = 0, lockT = 0, grounded = false, resets = 0, softDrop = false;
  let moveDir = 0, dasT = 0, dasPhase = "off", flash = [], flashT = 0;
  let lastFrame = 0, raf = null;
  let best = +(localStorage.getItem("tetris-best") || 0);

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._tA || (window._tA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function empty() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }
  function refillBag() { bag = KEYS.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[bag[i], bag[j]] = [bag[j], bag[i]]; } }
  function pull() { if (!bag || !bag.length) refillBag(); const k = bag.pop(); return { k, m: SHAPES[k].map(r => r.slice()), x: 3, y: 0 }; }
  function rotate(m) { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
  function collide(m, ox, oy) { for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) if (m[y][x]) { const X = ox + x, Y = oy + y; if (X < 0 || X >= COLS || Y >= ROWS || (Y >= 0 && board[Y][X])) return true; } return false; }
  function merge() { cur.m.forEach((r, y) => r.forEach((v, x) => { if (v && cur.y + y >= 0) board[cur.y + y][cur.x + x] = cur.k; })); }

  function setup() {
    board = empty(); score = 0; lines = 0; level = parseInt(cfg.startLevel);
    bag = null; queue = [pull(), pull(), pull()]; hold = null; canHold = true;
    gravAccum = 0; lockT = 0; grounded = false; flash = []; flashT = 0; softDrop = false; moveDir = 0; dasPhase = "off";
    spawnFromQueue(); updateHUD(); drawAll();
  }
  function spawnFromQueue() {
    cur = queue.shift(); queue.push(pull());
    cur.x = ((COLS / 2) | 0) - ((cur.m[0].length / 2) | 0); cur.y = 0;
    grounded = false; lockT = 0; resets = 0;
    if (collide(cur.m, cur.x, cur.y)) return gameOver();
    drawSide();
  }
  function speedFor(l) { return Math.max(0.05, 0.8 - (l - 1) * 0.07); }
  function updateHUD() { scoreEl.textContent = score; linesEl.textContent = lines; levelEl.textContent = level; }

  function start() {
    if (state === "play") return;
    if (state !== "pause") setup();
    state = "play"; ov.classList.remove("show"); actx();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 124);
    lastFrame = performance.now(); ensure();
  }
  function ensure() { if (raf == null) raf = requestAnimationFrame(frame); }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - lastFrame) / 1000; lastFrame = now; if (dt > .1) dt = .1;
    if (state === "play") update(dt);
    drawAll();
  }
  function update(dt) {
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) applyClears(); return; }
    // DAS/ARR
    if (moveDir) { dasT += dt; if (dasPhase === "das" && dasT >= DAS) { tryMove(moveDir); dasT = 0; dasPhase = "arr"; } else if (dasPhase === "arr" && dasT >= ARR) { tryMove(moveDir); dasT = 0; } }
    // gravedad
    const interval = softDrop ? Math.min(speedFor(level), 0.03) : speedFor(level);
    gravAccum += dt;
    while (gravAccum >= interval) {
      gravAccum -= interval;
      if (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; if (softDrop) score += 1; grounded = false; lockT = 0; }
      else grounded = true;
    }
    // lock delay
    if (grounded) { lockT += dt; if (lockT >= LOCK_DELAY) lockPiece(); }
  }

  function tryMove(dx) {
    if (!collide(cur.m, cur.x + dx, cur.y)) { cur.x += dx; tone(330, .03, "square", .25); if (grounded && resets < MAX_RESETS) { lockT = 0; resets++; } return true; }
    return false;
  }
  function rot() {
    const m = rotate(cur.m);
    for (const k of [0, -1, 1, -2, 2]) if (!collide(m, cur.x + k, cur.y)) { cur.m = m; cur.x += k; tone(440, .04, "triangle", .3); if (grounded && resets < MAX_RESETS) { lockT = 0; resets++; } if (collide(cur.m, cur.x, cur.y + 1)) grounded = true; return; }
  }
  function hardDrop() { let d = 0; while (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; d++; } score += d * 2; tone(180, .08, "sawtooth", .4, 90); lockPiece(); }
  function holdPiece() {
    if (!canHold) return;
    tone(520, .05, "sine", .35);
    if (hold) { const tmp = hold; hold = { k: cur.k, m: SHAPES[cur.k].map(r => r.slice()) }; cur = { k: tmp.k, m: SHAPES[tmp.k].map(r => r.slice()), x: 3, y: 0 }; }
    else { hold = { k: cur.k, m: SHAPES[cur.k].map(r => r.slice()) }; spawnFromQueue(); }
    cur.x = ((COLS / 2) | 0) - ((cur.m[0].length / 2) | 0); cur.y = 0; grounded = false; lockT = 0; resets = 0;
    canHold = false; drawSide();
  }

  function lockPiece() {
    merge(); tone(240, .05, "square", .35);
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(c => c)) full.push(y);
    if (full.length) { flash = full; flashT = 0.18; }
    else { spawnFromQueue(); }
    canHold = true; grounded = false; lockT = 0;
  }
  function applyClears() {
    const n = flash.length;
    flash.sort((a, b) => a - b).forEach(y => { board.splice(y, 1); board.unshift(Array(COLS).fill(0)); });
    lines += n; score += [0, 100, 300, 500, 800][n] * level;
    if (n === 4) tone(523, .2, "triangle", .5, 1046); else { tone(659, .12, "triangle", .45); }
    const nl = Math.floor(lines / 10) + parseInt(cfg.startLevel);
    if (nl > level) { level = nl; tone(784, .15, "triangle", .5, 1568); }
    flash = []; flashT = 0; updateHUD(); spawnFromQueue();
  }

  function gameOver() {
    state = "over"; NovaAudio.stopMusic(); tone(300, .2, "sawtooth", .5, 80); setTimeout(() => tone(150, .3, "sawtooth", .4, 60), 150);
    if (score > best) { best = score; localStorage.setItem("tetris-best", best); }
    ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose";
    ovMsg.innerHTML = `Puntos: <b>${score}</b> · Líneas: <b>${lines}</b> · Récord: <b>${best}</b>`; ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show");
  }
  function togglePause() {
    if (state === "play") { state = "pause"; NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); }
    else if (state === "pause") { ov.classList.remove("show"); state = "play"; if (!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 124); lastFrame = performance.now(); }
  }

  // ---- render ----
  function cellRect(c, x, y, g, gctx, gh) {
    const col = COLORS[c] || "#888"; gctx.fillStyle = col;
    if (gh) gctx.globalAlpha = 0.22;
    if (cfg.glow && gctx === ctx && !gh) { gctx.shadowColor = col; gctx.shadowBlur = 9; }
    gctx.fillRect(x * g + 1, y * g + 1, g - 2, g - 2); gctx.shadowBlur = 0;
    if (!gh) { gctx.fillStyle = "rgba(255,255,255,.22)"; gctx.fillRect(x * g + 1, y * g + 1, g - 2, 3); gctx.fillStyle = "rgba(0,0,0,.18)"; gctx.fillRect(x * g + 1, y * g + g - 4, g - 2, 3); }
    gctx.globalAlpha = 1;
  }
  function drawAll() { draw(); }
  function draw() {
    ctx.fillStyle = "#0c1018"; ctx.fillRect(0, 0, cv.width, cv.height);
    if (cfg.showGrid) { ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, cv.height); ctx.stroke(); } for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(cv.width, y * CELL); ctx.stroke(); } }
    board.forEach((r, y) => r.forEach((c, x) => { if (c) cellRect(c, x, y, CELL, ctx); }));
    if (cur && state !== "over") {
      if (cfg.ghost) { let gy = cur.y; while (!collide(cur.m, cur.x, gy + 1)) gy++; cur.m.forEach((r, y) => r.forEach((v, x) => { if (v) cellRect(cur.k, cur.x + x, gy + y, CELL, ctx, true); })); }
      cur.m.forEach((r, y) => r.forEach((v, x) => { if (v && cur.y + y >= 0) cellRect(cur.k, cur.x + x, cur.y + y, CELL, ctx); }));
    }
    // flash de líneas
    if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT / 0.18 * 0.8})`; flash.forEach(y => ctx.fillRect(0, y * CELL, cv.width, CELL)); }
  }
  function drawMini(piece, gctx, canvas, slotY) {
    const m = piece.m, g = 20, ox = (canvas.width - m[0].length * g) / 2, oy = (slotY != null ? slotY : (canvas.height - m.length * g) / 2);
    m.forEach((r, y) => r.forEach((v, x) => { if (v) { gctx.fillStyle = COLORS[piece.k]; gctx.fillRect(ox + x * g + 1, oy + y * g + 1, g - 2, g - 2); gctx.fillStyle = "rgba(255,255,255,.2)"; gctx.fillRect(ox + x * g + 1, oy + y * g + 1, g - 2, 3); } }));
  }
  function drawSide() {
    nctx.clearRect(0, 0, nx.width, nx.height);
    queue.slice(0, 3).forEach((p, i) => drawMini(p, nctx, nx, i * 40 + 6));
    hctx.clearRect(0, 0, hd.width, hd.height);
    if (hold) { hctx.globalAlpha = canHold ? 1 : .4; drawMini(hold, hctx, hd); hctx.globalAlpha = 1; }
  }

  // ---- input ----
  document.addEventListener("keydown", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(e.key)) e.preventDefault();
    if (k === "p") return togglePause();
    if (state !== "play") return;
    if (e.repeat) return;
    if (k === "ArrowLeft" || k === "a") { tryMove(-1); moveDir = -1; dasT = 0; dasPhase = "das"; }
    else if (k === "ArrowRight" || k === "d") { tryMove(1); moveDir = 1; dasT = 0; dasPhase = "das"; }
    else if (k === "ArrowDown" || k === "s") softDrop = true;
    else if (k === "ArrowUp" || k === "w" || k === "x") rot();
    else if (k === "z") { const m = rotate(rotate(rotate(cur.m))); for (const o of [0, -1, 1]) if (!collide(m, cur.x + o, cur.y)) { cur.m = m; cur.x += o; break; } }
    else if (k === " ") hardDrop();
    else if (k === "c" || k === "Shift") holdPiece();
  });
  document.addEventListener("keyup", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((k === "ArrowLeft" || k === "a") && moveDir === -1) { moveDir = 0; dasPhase = "off"; }
    else if ((k === "ArrowRight" || k === "d") && moveDir === 1) { moveDir = 0; dasPhase = "off"; }
    else if (k === "ArrowDown" || k === "s") softDrop = false;
  });
  // dpad táctil (con auto-repeat por pulsación sostenida)
  document.querySelectorAll("#dpad button").forEach(b => {
    const a = b.dataset.act;
    const press = () => { if (state !== "play") return; if (a === "left") { tryMove(-1); moveDir = -1; dasT = 0; dasPhase = "das"; } else if (a === "right") { tryMove(1); moveDir = 1; dasT = 0; dasPhase = "das"; } else if (a === "down") softDrop = true; else if (a === "rotate") rot(); };
    const rel = () => { if (a === "left" || a === "right") { moveDir = 0; dasPhase = "off"; } if (a === "down") softDrop = false; };
    b.addEventListener("touchstart", e => { e.preventDefault(); press(); }, { passive: false });
    b.addEventListener("touchend", e => { e.preventDefault(); rel(); });
    b.addEventListener("mousedown", press); b.addEventListener("mouseup", rel); b.addEventListener("mouseleave", rel);
  });
  ovBtn.onclick = () => { if (state === "pause") togglePause(); else start(); };
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("restart").onclick = () => { state = "pause"; setup(); start(); };

  NovaSettings.mount({
    gameId: "tetris", onChange: () => { cfg = Object.assign(cfg, NovaSettings.loadCfg("tetris")); draw(); },
    extra: [
      { title: "Juego", rows: [
        { type: "select", key: "startLevel", label: "Nivel inicial", default: "1", options: [1, 2, 3, 5, 8].map(n => ({ value: String(n), label: "Nivel " + n })) },
        { type: "toggle", key: "ghost", label: "Pieza fantasma", default: true, hint: "muestra dónde cae" },
      ]},
      { title: "Gráficos", rows: [
        { type: "toggle", key: "glow", label: "Brillo neón", default: true },
        { type: "toggle", key: "showGrid", label: "Cuadrícula", default: true },
      ]},
      { title: "Controles", rows: [
        { type: "keys", label: "Mover / bajar", value: "← → ↓ (auto-repeat)" },
        { type: "keys", label: "Rotar", value: "↑ / Z (antihorario)" },
        { type: "keys", label: "Caída dura · Reserva", value: "Espacio · C" },
        { type: "keys", label: "Pausa", value: "P" },
      ]},
    ],
  });
  document.addEventListener("nova-theme-change", drawAll);
  setup();
})();
