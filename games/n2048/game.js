/* 2048 — NOVA ARCADE (v2)
   Fichas con deslizamiento y fusión animados, pop al aparecer/fusionar,
   paleta de color por valor. Lógica canónica de 2048. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const scoreEl = document.getElementById("score"), bestEl = document.getElementById("best");
  let cfg = Object.assign({ size: "4", glow: true }, NovaSettings.loadCfg("n2048"));
  const SIZE = 420, GAP = 12, ANIM = 0.10;
  let N, cell, tiles, score, state = "idle", won = false, keepGoing = false;
  let animT = 1, pending = null, raf = null, lastFrame = 0;
  let best = +(localStorage.getItem("n2048-best") || 0); bestEl.textContent = best;

  const COLORS = {
    2: ["#3a4050", "#e9eef7"], 4: ["#46506a", "#e9eef7"], 8: ["#f2b179", "#27200f"], 16: ["#f59563", "#27200f"],
    32: ["#f67c5f", "#fff"], 64: ["#f65e3b", "#fff"], 128: ["#edcf72", "#27200f"], 256: ["#edcc61", "#27200f"],
    512: ["#edc850", "#27200f"], 1024: ["#e8b923", "#27200f"], 2048: ["#edc22e", "#27200f"]
  };
  const colorOf = v => COLORS[v] || ["#22d3aa", "#04221c"];

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._nA || (window._nA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, vv, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "sine"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (vv || .35); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  const cellPx = i => GAP + i * (cell + GAP);
  function setup() {
    N = parseInt(cfg.size); cell = (SIZE - GAP * (N + 1)) / N;
    tiles = []; score = 0; won = false; keepGoing = false; animT = 1; pending = null; scoreEl.textContent = 0;
    addRandom(); addRandom(); ensure(); draw();
  }
  function addRandom() {
    const occ = new Set(tiles.map(t => t.x + "," + t.y)); const free = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!occ.has(x + "," + y)) free.push([x, y]);
    if (!free.length) return; const [x, y] = free[(Math.random() * free.length) | 0];
    tiles.push({ x, y, value: Math.random() < 0.9 ? 2 : 4, px: cellPx(x), py: cellPx(y), pop: 1, born: true });
  }
  function start() { if (state === "play") return; if (state === "over" || state === "idle") setup(); state = "play"; ov.classList.remove("show"); actx(); if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 100); ensure(); }
  function ensure() { lastFrame = performance.now(); if (raf == null) raf = requestAnimationFrame(frame); }

  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function gmap() { const g = Array.from({ length: N }, () => Array(N).fill(null)); tiles.forEach(t => g[t.y][t.x] = t); return g; }

  function move(dir) {
    if (state === "idle" || state === "over") { start(); if (state !== "play") return; }
    if (state !== "play" || animT < 1) { if (animT < 1) pending = dir; return; }
    const [vx, vy] = VEC[dir]; const g = gmap();
    const xs = [...Array(N).keys()]; const ys = [...Array(N).keys()];
    if (vx === 1) xs.reverse(); if (vy === 1) ys.reverse();
    let moved = false, gained = 0;
    tiles.forEach(t => { t.merged = false; t.remove = false; t.sx = t.px; t.sy = t.py; });
    const occ = Array.from({ length: N }, () => Array(N).fill(null));
    tiles.forEach(t => occ[t.y][t.x] = t);
    ys.forEach(y => xs.forEach(x => {
      const t = occ[y][x]; if (!t) return;
      let cx = x, cy = y;
      while (true) {
        const nx = cx + vx, ny = cy + vy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
        const dest = occ[ny][nx];
        if (dest && !dest.remove) { if (dest.value === t.value && !dest.merged && !t.merged) { cx = nx; cy = ny; } break; }
        cx = nx; cy = ny;
      }
      const target = occ[cy][cx];
      if (target && target !== t && target.value === t.value && !target.merged) {
        // fusión: t entra y se elimina; target dobla
        occ[t.y][t.x] = null; t.x = cx; t.y = cy; t.remove = true; t.tx = cellPx(cx); t.ty = cellPx(cy);
        target.merged = true; target.willDouble = true; gained += target.value * 2; if (target.value * 2 === 2048) won = true;
        moved = true;
      } else if (cx !== x || cy !== y) {
        occ[t.y][t.x] = null; t.x = cx; t.y = cy; occ[cy][cx] = t; t.tx = cellPx(cx); t.ty = cellPx(cy);
        moved = true;
      } else { t.tx = t.px; t.ty = t.py; }
    }));
    if (!moved) return;
    tiles.forEach(t => { if (t.tx == null) { t.tx = t.px; t.ty = t.py; } });
    score += gained; scoreEl.textContent = score;
    tone(gained ? 540 : 360, .06, "square", gained ? .4 : .25, gained ? 740 : 0);
    animT = 0; ensure();
  }
  function finishMove() {
    tiles = tiles.filter(t => !t.remove);
    tiles.forEach(t => { if (t.willDouble) { t.value *= 2; t.pop = 1; t.willDouble = false; if (t.value >= 128) tone(660, .1, "triangle", .4, 990); } t.sx = t.tx = t.px = cellPx(t.x); t.sy = t.ty = t.py = cellPx(t.y); });
    addRandom();
    if (won && !keepGoing) return win();
    if (!canMove()) return over();
  }
  function canMove() {
    if (tiles.length < N * N) return true;
    const g = gmap();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = g[y][x].value; if (x < N - 1 && g[y][x + 1].value === v) return true; if (y < N - 1 && g[y + 1][x].value === v) return true; }
    return false;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - lastFrame) / 1000; lastFrame = now; if (dt > .1) dt = .1;
    if (animT < 1) {
      animT = Math.min(1, animT + dt / ANIM);
      const e = 1 - Math.pow(1 - animT, 3);
      tiles.forEach(t => { t.px = t.sx + (t.tx - t.sx) * e; t.py = t.sy + (t.ty - t.sy) * e; });
      if (animT >= 1) { finishMove(); if (pending && state === "play") { const d = pending; pending = null; move(d); } }
    }
    tiles.forEach(t => { if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 5); });
    draw();
  }

  function draw() {
    ctx.fillStyle = "#10131c"; ctx.beginPath(); ctx.roundRect(0, 0, SIZE, SIZE, 14); ctx.fill();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = "rgba(255,255,255,.045)"; ctx.beginPath(); ctx.roundRect(cellPx(x), cellPx(y), cell, cell, 8); ctx.fill(); }
    // fichas que se fusionan se dibujan encima
    const sorted = tiles.slice().sort((a, b) => (a.remove === b.remove) ? 0 : (a.remove ? 1 : -1));
    sorted.forEach(t => {
      const [bg, fg] = colorOf(t.value);
      // born: crece de 0→1 (aparición). fusión/normal: leve rebote 1→1.14→1
      const scale = t.born ? (1 - t.pop) : (t.pop > 0 ? 1 + t.pop * 0.14 : 1);
      const cs = Math.max(0.01, scale);
      const cx = t.px + cell / 2, cy = t.py + cell / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(cs, cs); ctx.translate(-cell / 2, -cell / 2);
      ctx.fillStyle = bg; if (cfg.glow && t.value >= 64) { ctx.shadowColor = bg; ctx.shadowBlur = 14; }
      ctx.beginPath(); ctx.roundRect(0, 0, cell, cell, 8); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = fg; const len = String(t.value).length; ctx.font = `700 ${Math.max(16, cell / (len > 3 ? 3.4 : 2.4))}px "Chakra Petch", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t.value, cell / 2, cell / 2 + 1);
      ctx.restore();
    });
    tiles.forEach(t => { if (t.born && t.pop <= 0) t.born = false; });
  }

  function win() { state = "over"; NovaAudio.stopMusic(); NovaAudio.play("win"); saveBest(); ovTitle.textContent = "¡2048!"; ovTitle.className = "win"; ovMsg.innerHTML = `Puntos: <b>${score}</b>. ¿Seguir jugando?`; ovBtn.textContent = "▶ Seguir"; ov.classList.add("show"); keepGoing = true; won = false; }
  function over() { state = "over"; NovaAudio.stopMusic(); NovaAudio.play("over"); saveBest(); ovTitle.textContent = "SIN MOVIMIENTOS"; ovTitle.className = "lose"; ovMsg.innerHTML = `Puntos: <b>${score}</b> · Récord: <b>${best}</b>`; ovBtn.textContent = "↻ Reintentar"; ov.classList.add("show"); }
  function saveBest() { if (score > best) { best = score; localStorage.setItem("n2048-best", best); bestEl.textContent = best; } }

  const keymap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  document.addEventListener("keydown", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; const d = keymap[k]; if (d) { e.preventDefault(); move(d); } });
  document.querySelectorAll("#dpad button").forEach(b => b.onclick = () => move(b.dataset.dir));
  let tsx, tsy; cv.addEventListener("touchstart", e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); });
  ovBtn.onclick = () => { if (state === "over" && keepGoing && ovBtn.textContent.includes("Seguir")) { state = "play"; ov.classList.remove("show"); ensure(); return; } if (state === "over") setup(); start(); };
  document.getElementById("restart").onclick = () => { setup(); state = "idle"; ovTitle.textContent = "2048"; ovTitle.className = ""; ovMsg.textContent = "Flechas / WASD para juntar fichas iguales."; ovBtn.textContent = "▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({
    gameId: "n2048", onChange: (k) => { cfg = Object.assign(cfg, NovaSettings.loadCfg("n2048")); if (k === "size") { setup(); state = "idle"; ovTitle.textContent = "2048"; ovTitle.className = ""; ovMsg.textContent = "Flechas / WASD para juntar fichas iguales."; ovBtn.textContent = "▶ Jugar"; ov.classList.add("show"); } else draw(); }, extra: [
      { title: "Juego", rows: [{ type: "select", key: "size", label: "Tamaño", default: "4", options: [{ value: "4", label: "4×4 (clásico)" }, { value: "5", label: "5×5" }, { value: "6", label: "6×6 (fácil)" }] }] },
      { title: "Gráficos", rows: [{ type: "toggle", key: "glow", label: "Brillo neón", default: true }] },
      { title: "Controles", rows: [{ type: "keys", label: "Mover", value: "Flechas / WASD / swipe" }] },
    ]
  });
  document.addEventListener("nova-theme-change", draw);
  setup();
})();
