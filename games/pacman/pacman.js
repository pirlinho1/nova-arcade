/* Maze Muncher — NOVA ARCADE (v2)
   Laberinto original. Movimiento interpolado suave, fantasmas con personalidades
   distintas + fases scatter/chase (no se amontonan), pellets de poder y ojos que
   vuelven a casa al ser comidos. */
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

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: "down", down: "up", left: "right", right: "left" };
  const DIFF = { facil: { pac: 5.5, ghost: 4.6 }, normal: { pac: 6.5, ghost: 5.8 }, dificil: { pac: 7.5, ghost: 7 } };
  // fases globales scatter/chase (segundos)
  const PHASES = [["scatter", 7], ["chase", 20], ["scatter", 7], ["chase", 20], ["scatter", 5], ["chase", 1e9]];

  let cfg = Object.assign({ diff: "normal", lives: "3", glow: true }, NovaSettings.loadCfg("pacman"));
  let grid, dots, pac, ghosts, score, lives, state = "idle", power = 0, reachable;
  let phaseIdx = 0, phaseT = 0, mode = "scatter", reverseFlag = false, level = 1;
  let raf = null, last = 0;
  let best = +(localStorage.getItem("pacman-best") || 0); bestEl.textContent = best;

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._pA || (window._pA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .35); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function isWall(x, y) { return x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[y][x] === "#"; }

  function parse() {
    grid = MAZE.map(r => r.split(""));
    pac = ent(9, 17, "left"); pac.want = "left";
    const data = [[9, 9, "#ff3b5c", "chaser", [COLS - 2, 0]], [8, 9, "#19d3e6", "ambush", [1, 0]], [10, 9, "#ffb24d", "shy", [1, ROWS - 2]]];
    ghosts = data.map(([x, y, c, kind, corner]) => Object.assign(ent(x, y, "up"), { c, kind, hx: x, hy: y, corner, scared: false, eyes: false }));
    reachable = bfsReach(pac.x, pac.y);
    dots = grid.map((r, y) => r.map((c, x) => ((c === "." || c === " ") && reachable[y][x]) ? "." : (c === "o" && reachable[y][x]) ? "o" : null));
    dots[pac.y][pac.x] = null; ghosts.forEach(g => dots[g.y][g.x] = null);
    phaseIdx = 0; phaseT = 0; mode = "scatter"; reverseFlag = false;
  }
  function ent(x, y, dir) { return { x, y, dir, sx: x, sy: y, t: 1 }; }
  function bfsReach(sx, sy) { const seen = grid.map(r => r.map(() => false)); const q = [[sx, sy]]; seen[sy][sx] = true; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of Object.values(DIRS)) { const nx = (x + dx + COLS) % COLS, ny = y + dy; if (ny < 0 || ny >= ROWS) continue; if (!isWall(nx, ny) && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); } } } return seen; }
  function setup() { parse(); score = 0; lives = parseInt(cfg.lives); power = 0; level = 1; updateHUD(); draw(); }
  function updateHUD() { scoreEl.textContent = score; livesEl.textContent = lives; }

  function start() {
    if (state === "play") return;
    if (state !== "pause") setup();
    state = "play"; ov.classList.remove("show"); actx();
    if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 138);
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function canMove(e, dir) { const [dx, dy] = DIRS[dir]; const nx = (e.x + dx + COLS) % COLS, ny = e.y + dy; return !isWall(nx, ny); }
  function stepEntity(e, dir) { const [dx, dy] = DIRS[dir]; e.sx = e.x; e.sy = e.y; e.x = (e.x + dx + COLS) % COLS; e.y = e.y + dy; e.t = 0; e.dir = dir; }
  function bfsDist(sx, sy, tx, ty) { if (sx === tx && sy === ty) return 0; const seen = grid.map(r => r.map(() => false)); const q = [[sx, sy, 0]]; seen[sy][sx] = true; while (q.length) { const [x, y, dd] = q.shift(); for (const [dx, dy] of Object.values(DIRS)) { const nx = (x + dx + COLS) % COLS, ny = y + dy; if (ny < 0 || ny >= ROWS || isWall(nx, ny) || seen[ny][nx]) continue; if (nx === tx && ny === ty) return dd + 1; seen[ny][nx] = true; q.push([nx, ny, dd + 1]); } } return 9999; }

  function targetFor(g) {
    if (g.eyes) return [g.hx, g.hy];
    if (mode === "scatter") return g.corner;
    if (g.kind === "chaser") return [pac.x, pac.y];
    if (g.kind === "ambush") { const [dx, dy] = DIRS[pac.dir]; let tx = pac.x + dx * 4, ty = pac.y + dy * 4; tx = Math.max(1, Math.min(COLS - 2, tx)); ty = Math.max(1, Math.min(ROWS - 2, ty)); return [tx, ty]; }
    // shy: persigue de lejos, se retira de cerca
    return bfsDist(g.x, g.y, pac.x, pac.y) > 7 ? [pac.x, pac.y] : g.corner;
  }
  function ghostDir(g) {
    let opts = Object.keys(DIRS).filter(d => canMove(g, d) && d !== OPP[g.dir]);
    if (!opts.length) opts = Object.keys(DIRS).filter(d => canMove(g, d));
    if (!opts.length) return g.dir;
    if (g.scared && !g.eyes) return opts[(Math.random() * opts.length) | 0];
    const [tx, ty] = targetFor(g);
    let bestD = opts[0], bd = Infinity;
    for (const d of opts) { const [dx, dy] = DIRS[d]; const nx = (g.x + dx + COLS) % COLS, ny = g.y + dy; const dist = bfsDist(nx, ny, tx, ty); if (dist < bd) { bd = dist; bestD = d; } }
    return bestD;
  }

  function frame(now) {
    const dt = Math.min(50, now - last) / 1000; last = now;
    if (state !== "play") return;
    const sp = DIFF[cfg.diff];
    // fases
    if (power <= 0) { phaseT += dt; if (phaseIdx < PHASES.length - 1 && phaseT > PHASES[phaseIdx][1]) { phaseIdx++; phaseT = 0; mode = PHASES[phaseIdx][0]; reverseFlag = true; } }
    // pac
    pac.t += dt * sp.pac;
    if (pac.t >= 1) {
      pac.t -= 1; pac.sx = pac.x; pac.sy = pac.y;
      if (canMove(pac, pac.want)) pac.dir = pac.want;
      if (canMove(pac, pac.dir)) { const [dx, dy] = DIRS[pac.dir]; pac.x = (pac.x + dx + COLS) % COLS; pac.y += dy; } else pac.t = 1;
      const d = dots[pac.y][pac.x];
      if (d === ".") { dots[pac.y][pac.x] = null; score += 10; tone(380 + (Math.random() * 40 | 0), .03, "square", .25); }
      else if (d === "o") { dots[pac.y][pac.x] = null; score += 50; power = 7; ghosts.forEach(g => { if (!g.eyes) { g.scared = true; g.dir = OPP[g.dir]; } }); tone(220, .15, "sine", .4, 440); }
      updateHUD();
      if (dots.flat().filter(Boolean).length === 0) return win();
    }
    if (power > 0) { power -= dt; if (power <= 0) ghosts.forEach(g => g.scared = false); }
    // ghosts
    ghosts.forEach(g => {
      const gs = g.eyes ? sp.ghost * 2.0 : (g.scared ? sp.ghost * 0.55 : sp.ghost * (mode === "scatter" ? 0.9 : 1));
      g.t += dt * gs;
      if (g.t >= 1) {
        g.t -= 1; g.sx = g.x; g.sy = g.y;
        if (reverseFlag && !g.eyes && !g.scared) g.dir = OPP[g.dir];
        const nd = ghostDir(g); stepEntity(g, nd); g.t = Math.min(g.t, 0.999);
        if (g.eyes && g.x === g.hx && g.y === g.hy) { g.eyes = false; g.scared = false; }
      }
    });
    reverseFlag = false;
    // colisiones por proximidad interpolada
    const pp = ipos(pac);
    for (const g of ghosts) {
      if (g.eyes) continue;
      const gp = ipos(g);
      if (Math.hypot(pp.x - gp.x, pp.y - gp.y) < CELL * 0.55) {
        if (g.scared) { score += 200; g.eyes = true; g.scared = false; tone(880, .12, "square", .4, 1320); updateHUD(); }
        else { return die(); }
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function ipos(e) {
    let dx = e.x - e.sx; if (Math.abs(dx) > 1) dx = 0; // tunnel: no interpolar
    const rx = e.sx + dx * e.t, ry = e.sy + (e.y - e.sy) * e.t;
    return { x: rx * CELL + CELL / 2, y: ry * CELL + CELL / 2 };
  }
  function die() {
    lives--; updateHUD(); tone(330, .2, "sawtooth", .45, 90); setTimeout(() => tone(160, .25, "sawtooth", .4, 70), 140);
    if (lives <= 0) return lose();
    pac = ent(9, 17, "left"); pac.want = "left";
    ghosts.forEach((g, i) => { g.x = g.sx = [9, 8, 10][i]; g.y = g.sy = 9; g.dir = "up"; g.scared = false; g.eyes = false; g.t = 1; });
    power = 0; phaseIdx = 0; phaseT = 0; mode = "scatter"; draw();
  }
  function nextLevel() { level++; const keepScore = score; parse(); score = keepScore; state = "play"; tone(523, .12, "triangle", .5, 1046); }
  function win() { state = "over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play("win"); saveBest(); ovTitle.textContent = "¡NIVEL " + level + " COMPLETO!"; ovTitle.className = "win"; ovMsg.innerHTML = `Puntos: <b>${score}</b>`; ovBtn.textContent = "▶ Siguiente nivel"; ov.classList.add("show"); ovBtn.onclick = () => { ov.classList.remove("show"); nextLevel(); last = performance.now(); raf = requestAnimationFrame(frame); }; }
  function lose() { state = "over"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); NovaAudio.play("over"); saveBest(); ovTitle.textContent = "GAME OVER"; ovTitle.className = "lose"; ovMsg.innerHTML = `Puntos: <b>${score}</b> · Récord: <b>${best}</b>`; ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show"); ovBtn.onclick = startFresh; }
  function startFresh() { setup(); start(); }
  function saveBest() { if (score > best) { best = score; localStorage.setItem("pacman-best", best); bestEl.textContent = best; } }
  function togglePause() {
    if (state === "play") { state = "pause"; cancelAnimationFrame(raf); NovaAudio.stopMusic(); ovTitle.textContent = "PAUSA"; ovTitle.className = ""; ovMsg.textContent = "Pulsa continuar."; ovBtn.textContent = "▶ Continuar"; ov.classList.add("show"); ovBtn.onclick = () => { if (!NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 138); start(); }; }
    else if (state === "pause") start();
  }

  function draw() {
    ctx.fillStyle = "#070a12"; ctx.fillRect(0, 0, cv.width, cv.height);
    const wall = css("--accent");
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === "#") {
      ctx.fillStyle = "#10224a"; ctx.beginPath(); ctx.roundRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 4); ctx.fill();
      ctx.strokeStyle = "#3a6bff"; ctx.lineWidth = 2; if (cfg.glow) { ctx.shadowColor = "#3a6bff"; ctx.shadowBlur = 6; } ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const d = dots[y][x]; if (!d) continue; ctx.fillStyle = d === "o" ? "#ffe14d" : "#ffd9a8"; if (d === "o" && cfg.glow) { ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 8; } const pr = d === "o" ? CELL / 3.5 * (1 + Math.sin(performance.now() / 200) * 0.12) : CELL / 8; ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, pr, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    // pac
    const p = ipos(pac);
    ctx.fillStyle = "#ffd23b"; if (cfg.glow) { ctx.shadowColor = "#ffd23b"; ctx.shadowBlur = 12; }
    const mouth = 0.06 + 0.26 * Math.abs(Math.sin(performance.now() / 90));
    const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, CELL / 2 - 2, ang + mouth, ang - mouth + Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    // ghosts
    const flashing = power > 0 && power < 2.2 && (Math.floor(power * 6) % 2 === 0);
    ghosts.forEach(g => {
      const gp = ipos(g), r = CELL / 2 - 2;
      if (!g.eyes) {
        ctx.fillStyle = g.scared ? (flashing ? "#fff" : "#2747d8") : g.c;
        if (cfg.glow) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 9; }
        ctx.beginPath(); ctx.arc(gp.x, gp.y - 1, r, Math.PI, 0); ctx.lineTo(gp.x + r, gp.y + r);
        for (let i = 0; i < 3; i++) { ctx.lineTo(gp.x + r - (i * 2 + 1) * r / 3, gp.y + r - (i % 2 ? 0 : r / 3)); }
        ctx.lineTo(gp.x - r, gp.y + r); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      }
      // ojos (siempre)
      const ex = DIRS[g.dir][0] * r * .18, ey = DIRS[g.dir][1] * r * .18;
      ctx.fillStyle = g.scared && !g.eyes ? "#ffd9a8" : "#fff";
      ctx.beginPath(); ctx.arc(gp.x - r / 3, gp.y - 2, r / 3.4, 0, 7); ctx.arc(gp.x + r / 3, gp.y - 2, r / 3.4, 0, 7); ctx.fill();
      if (!(g.scared && !g.eyes)) { ctx.fillStyle = "#1030c0"; ctx.beginPath(); ctx.arc(gp.x - r / 3 + ex, gp.y - 2 + ey, r / 6, 0, 7); ctx.arc(gp.x + r / 3 + ex, gp.y - 2 + ey, r / 6, 0, 7); ctx.fill(); }
    });
    if (power > 0) { ctx.fillStyle = "#2747d8"; ctx.globalAlpha = .08; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
  }

  const keymap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  document.addEventListener("keydown", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === " " || k === "p") { e.preventDefault(); return togglePause(); }
    const d = keymap[k]; if (d) { e.preventDefault(); pac.want = d; if (state === "idle" || state === "over") startFresh(); }
  });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => { pac.want = b.dataset.dir; if (state !== "play") startFresh(); });
  let tsx, tsy;
  cv.addEventListener("touchstart", e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return; pac.want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); if (state !== "play") startFresh(); });
  ovBtn.onclick = start;
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("restart").onclick = () => { state = "pause"; startFresh(); };

  NovaSettings.mount({
    gameId: "pacman", onChange: (k) => { cfg = Object.assign(cfg, NovaSettings.loadCfg("pacman")); if (k === "lives" && state !== "play") setup(); draw(); }, extra: [
      { title: "Juego", rows: [
        { type: "select", key: "diff", label: "Dificultad", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
        { type: "select", key: "lives", label: "Vidas", default: "3", options: [{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "5", label: "5" }] },
      ]},
      { title: "Gráficos", rows: [{ type: "toggle", key: "glow", label: "Brillo neón", default: true }] },
      { title: "Controles", rows: [{ type: "keys", label: "Mover", value: "Flechas / WASD / swipe" }, { type: "keys", label: "Pausa", value: "Espacio / P" }] },
    ],
  });
  document.addEventListener("nova-theme-change", draw);
  setup();
})();
