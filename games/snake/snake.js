/* Snake — NOVA ARCADE */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"),
        ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), bestEl = document.getElementById("best");

  const SPEEDS = { facil: 9, normal: 13, dificil: 18 };
  let cfg = NovaSettings.loadCfg("snake");
  const defaults = { speed: "normal", grid: "20", wrap: false, glow: true, showGrid: true };
  cfg = Object.assign({}, defaults, cfg);

  let cols, cell, snake, dir, nextDir, food, score, best = +(localStorage.getItem("snake-best") || 0);
  let timer = null, state = "idle"; // idle | play | pause | over
  bestEl.textContent = best;

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function setup() {
    cols = parseInt(cfg.grid);
    cell = Math.floor(420 / cols);
    cv.width = cv.height = cols * cell;
    const mid = Math.floor(cols / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = nextDir = { x: 1, y: 0 };
    score = 0; scoreEl.textContent = 0;
    placeFood();
    draw();
  }
  function placeFood() {
    do { food = { x: (Math.random() * cols) | 0, y: (Math.random() * cols) | 0 }; }
    while (snake.some(s => s.x === food.x && s.y === food.y));
  }
  function start() {
    if (state === "play") return;
    if (state === "over" || state === "idle") setup();
    state = "play"; ov.classList.remove("show");
    NovaAudio.resume();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 108);
    loop();
  }
  function loop() {
    clearInterval(timer);
    timer = setInterval(tick, 1000 / SPEEDS[cfg.speed]);
  }
  function tick() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (cfg.wrap) { head.x = (head.x + cols) % cols; head.y = (head.y + cols) % cols; }
    else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= cols) return gameOver();
    if (snake.some(s => s.x === head.x && s.y === head.y)) return gameOver();
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++; scoreEl.textContent = score; NovaAudio.play("eat"); placeFood();
    } else snake.pop();
    draw();
  }
  function draw() {
    const accent = css("--accent"), accent2 = css("--accent-2"), accent3 = css("--accent-3"), border = css("--border");
    ctx.fillStyle = css("--bg-2"); ctx.fillRect(0, 0, cv.width, cv.height);
    if (cfg.showGrid) {
      ctx.strokeStyle = border; ctx.globalAlpha = .35; ctx.lineWidth = 1;
      for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, cv.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(cv.width, i * cell); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // comida
    ctx.fillStyle = accent2; if (cfg.glow) { ctx.shadowColor = accent2; ctx.shadowBlur = 14; }
    roundRect(food.x * cell + 3, food.y * cell + 3, cell - 6, cell - 6); ctx.fill(); ctx.shadowBlur = 0;
    // serpiente
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? accent3 : accent;
      if (cfg.glow) { ctx.shadowColor = i === 0 ? accent3 : accent; ctx.shadowBlur = i === 0 ? 16 : 8; }
      roundRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  }
  function roundRect(x, y, w, h) { const r = Math.min(5, w / 3); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function gameOver() {
    state = "over"; clearInterval(timer); NovaAudio.stopMusic(); NovaAudio.play("over");
    if (score > best) { best = score; localStorage.setItem("snake-best", best); bestEl.textContent = best; }
    ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose";
    ovMsg.textContent = `Puntos: ${score}  ·  Récord: ${best}`;
    ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show");
  }
  function togglePause() {
    if (state === "play") { state = "pause"; clearInterval(timer); NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); }
    else if (state === "pause") start();
  }
  function turn(d) {
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const nd = map[d]; if (!nd) return;
    if (nd.x === -dir.x && nd.y === -dir.y) return; // no reversa
    nextDir = nd;
    if (state === "idle" || state === "over") start();
  }

  // input
  const keymap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  document.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "p" || e.key === "P") { e.preventDefault(); togglePause(); return; }
    const d = keymap[e.key]; if (d) { e.preventDefault(); turn(d); }
  });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => turn(b.dataset.dir));
  // swipe
  let tsx, tsy;
  cv.addEventListener("touchstart", e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? "right" : "left"); else turn(dy > 0 ? "down" : "up");
  });
  ovBtn.onclick = start;
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("restart").onclick = () => { state = "over"; start(); };

  // settings
  NovaSettings.mount({
    gameId: "snake",
    onChange: (k) => { if (["grid"].includes(k)) { state = "idle"; setup(); ovTitle.textContent = "SNAKE"; ovTitle.className = ""; ov.classList.add("show"); } else draw(); },
    extra: [
      { title: "Juego", rows: [
        { type: "select", key: "speed", label: "Dificultad", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
        { type: "select", key: "grid", label: "Tamaño del tablero", default: "20", options: [{ value: "14", label: "Pequeño" }, { value: "20", label: "Mediano" }, { value: "28", label: "Grande" }] },
        { type: "toggle", key: "wrap", label: "Atravesar paredes", default: false, hint: "sin morir en el borde" },
      ]},
      { title: "Gráficos", rows: [
        { type: "toggle", key: "glow", label: "Brillo neón", default: true },
        { type: "toggle", key: "showGrid", label: "Cuadrícula", default: true },
      ]},
      { title: "Controles", rows: [
        { type: "keys", label: "Mover", value: "Flechas / WASD / swipe" },
        { type: "keys", label: "Pausa", value: "Espacio / P" },
      ]},
    ],
  });
  document.addEventListener("nova-theme-change", draw);
  setup();
})();
