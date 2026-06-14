/* Parchís (Ludo) — NOVA ARCADE (v2). P0=rojo (humano) vs IA.
   Hit-testing por posición real de la ficha, salto animado casilla a casilla,
   dado animado, capturas con destello, reglas completas. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const turnEl = document.getElementById("turn"), dieEl = document.getElementById("die"), homeEl = document.getElementById("home");
  const rollBtn = document.getElementById("roll");
  const G = 15, CELL = 34;
  const PCOL = ["#ff3b51", "#3b9bff", "#3bff7b", "#ffd23b"];
  const PDARK = ["#9c1426", "#1f5fb8", "#1f9c4d", "#a07c10"];
  const NAME = ["Rojo (Tú)", "Azul", "Verde", "Amarillo"];

  const TRACK = [
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0],
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7],
    [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [7, 14], [6, 14]
  ];
  const START = [0, 13, 26, 39];
  const HOME = [
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  ];
  // aparcamiento en base: centros en unidades de rejilla (col,row)
  const BASEC = [
    [[2, 11], [4, 11], [2, 13], [4, 13]],
    [[2, 2], [4, 2], [2, 4], [4, 4]],
    [[11, 2], [13, 2], [11, 4], [13, 4]],
    [[11, 11], [13, 11], [11, 13], [13, 13]],
  ];
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  let np, tok, turn, die, state = "idle", busy = false, movable = [], rolled = false;
  let anim = null, dieAnim = 0, dieFace = 0, parts = [], pulse = 0, raf = null;

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._pcA || (window._pcA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function setup() { np = parseInt((NovaSettings.loadCfg("parchis").players) || "4"); tok = []; for (let p = 0; p < 4; p++) tok.push([-1, -1, -1, -1]); turn = 0; die = 0; rolled = false; movable = []; busy = false; anim = null; parts = []; state = "play"; updateHUD(); }

  // posición lógica → centro en unidades de rejilla
  function centerOf(p, pos) { if (pos < 0) return null; if (pos <= 50) { const c = TRACK[(START[p] + pos) % 52]; return [c[0] + 0.5, c[1] + 0.5]; } if (pos <= 55) { const c = HOME[p][pos - 51]; return [c[0] + 0.5, c[1] + 0.5]; } return [7.5, 7.5]; }
  function tokenCenter(p, i) { const pos = tok[p][i]; return pos < 0 ? BASEC[p][i] : centerOf(p, pos); }
  function absCell(p, pos) { return TRACK[(START[p] + pos) % 52]; }
  function updateHUD() { turnEl.textContent = turn === 0 ? "TÚ" : NAME[turn]; dieEl.textContent = die || "–"; homeEl.textContent = `${tok[0].filter(v => v === 56).length}/4`; }

  function start() { setup(); ov.classList.remove("show"); actx(); if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 96); ensure(); nextTurn(); }
  function ensure() { if (raf == null) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  function legalMoves(p, d) {
    const out = [];
    for (let i = 0; i < 4; i++) { const pos = tok[p][i]; if (pos === 56) continue; if (pos < 0) { if (d === 6) out.push(i); continue; } if (pos + d <= 56) out.push(i); }
    return out;
  }
  function nextTurn() {
    if (state !== "play") return;
    if (turn === 0) { busy = false; rollBtn.disabled = false; turnEl.textContent = "TÚ"; return; }
    busy = true; rollBtn.disabled = true; turnEl.textContent = NAME[turn]; setTimeout(aiRoll, 650);
  }
  function rollDie() { return 1 + ((Math.random() * 6) | 0); }
  function animateDie(cb) { dieAnim = 1; let n = 0; const iv = setInterval(() => { dieFace = rollDie(); dieEl.textContent = dieFace; tone(500 + Math.random() * 200, .03, "square", .25); n++; if (n >= 8) { clearInterval(iv); dieAnim = 0; cb(); } }, 55); }

  function humanRoll() {
    if (state !== "play" || turn !== 0 || busy || rolled || dieAnim) return;
    busy = true; rollBtn.disabled = true;
    animateDie(() => { die = rollDie(); dieFace = die; dieEl.textContent = die; rolled = true; tone(660, .08, "triangle", .4); movable = legalMoves(0, die); busy = false; if (!movable.length) { setTimeout(() => endTurn(die === 6), 800); } });
  }
  function aiRoll() {
    if (state !== "play") return;
    animateDie(() => {
      die = rollDie(); dieFace = die; dieEl.textContent = die; tone(620, .08, "triangle", .35);
      const mv = legalMoves(turn, die);
      if (!mv.length) { setTimeout(() => endTurn(die === 6), 500); return; }
      let best = mv[0], bestScore = -1;
      for (const i of mv) { let sc = 0; const pos = tok[turn][i]; const np_ = pos < 0 ? 0 : pos + die; if (np_ <= 50) { const cell = absCell(turn, np_); if (!SAFE.has((START[turn] + np_) % 52) && enemyOn(turn, cell)) sc += 100; } if (pos < 0) sc += 20; if (np_ === 56) sc += 50; sc += (pos < 0 ? 0 : pos); if (sc > bestScore) { bestScore = sc; best = i; } }
      setTimeout(() => doMove(turn, best), 450);
    });
  }
  function enemyOn(p, cell) { if (!cell) return false; for (let q = 0; q < 4; q++) { if (q === p) continue; for (let i = 0; i < 4; i++) { const pos = tok[q][i]; if (pos < 0 || pos > 50) continue; const c = absCell(q, pos); if (c[0] === cell[0] && c[1] === cell[1]) return true; } } return false; }

  // construir trayectoria de saltos (centros de rejilla)
  function buildPath(p, fromPos, toPos) {
    const pts = [];
    if (fromPos < 0) { pts.push(centerOf(p, 0)); }   // sale de base directo a su entrada
    else for (let s = fromPos + 1; s <= toPos; s++) pts.push(centerOf(p, s));
    return pts;
  }
  function doMove(p, i) {
    if (anim) return;
    const fromPos = tok[p][i]; const toPos = fromPos < 0 ? 0 : fromPos + die;
    const startC = tokenCenter(p, i); const path = buildPath(p, fromPos, toPos);
    rolled = false; movable = []; busy = true; rollBtn.disabled = true;
    anim = { p, i, prev: startC, path, seg: 0, t: 0, hop: 0.11, onDone: () => finishMove(p, i, toPos) };
  }
  function finishMove(p, i, toPos) {
    tok[p][i] = toPos; anim = null;
    // captura
    if (toPos <= 50) { const cell = absCell(p, toPos); const absIdx = (START[p] + toPos) % 52; if (!SAFE.has(absIdx)) { for (let q = 0; q < 4; q++) { if (q === p) continue; for (let j = 0; j < 4; j++) { const pos = tok[q][j]; if (pos >= 0 && pos <= 50) { const c = absCell(q, pos); if (c[0] === cell[0] && c[1] === cell[1]) { tok[q][j] = -1; burst((cell[0] + .5) * CELL, (cell[1] + .5) * CELL, PCOL[q]); tone(160, .18, "sawtooth", .45, 80); } } } } } }
    if (toPos === 56) { const c = centerOf(p, 56); burst(c[0] * CELL, c[1] * CELL, PCOL[p]); tone(700, .14, "triangle", .5, 1046); }
    else tone(440, .05, "square", .3);
    updateHUD();
    if (tok[p].every(v => v === 56)) return win(p);
    busy = false; endTurn(die === 6);
  }
  function endTurn(extra) {
    if (state !== "play") return;
    if (extra) { if (turn === 0) { rolled = false; rollBtn.disabled = false; busy = false; return; } else { setTimeout(aiRoll, 450); return; } }
    turn = (turn + 1) % np; rolled = false; updateHUD(); nextTurn();
  }
  function win(p) { state = "over"; NovaAudio.stopMusic(); NovaAudio.play(p === 0 ? "win" : "over"); if (p === 0) for (let k = 0; k < 40; k++) burst(Math.random() * cv.width, Math.random() * cv.height * .6, PCOL[(Math.random() * 4) | 0]); ovTitle.textContent = p === 0 ? "¡GANASTE!" : "FIN"; ovTitle.className = p === 0 ? "win" : "lose"; ovMsg.textContent = `Ganó ${NAME[p]}.`; ovBtn.textContent = "↻ Nueva"; ov.classList.add("show"); }

  function burst(x, y, c) { for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, s = 60 + Math.random() * 140; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: .5 + Math.random() * .4, c, r: 2 + Math.random() * 3 }); } }

  // ── render ──
  let last = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000); last = now; pulse += dt * 4;
    if (anim) {
      anim.t += dt;
      if (anim.t >= anim.hop) { anim.t -= anim.hop; anim.prev = anim.path[anim.seg]; anim.seg++; tone(720, .03, "square", .2); if (anim.seg >= anim.path.length) { const d = anim.onDone; anim.onDone = null; anim = null; d && d(); } }
    }
    parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; });
    parts = parts.filter(p => p.life > 0);
    draw();
    if (state !== "play" && !parts.length && !anim) { /* sigue por overlay; bucle continúa para pulse */ }
  }
  function gpx(c) { return c * CELL; }
  function draw() {
    ctx.fillStyle = "#0d1018"; ctx.fillRect(0, 0, cv.width, cv.height);
    const corners = [[0, 9], [0, 0], [9, 0], [9, 9]];
    corners.forEach((c, p) => { ctx.fillStyle = PCOL[p]; ctx.globalAlpha = .14; ctx.beginPath(); ctx.roundRect(c[0] * CELL, c[1] * CELL, 6 * CELL, 6 * CELL, 10); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = PCOL[p]; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(c[0] * CELL, c[1] * CELL, 6 * CELL, 6 * CELL, 10); ctx.stroke(); });
    // pista
    TRACK.forEach((cell, idx) => { ctx.fillStyle = "#1b2030"; ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; rrect(cell[0] * CELL, cell[1] * CELL, CELL, CELL, 5); ctx.fill(); ctx.stroke(); if (SAFE.has(idx)) { ctx.fillStyle = "#ffd23b"; ctx.globalAlpha = .22; rrect(cell[0] * CELL, cell[1] * CELL, CELL, CELL, 5); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = "rgba(255,210,60,.5)"; ctx.font = "12px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", cell[0] * CELL + CELL / 2, cell[1] * CELL + CELL / 2); } });
    START.forEach((s, p) => { const cell = TRACK[s]; ctx.fillStyle = PCOL[p]; ctx.globalAlpha = .55; rrect(cell[0] * CELL, cell[1] * CELL, CELL, CELL, 5); ctx.fill(); ctx.globalAlpha = 1; });
    HOME.forEach((col, p) => { col.forEach(cell => { ctx.fillStyle = PCOL[p]; ctx.globalAlpha = .38; rrect(cell[0] * CELL, cell[1] * CELL, CELL, CELL, 5); ctx.fill(); ctx.globalAlpha = 1; }); });
    // centro
    ctx.fillStyle = "#11151f"; rrect(6 * CELL, 6 * CELL, 3 * CELL, 3 * CELL, 8); ctx.fill();
    ctx.fillStyle = "#ffd23b"; ctx.font = '700 22px "Bungee"'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", 7.5 * CELL, 7.5 * CELL);
    // fichas (las del jugador en movimiento se dibujan con anim)
    for (let p = 0; p < np; p++) for (let i = 0; i < 4; i++) {
      if (anim && anim.p === p && anim.i === i) continue;
      drawToken(p, i, tokenCenter(p, i));
    }
    if (anim) { const c = curAnimCenter(); drawToken(anim.p, anim.i, c, true); }
    // partículas
    parts.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 1.8); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }); ctx.globalAlpha = 1;
    // dado grande en el centro de una casa libre (esquina sup-izq del tablero) cuando hay valor
    if (die && turn >= 0) drawDie(die, 7.5 * CELL, 7.5 * CELL - 0); // (el ★ central ya marca; el HUD muestra el dado)
  }
  function curAnimCenter() { const k = Math.min(1, anim.t / anim.hop); const from = anim.prev, to = anim.path[anim.seg] || anim.prev; const e = k; const x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e; const arc = Math.sin(Math.PI * e) * 0.25; return [x, y - arc]; }
  function drawToken(p, i, center, lifted) {
    if (!center) return;
    const x = center[0] * CELL, y = center[1] * CELL, r = CELL / 2 - 6;
    const hot = (turn === 0 && p === 0 && rolled && movable.includes(i) && !anim);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + r * .7, r * .8, r * .3, 0, 0, 7); ctx.fill();
    if (hot) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 12 + Math.sin(pulse) * 6; }
    const g = ctx.createRadialGradient(x - r * .3, y - r * .4, r * .2, x, y, r); g.addColorStop(0, PCOL[p]); g.addColorStop(1, PDARK[p]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - (lifted ? 2 : 0), r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .4, r * .25, 0, 7); ctx.fill();
    ctx.strokeStyle = hot ? "#fff" : "rgba(255,255,255,.45)"; ctx.lineWidth = hot ? 3 : 1.5; ctx.beginPath(); ctx.arc(x, y - (lifted ? 2 : 0), r, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function drawDie() { /* el dado se muestra en el HUD; placeholder por compatibilidad */ }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  cv.addEventListener("click", e => {
    if (state !== "play" || turn !== 0 || !rolled || busy || anim) return;
    const rect = cv.getBoundingClientRect(); const x = (e.clientX - rect.left) * (cv.width / rect.width), y = (e.clientY - rect.top) * (cv.height / rect.height);
    let bestI = -1, bestD = 1e9;
    for (const i of movable) { const c = tokenCenter(0, i); if (!c) continue; const px = c[0] * CELL, py = c[1] * CELL; const d = Math.hypot(px - x, py - y); if (d < CELL * 0.55 && d < bestD) { bestD = d; bestI = i; } }
    if (bestI >= 0) doMove(0, bestI);
  });

  ovBtn.onclick = () => start();
  rollBtn.onclick = humanRoll;
  document.addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); humanRoll(); } });
  document.getElementById("restart").onclick = () => { state = "idle"; tok = null; cancelAnimationFrame(raf); raf = null; ovTitle.textContent = "PARCHÍS"; ovTitle.className = ""; ovMsg.textContent = "Tú (rojo) vs IA. Saca un 6 para salir."; ovBtn.textContent = "▶ Jugar"; ov.classList.add("show"); };

  NovaSettings.mount({
    gameId: "parchis", onChange: () => { }, extra: [
      { title: "Juego", rows: [{ type: "select", key: "players", label: "Jugadores", default: "4", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }] }] },
      { title: "Controles", rows: [{ type: "keys", label: "Tirar dado", value: "Botón / Espacio" }, { type: "keys", label: "Mover ficha", value: "Clic en ficha resaltada" }] },
      { title: "Reglas", rows: [{ type: "info", label: "Salir de base", value: "Sacando un 6" }, { type: "info", label: "Un 6", value: "Repite turno" }, { type: "info", label: "★ casillas", value: "Seguras (sin captura)" }] },
    ]
  });
})();
