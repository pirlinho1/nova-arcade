/* Maze Muncher (Pac-Man) — NOVA ARCADE */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), livesEl = document.getElementById("lives"), bestEl = document.getElementById("best");

  const MAZE = [
    "###################",
    "#.................#",
    "#.###.###.###.###.#",
    "#.................#",
    "#.###.#.###.#.###.#",
    "#.....#..#..#.....#",
    "###.#.##.#.##.#.###",
    "#...#....#....#...#",
    "#.#.###.###.###.#.#",
    "#.#.............#.#",
    "#.#.###.###.###.#.#",
    "#...#....#....#...#",
    "###.#.##.#.##.#.###",
    "#.....#..#..#.....#",
    "#.###.#.###.#.###.#",
    "#.................#",
    "#.###.###.###.###.#",
    "#o...............o#",
    "###################",
  ];
  const ROWS = MAZE.length, COLS = MAZE[0].length, CELL = Math.floor(456 / COLS);
  cv.width = COLS * CELL; cv.height = ROWS * CELL;

  const DIRS = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
  const DIFF = { facil: { pac: 7, ghost: 5.5 }, normal: { pac: 8, ghost: 7 }, dificil: { pac: 9, ghost: 9 } };

  let cfg = Object.assign({ diff: "normal", lives: "3", glow: true }, NovaSettings.loadCfg("pacman"));
  let grid, dots, totalDots, pac, ghosts, score, lives, state = "idle", power = 0;
  let pacAcc = 0, ghostAcc = 0, raf = null, last = 0, reachable;
  let best = +(localStorage.getItem("pacman-best") || 0); bestEl.textContent = best;

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function isWall(x, y) { return x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[y][x] === "#"; }

  function parse() {
    grid = MAZE.map(r => r.split(""));
    // pac start: fila 17 centro; ghosts: centro fila 9
    pac = { x: 9, y: 17, dir: "left", want: "left", px: 9, py: 17, moving: false, sx: 9, sy: 17, t: 0 };
    const gc = [[9,9,"#ff2e88"],[8,9,"#22d3ee"],[10,9,"#b6ff3b"]];
    ghosts = gc.map(([x,y,c]) => ({ x, y, dir: "up", c, hx: x, hy: y, sx: x, sy: y, t: 0, scared: false }));
    // reachable desde pac (BFS) → solo cuentan dots alcanzables
    reachable = bfsReach(pac.x, pac.y);
    dots = grid.map((r, y) => r.map((c, x) => {
      if ((c === "." || c === " ") && reachable[y][x]) return "."; // poblar dots en celdas alcanzables
      if (c === "o" && reachable[y][x]) return "o";
      return null;
    }));
    // limpiar dots donde arrancan entidades
    dots[pac.y][pac.x] = null; ghosts.forEach(g => dots[g.y][g.x] = null);
    totalDots = dots.flat().filter(Boolean).length;
  }
  function bfsReach(sx, sy) {
    const seen = grid.map(r => r.map(() => false)); const q = [[sx, sy]]; seen[sy][sx] = true;
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of Object.values(DIRS)) { const nx = (x + dx + COLS) % COLS, ny = y + dy; if (ny < 0 || ny >= ROWS) continue; if (!isWall(nx, ny) && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); } } }
    return seen;
  }
  function setup() { parse(); score = 0; lives = parseInt(cfg.lives); power = 0; updateHUD(); draw(); }
  function updateHUD() { scoreEl.textContent = score; livesEl.textContent = lives; }

  function start() {
    if (state === "play") return;
    if (state !== "pause") setup();
    state = "play"; ov.classList.remove("show"); NovaAudio.resume();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 132);
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function canMove(e, dir) { const [dx, dy] = DIRS[dir]; const nx = (e.x + dx + COLS) % COLS, ny = e.y + dy; return !isWall(nx, ny); }
  function stepEntity(e, dir) { const [dx, dy] = DIRS[dir]; e.sx = e.x; e.sy = e.y; e.x = (e.x + dx + COLS) % COLS; e.y = e.y + dy; e.t = 0; e.moving = true; }

  // IA fantasma: BFS hacia (o lejos de) pac, sin reversa inmediata
  function ghostDir(g) {
    const opp = { up: "down", down: "up", left: "right", right: "left" };
    const opts = Object.keys(DIRS).filter(d => canMove(g, d) && d !== opp[g.dir]);
    const choices = opts.length ? opts : Object.keys(DIRS).filter(d => canMove(g, d));
    if (!choices.length) return g.dir;
    if (g.scared) { return choices[(Math.random() * choices.length) | 0]; }
    // elegir la dirección cuyo siguiente celda minimiza distancia BFS a pac
    let bestD = choices[0], bestDist = Infinity;
    for (const d of choices) { const [dx, dy] = DIRS[d]; const nx = (g.x + dx + COLS) % COLS, ny = g.y + dy; const dist = bfsDist(nx, ny, pac.x, pac.y); if (dist < bestDist) { bestDist = dist; bestD = d; } }
    return bestD;
  }
  function bfsDist(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return 0;
    const seen = grid.map(r => r.map(() => false)); const q = [[sx, sy, 0]]; seen[sy][sx] = true;
    while (q.length) { const [x, y, dd] = q.shift(); for (const [dx, dy] of Object.values(DIRS)) { const nx = (x + dx + COLS) % COLS, ny = y + dy; if (ny < 0 || ny >= ROWS || isWall(nx, ny) || seen[ny][nx]) continue; if (nx === tx && ny === ty) return dd + 1; seen[ny][nx] = true; q.push([nx, ny, dd + 1]); } }
    return 9999;
  }

  function frame(now) {
    const dt = Math.min(50, now - last) / 1000; last = now;
    if (state !== "play") return;
    const sp = DIFF[cfg.diff];
    // pac
    pac.t += dt * sp.pac;
    if (pac.t >= 1) {
      pac.t = 0; pac.moving = false;
      if (canMove(pac, pac.want)) pac.dir = pac.want;
      if (canMove(pac, pac.dir)) stepEntity(pac, pac.dir);
      // comer
      const d = dots[pac.y][pac.x];
      if (d === ".") { dots[pac.y][pac.x] = null; score += 10; NovaAudio.play("move"); }
      else if (d === "o") { dots[pac.y][pac.x] = null; score += 50; power = 6; ghosts.forEach(g => g.scared = true); NovaAudio.play("eat"); }
      updateHUD();
      if (dots.flat().filter(Boolean).length === 0) return win();
    }
    // power timer
    if (power > 0) { power -= dt; if (power <= 0) ghosts.forEach(g => g.scared = false); }
    // ghosts
    ghosts.forEach(g => {
      g.t += dt * (g.scared ? sp.ghost * 0.6 : sp.ghost);
      if (g.t >= 1) { g.t = 0; g.dir = ghostDir(g); if (canMove(g, g.dir)) stepEntity(g, g.dir); }
    });
    // colisiones (por celda) — incluye el "swap" (se cruzan en el paso)
    for (const g of ghosts) {
      const swap = g.x === pac.sx && g.y === pac.sy && g.sx === pac.x && g.sy === pac.y;
      if ((g.x === pac.x && g.y === pac.y) || swap) {
        if (g.scared) { score += 200; g.x = g.hx; g.y = g.hy; g.dir = "up"; g.scared = false; g.t = 0; updateHUD(); NovaAudio.play("point"); }
        else { die(); return; }
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function die() {
    lives--; updateHUD(); NovaAudio.play("hit");
    if (lives <= 0) return lose();
    // reset posiciones
    pac.x = 9; pac.y = 17; pac.dir = pac.want = "left"; pac.t = 0;
    ghosts.forEach((g, i) => { g.x = [9,8,10][i]; g.y = 9; g.dir = "up"; g.scared = false; g.t = 0; });
    draw();
  }
  function win() { state = "over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play("win"); saveBest(); ovTitle.textContent = "¡NIVEL COMPLETO!"; ovTitle.className = "win"; ovMsg.textContent = `Puntos: ${score}`; ovBtn.textContent = "↻ Jugar de nuevo"; ov.classList.add("show"); }
  function lose() { state = "over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play("over"); saveBest(); ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose"; ovMsg.textContent = `Puntos: ${score} · Récord: ${best}`; ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show"); }
  function saveBest() { if (score > best) { best = score; localStorage.setItem("pacman-best", best); bestEl.textContent = best; } }
  function togglePause() {
    if (state === "play") { state = "pause"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); }
    else if (state === "pause") start();
  }

  function draw() {
    ctx.fillStyle = css("--bg-2"); ctx.fillRect(0, 0, cv.width, cv.height);
    const wall = css("--accent"), dotC = css("--text-dim"), powC = css("--accent-3");
    // muros
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === "#") {
      ctx.fillStyle = css("--surface-2"); ctx.fillRect(x*CELL, y*CELL, CELL, CELL);
      ctx.strokeStyle = wall; ctx.lineWidth = 2; if (cfg.glow) { ctx.shadowColor = wall; ctx.shadowBlur = 6; }
      ctx.strokeRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4); ctx.shadowBlur = 0;
    }
    // dots
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = dots[y][x]; if (!d) continue;
      ctx.fillStyle = d === "o" ? powC : dotC; ctx.beginPath();
      ctx.arc(x*CELL+CELL/2, y*CELL+CELL/2, d === "o" ? CELL/4 : CELL/8, 0, 7); ctx.fill();
    }
    // pac
    const px = pac.x*CELL+CELL/2, py = pac.y*CELL+CELL/2;
    ctx.fillStyle = powC; if (cfg.glow) { ctx.shadowColor = powC; ctx.shadowBlur = 12; }
    const mouth = 0.25 + 0.15 * Math.abs(Math.sin(performance.now()/120));
    const ang = { right: 0, down: Math.PI/2, left: Math.PI, up: -Math.PI/2 }[pac.dir];
    ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, CELL/2-2, ang + mouth, ang - mouth + Math.PI*2); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    // ghosts
    ghosts.forEach(g => {
      const gx = g.x*CELL+CELL/2, gy = g.y*CELL+CELL/2, r = CELL/2-2;
      ctx.fillStyle = g.scared ? css("--accent-2") : g.c;
      if (cfg.glow) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; }
      ctx.beginPath(); ctx.arc(gx, gy, r, Math.PI, 0); ctx.lineTo(gx+r, gy+r); ctx.lineTo(gx-r, gy+r); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx-r/3, gy-2, r/4, 0, 7); ctx.arc(gx+r/3, gy-2, r/4, 0, 7); ctx.fill();
    });
    if (power > 0) { ctx.fillStyle = css("--accent-3"); ctx.globalAlpha = .15; ctx.fillRect(0,0,cv.width,cv.height); ctx.globalAlpha = 1; }
  }

  const keymap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W:"up",S:"down",A:"left",D:"right" };
  document.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "p" || e.key === "P") { e.preventDefault(); return togglePause(); }
    const d = keymap[e.key]; if (d) { e.preventDefault(); pac.want = d; if (state === "idle" || state === "over") start(); }
  });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => { pac.want = b.dataset.dir; if (state !== "play") start(); });
  let tsx, tsy;
  cv.addEventListener("touchstart", e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX-tsx, dy = e.changedTouches[0].clientY-tsy; pac.want = Math.abs(dx)>Math.abs(dy) ? (dx>0?"right":"left") : (dy>0?"down":"up"); if (state!=="play") start(); });
  ovBtn.onclick = start;
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("restart").onclick = () => { state = "pause"; setup(); start(); };

  NovaSettings.mount({
    gameId: "pacman",
    onChange: (k) => { if (k === "lives" && state !== "play") { setup(); } draw(); },
    extra: [
      { title: "Juego", rows: [
        { type: "select", key: "diff", label: "Dificultad", default: "normal", options: [{value:"facil",label:"Fácil"},{value:"normal",label:"Normal"},{value:"dificil",label:"Difícil"}] },
        { type: "select", key: "lives", label: "Vidas", default: "3", options: [{value:"1",label:"1"},{value:"3",label:"3"},{value:"5",label:"5"}] },
      ]},
      { title: "Gráficos", rows: [ { type: "toggle", key: "glow", label: "Brillo neón", default: true } ]},
      { title: "Controles", rows: [ { type: "keys", label: "Mover", value: "Flechas / WASD / swipe" }, { type: "keys", label: "Pausa", value: "Espacio / P" } ]},
    ],
  });
  document.addEventListener("nova-theme-change", draw);
  setup();
})();
