/* Lucky Spin (Tragaperras) — NOVA ARCADE. Fichas virtuales, sin dinero real.
   5 líneas de pago, resaltado animado de combinaciones, tabla de pagos en pantalla,
   monedas, parpadeos y sonidos sintetizados. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const credEl = document.getElementById("credits"), betEl = document.getElementById("bet"), winEl = document.getElementById("lastwin");

  // símbolos: peso (rareza) y pago ×apuesta por 3-en-línea
  const SYM = [
    { e: "🍒", w: 7, pay: 3, c: "#ff5b6e" },
    { e: "🍋", w: 6, pay: 5, c: "#ffe14d" },
    { e: "🔔", w: 5, pay: 8, c: "#ffb02e" },
    { e: "⭐", w: 4, pay: 12, c: "#7ad0ff" },
    { e: "💎", w: 2, pay: 25, c: "#3bff9e" },
    { e: "7️⃣", w: 1, pay: 60, c: "#ff3bd0" },
  ];
  const JACK = 5; // índice del 7
  const BETS = [1, 5, 10, 25, 50];
  const REELS = 3, ROWS = 3;

  // geometría: rodillos a la izquierda, tabla de pagos a la derecha
  const RW = 104, RH = 96, GAP = 10, X0 = 14, Y0 = 28;
  const PAYX = X0 + REELS * RW + (REELS - 1) * GAP + 14; // x panel pagos
  const MW = 554;                 // ancho del cuerpo de la máquina (resto = columna de la palanca)
  // 5 líneas de pago (cada una: [row en reel0, reel1, reel2]) + color
  const LINES = [
    { rows: [1, 1, 1], c: "#3bff9e" },  // centro
    { rows: [0, 0, 0], c: "#7ad0ff" },  // arriba
    { rows: [2, 2, 2], c: "#ffb02e" },  // abajo
    { rows: [0, 1, 2], c: "#ff5b6e" },  // diagonal ↘
    { rows: [2, 1, 0], c: "#ff3bd0" },  // diagonal ↗
  ];

  let cfg = Object.assign({ glow: true, fast: false }, NovaSettings.loadCfg("slots"));
  let credits, betIdx, reels, spinning, lastWin, state = "idle", raf = null;
  let wins = [];          // líneas ganadoras activas {line, sym, cells, amount}
  let coins = [];         // partículas de monedas
  let flash = 0;          // flash de pantalla
  let winAnim = 0, winShown = 0, winTarget = 0; // conteo animado
  let pulse = 0;          // fase de parpadeo
  let bigText = null, bigT = 0;
  let anticip = -1, anticipSym = -1, anticipBeat = 0;   // anticipación último rodillo
  let jackpotShow = 0, shake = 0;                        // secuencia jackpot a pantalla completa

  // ---------- audio sintetizado (respeta volumen/mute de NovaAudio) ----------
  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._slotAudio || (window._slotAudio = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(freq, dur, type = "square", vol = 0.5) {
    try {
      const A = actx(), st = NovaAudio.get();
      const g = A.createGain(), o = A.createOscillator();
      o.type = type; o.frequency.value = freq;
      const v = (st.muteSfx ? 0 : st.sfx) * st.master * vol;
      g.gain.setValueAtTime(0.0001, A.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), A.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + dur);
      o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + dur + 0.02);
    } catch (e) {}
  }
  function sweepDown() { for (let i = 0; i < 6; i++) setTimeout(() => tone(700 - i * 80, 0.06, "sawtooth", 0.25), i * 28); }
  function reelStop(i) { tone(260 + i * 90, 0.07, "square", 0.5); tone(130 + i * 45, 0.05, "triangle", 0.4); }
  function coinTick() { tone(900 + Math.random() * 300, 0.05, "square", 0.35); }
  function winJingle(big) {
    const seq = big ? [523, 659, 784, 1046, 1318, 1568] : [523, 659, 784];
    seq.forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.5), i * 90));
  }
  function jackpotFanfare() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => setTimeout(() => { tone(f, 0.22, "square", 0.55); tone(f / 2, 0.22, "triangle", 0.3); }, i * 130));
  }
  function nearMiss() { tone(330, 0.18, "sawtooth", 0.4); setTimeout(() => tone(294, 0.22, "sawtooth", 0.35), 120); }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function weightedSym() { const tot = SYM.reduce((a, s) => a + s.w, 0); let r = Math.random() * tot; for (let i = 0; i < SYM.length; i++) { if ((r -= SYM[i].w) < 0) return i; } return 0; }
  function strip() { return Array.from({ length: 32 }, () => weightedSym()); }

  function load() {
    credits = +(localStorage.getItem("slots-credits") || 100); betIdx = 1;
    reels = Array.from({ length: REELS }, () => ({ s: strip(), pos: Math.random() * 32, vel: 0, stopAt: 0, spinning: false, blur: 0 }));
    spinning = false; lastWin = 0; wins = []; coins = []; updateHUD();
  }
  function save() { localStorage.setItem("slots-credits", credits); }
  function updateHUD() { credEl.textContent = credits; betEl.textContent = BETS[betIdx]; winEl.textContent = lastWin; }

  function start() { if (state === "play") return; state = "play"; ov.classList.remove("show"); actx(); if (credits <= 0) { credits = 100; save(); } updateHUD(); ensureLoop(); }

  function spin() {
    if (state !== "play" || spinning) return;
    const bet = BETS[betIdx];
    if (credits < bet) { flashMsg("Sin créditos: pulsa Recargar."); return; }
    credits -= bet; lastWin = 0; wins = []; winShown = 0; winTarget = 0; anticip = -1; jackpotShow = 0; updateHUD(); save();
    spinning = true; sweepDown();
    const t = performance.now();
    const base = cfg.fast ? 450 : 850;
    reels.forEach((r, i) => { r.spinning = true; r.vel = 0.85 + Math.random() * 0.12; r.stopAt = t + base + i * (cfg.fast ? 220 : 360); });
    ensureLoop();
  }

  function ensureLoop() { if (raf == null) raf = requestAnimationFrame(loop); }

  function loop(now) {
    pulse += 0.12;
    let anySpin = false;
    reels.forEach((r, i) => {
      if (r.spinning) {
        anySpin = true; r.pos = (r.pos + r.vel) % r.s.length; r.blur = Math.min(1, r.vel);
        if (now >= r.stopAt) {
          r.vel *= 0.9;
          if (r.vel < 0.05) {
            r.pos = Math.round(r.pos) % r.s.length; r.spinning = false; r.blur = 0; reelStop(i);
            // ANTICIPACIÓN: al fijar el penúltimo, si los previos coinciden en el centro, alarga el último
            if (i === REELS - 2 && anticip < 0) {
              const c0 = symIdxAt(reels[0], 1); let allMatch = true;
              for (let j = 0; j <= i; j++) if (symIdxAt(reels[j], 1) !== c0) { allMatch = false; break; }
              const last = reels[REELS - 1];
              if (allMatch && last.spinning) { last.stopAt = now + (cfg.fast ? 1000 : 1700); last.vel = 0.32; anticip = REELS - 1; anticipSym = c0; anticipBeat = 0; tone(300, .25, "sawtooth", .35, 220); }
            }
            if (i === anticip) anticip = -1;   // el último ya cayó
          }
        }
      } else r.blur *= 0.8;
    });
    // latidos de tensión durante la anticipación
    if (anticip >= 0) { anticipBeat += 1; if (anticipBeat % 11 === 0) tone(520 + (anticipBeat / 11) * 60, .05, "square", .4); }
    if (jackpotShow > 0) jackpotShow--;
    if (shake > 0) shake = Math.max(0, shake - 0.06);
    if (spinning && !anySpin) { spinning = false; evaluate(); }
    // conteo animado de ganancia
    if (winShown < winTarget) { winShown = Math.min(winTarget, winShown + Math.max(1, Math.ceil((winTarget - winShown) * 0.12))); lastWin = winShown; updateHUD(); if (Math.random() < .6) coinTick(); }
    // monedas
    coins.forEach(c => { c.vy += 0.4; c.x += c.vx; c.y += c.vy; c.life--; c.rot += c.vr; });
    coins = coins.filter(c => c.life > 0 && c.y < H + 30);
    if (flash > 0) flash--;
    if (bigT > 0) bigT--;
    stepLever();
    draw();
    // seguir animando si hay algo vivo
    const alive = anySpin || coins.length || winShown < winTarget || flash > 0 || (wins.length && state === "play") || bigT > 0 || leverActive() || jackpotShow > 0 || shake > 0;
    if (alive) raf = requestAnimationFrame(loop); else { raf = null; draw(); }
  }

  function symIdxAt(r, row) { const idx = (Math.round(r.pos) + row) % r.s.length; return r.s[(idx + r.s.length) % r.s.length]; }

  function evaluate() {
    wins = []; let total = 0, jackpot = false, twoJack = false;
    LINES.forEach((ln, li) => {
      const idxs = reels.map((r, ri) => symIdxAt(r, ln.rows[ri]));
      if (idxs[0] === idxs[1] && idxs[1] === idxs[2]) {
        const sym = idxs[0]; const amount = SYM[sym].pay * BETS[betIdx];
        total += amount; if (sym === JACK) jackpot = true;
        wins.push({ li, sym, amount, cells: ln.rows.map((row, ri) => ({ ri, row })), c: ln.c });
      } else {
        // cerezas CONSECUTIVAS desde la izquierda (solo línea central) — no cuenta cerezas separadas
        if (li === 0) {
          let cc = 0; for (let r = 0; r < REELS; r++) { if (idxs[r] === 0) cc++; else break; }
          if (cc >= 2) { const amount = Math.ceil(1.5 * BETS[betIdx]); total += amount; wins.push({ li, sym: 0, partial: true, amount, cells: ln.rows.slice(0, cc).map((row, ri) => ({ ri, row })), c: ln.c }); }
        }
        if (idxs.filter(s => s === JACK).length === 2) twoJack = true;
      }
    });
    if (total > 0) {
      credits += total; winTarget = total; winShown = 0;
      const big = total >= BETS[betIdx] * 15;
      spawnCoins(jackpot ? 90 : big ? 45 : 18);
      flash = jackpot ? 50 : big ? 24 : 10;
      if (jackpot) { jackpotFanfare(); bigText = null; bigT = 0; jackpotShow = 200; shake = 0.9; }
      else if (big) { winJingle(true); bigText = "¡GRAN PREMIO!"; bigT = 110; shake = 0.5; }
      else winJingle(false);
    } else {
      lastWin = 0; updateHUD();
      if (twoJack) nearMiss();
    }
    save();
    ensureLoop();
  }

  function spawnCoins(n) {
    for (let i = 0; i < n; i++) coins.push({ x: X0 + Math.random() * (REELS * RW), y: Y0 + RH * 1.5, vx: (Math.random() - .5) * 6, vy: -2 - Math.random() * 5, life: 60 + Math.random() * 40, rot: Math.random() * 6, vr: (Math.random() - .5) * .4 });
  }

  function flashMsg(t) { ovTitle.textContent = "LUCKY SPIN"; ovTitle.className = ""; ovMsg.textContent = t; ovBtn.textContent = "▶ Seguir"; ov.classList.add("show"); state = "idle"; }

  // ---------- palanca (brazo giratorio montado al costado, estilo one-armed bandit) ----------
  const PIVX = MW + 22, PIVY = 250, L = 116, KR = 30, REST = 0.16, MAXA = 1.22;
  const lever = { ang: REST, vel: 0, grabbed: false, armed: false };
  function ballXY(a) { return { x: PIVX + Math.sin(a) * L, y: PIVY - Math.cos(a) * L }; }
  function stepLever() {
    if (!lever.grabbed) { lever.vel += (REST - lever.ang) * 0.30; lever.vel *= 0.62; lever.ang += lever.vel; if (Math.abs(lever.ang - REST) < 0.002 && Math.abs(lever.vel) < 0.002) { lever.ang = REST; lever.vel = 0; } }
    lever.ang = Math.max(REST - 0.05, Math.min(MAXA, lever.ang));
  }
  function leverActive() { return lever.grabbed || Math.abs(lever.vel) > 0.0008 || Math.abs(lever.ang - REST) > 0.004; }
  function drawLever() {
    const k = ballXY(lever.ang);
    // base de montaje en el costado de la máquina
    ctx.fillStyle = "#3a3f4a"; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 3;
    roundRect(MW - 6, PIVY - 26, 30, 52, 8); ctx.fill(); ctx.stroke();
    // pivote
    ctx.fillStyle = "#1b1f29"; ctx.beginPath(); ctx.arc(PIVX, PIVY, 13, 0, 7); ctx.fill();
    ctx.fillStyle = "#454c5a"; ctx.beginPath(); ctx.arc(PIVX, PIVY, 6, 0, 7); ctx.fill();
    // vástago cromado (sombra + cuerpo + brillo)
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(PIVX, PIVY); ctx.lineTo(k.x, k.y); ctx.stroke();
    ctx.strokeStyle = "#9aa0ad"; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(PIVX, PIVY); ctx.lineTo(k.x, k.y); ctx.stroke();
    ctx.strokeStyle = "#e6ebf2"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(PIVX - 2, PIVY - 1); ctx.lineTo(k.x - 2, k.y - 1); ctx.stroke();
    // bola roja con brillo
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(k.x, k.y + KR * .7, KR * .8, KR * .22, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(k.x - KR * .35, k.y - KR * .4, KR * .12, k.x, k.y, KR + 6);
    g.addColorStop(0, "#ff9b9b"); g.addColorStop(.45, "#e0182f"); g.addColorStop(1, "#7c0d18");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(k.x, k.y, KR, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(k.x - KR * .32, k.y - KR * .34, KR * .26, 0, 7); ctx.fill();
    if (!lever.grabbed && lever.ang < REST + 0.05 && !spinning) { ctx.fillStyle = "#8893a5"; ctx.font = "12px 'Chakra Petch'"; ctx.textAlign = "center"; ctx.fillText("TIRA ↓", k.x, k.y - KR - 8); }
  }
  function cvPos(e) { const r = cv.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top; return { x: cx / r.width * W, y: cy / r.height * H }; }
  function leverDown(e) { if (state !== "play") return; const p = cvPos(e); const k = ballXY(lever.ang); if (Math.hypot(p.x - k.x, p.y - k.y) < KR + 24 || (p.x > MW + 8 && p.y < PIVY + 20)) { lever.grabbed = true; lever.armed = false; ensureLoop(); if (e.cancelable) e.preventDefault(); } }
  function leverMove(e) { if (!lever.grabbed) return; const p = cvPos(e); let a = Math.atan2(p.x - PIVX, -(p.y - PIVY)); lever.ang = Math.max(REST - 0.05, Math.min(MAXA, a)); if ((lever.ang - REST) / (MAXA - REST) > 0.7) lever.armed = true; if (e.cancelable) e.preventDefault(); }
  function leverUp() { if (!lever.grabbed) return; lever.grabbed = false; lever.vel = 0; tone(180, .06, "square", .4); if (lever.armed) { lever.armed = false; spin(); } ensureLoop(); }
  cv.addEventListener("mousedown", leverDown); window.addEventListener("mousemove", leverMove); window.addEventListener("mouseup", leverUp);
  cv.addEventListener("touchstart", leverDown, { passive: false }); window.addEventListener("touchmove", leverMove, { passive: false }); window.addEventListener("touchend", leverUp);

  // ---------- dibujo ----------
  function cellXY(ri, row) { return { x: X0 + ri * (RW + GAP), y: Y0 + 8 + row * RH }; }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 12 * shake, (Math.random() - .5) * 12 * shake);
    ctx.fillStyle = css("--bg-2"); ctx.fillRect(-14, -14, W + 28, H + 28);
    // marco máquina con doble borde neón
    ctx.strokeStyle = css("--accent"); ctx.lineWidth = 3; roundRect(6, 6, MW - 12, H - 12, 14); ctx.stroke();

    // rodillos
    for (let i = 0; i < REELS; i++) {
      const x = X0 + i * (RW + GAP);
      ctx.fillStyle = css("--surface-solid"); ctx.strokeStyle = css("--border"); ctx.lineWidth = 2;
      roundRect(x, Y0, RW, RH * ROWS + 12, 12); ctx.fill(); ctx.stroke();
      const r = reels[i];
      // sombreado superior/inferior para dar profundidad
      const grd = ctx.createLinearGradient(0, Y0, 0, Y0 + RH * ROWS + 12);
      grd.addColorStop(0, "rgba(0,0,0,.35)"); grd.addColorStop(.5, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,.35)");
      ctx.save(); roundRect(x, Y0, RW, RH * ROWS + 12, 12); ctx.clip();
      for (let row = -1; row <= ROWS; row++) {
        const frac = (Math.round(r.pos) - r.pos);
        const s = SYM[symIdxAt(r, row)];
        const cy = Y0 + 10 + (row + frac) * RH + RH / 2;
        const fs = row === 1 ? 56 : 50;
        ctx.font = `${fs}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (r.blur > 0.3) {
          // motion-blur: estiramiento vertical + estela desvanecida
          const stretch = 1 + Math.min(1.5, r.blur * 1.7);
          ctx.save(); ctx.translate(x + RW / 2, cy); ctx.scale(1, stretch);
          ctx.globalAlpha = 0.5; ctx.fillText(s.e, 0, 0);
          ctx.globalAlpha = 0.16; ctx.fillText(s.e, 0, -RH / stretch); ctx.fillText(s.e, 0, RH / stretch);
          ctx.restore(); ctx.globalAlpha = 1;
        } else { ctx.fillText(s.e, x + RW / 2, cy); }
      }
      ctx.restore();
      // glow de anticipación en el último rodillo
      if (anticip === i && r.spinning) {
        const gl = 0.5 + Math.sin(pulse * 2.2) * 0.5;
        ctx.save(); ctx.strokeStyle = SYM[anticipSym] ? SYM[anticipSym].c : "#ffd24d"; ctx.globalAlpha = 0.5 + gl * 0.5; ctx.lineWidth = 4 + gl * 3;
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 18 * gl; roundRect(x - 2, Y0 - 2, RW + 4, RH * ROWS + 16, 13); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    }

    // líneas y celdas ganadoras (parpadeo)
    if (wins.length && !spinning) {
      const a = 0.45 + Math.sin(pulse) * 0.35;
      wins.forEach(win => {
        ctx.strokeStyle = win.c; ctx.lineWidth = 3; ctx.globalAlpha = a;
        // recuadro alrededor de cada celda ganadora
        win.cells.forEach(c => { const p = cellXY(c.ri, c.row); roundRect(p.x + 3, p.y + 3, RW - 6, RH - 6, 10); ctx.stroke(); });
        // polilínea a través de los centros
        ctx.beginPath();
        win.cells.forEach((c, k) => { const p = cellXY(c.ri, c.row); const mx = p.x + RW / 2, my = p.y + RH / 2; k ? ctx.lineTo(mx, my) : ctx.moveTo(mx, my); });
        ctx.lineWidth = 2; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    drawPaytable();
    drawCoins();
    drawLever();

    if (flash > 0) { ctx.fillStyle = css("--accent-3"); ctx.globalAlpha = flash / 90; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

    if (bigT > 0 && bigText) {
      const sc = 1 + Math.sin(pulse * 1.5) * 0.06;
      ctx.save(); ctx.translate(X0 + REELS * RW / 2 + 8, Y0 + RH * 1.5 + 6); ctx.scale(sc, sc);
      ctx.font = "700 30px 'Bungee', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.strokeText(bigText, 0, 0);
      ctx.fillStyle = SYM[JACK].c; ctx.fillText(bigText, 0, 0); ctx.restore();
    }

    if (jackpotShow > 0) drawJackpot();
    ctx.restore();   // cierra el wrap del screen-shake
  }

  function drawJackpot() {
    const cx = MW / 2, cy = H / 2, k = jackpotShow;
    // oscurecer + rayos giratorios desde el centro
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-14, -14, W + 28, H + 28);
    ctx.translate(cx, cy); ctx.rotate(pulse * 0.5);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI / 8);
      ctx.fillStyle = (i % 2 ? "#ffd24d" : "#ff7b2e"); ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -28); ctx.lineTo(W, 28); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
    // luces parpadeantes en el marco
    for (let i = 0; i < 28; i++) {
      const t = i / 28, on = (Math.floor(pulse * 3) + i) % 2;
      ctx.fillStyle = on ? "#fff2a0" : "#7a4a10";
      const peri = perimeter(t); ctx.beginPath(); ctx.arc(peri.x, peri.y, 4, 0, 7); ctx.fill();
    }
    // texto JACKPOT con pulso y rayo
    const sc = 1.0 + Math.sin(pulse * 2) * 0.12;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 52px 'Bungee', sans-serif"; ctx.lineWidth = 7; ctx.strokeStyle = "#5a2a00"; ctx.strokeText("JACKPOT", 0, -6);
    const grd = ctx.createLinearGradient(0, -30, 0, 30); grd.addColorStop(0, "#fff7c2"); grd.addColorStop(.5, "#ffd23b"); grd.addColorStop(1, "#ff8a2e");
    ctx.fillStyle = grd; ctx.shadowColor = "#ffd24d"; ctx.shadowBlur = 24; ctx.fillText("JACKPOT", 0, -6); ctx.shadowBlur = 0;
    ctx.font = "700 22px 'Bungee', sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText("+" + winTarget, 0, 34);
    ctx.restore();
  }
  function perimeter(t) {
    // recorre el borde de la máquina [6..MW-6, 6..H-6]
    const x0 = 8, y0 = 8, x1 = MW - 8, y1 = H - 8, w = x1 - x0, h = y1 - y0, per = 2 * (w + h); let d = t * per;
    if (d < w) return { x: x0 + d, y: y0 }; d -= w;
    if (d < h) return { x: x1, y: y0 + d }; d -= h;
    if (d < w) return { x: x1 - d, y: y1 }; d -= w;
    return { x: x0, y: y1 - d };
  }

  function drawPaytable() {
    const x = PAYX, y = Y0, w = MW - PAYX - 12;
    ctx.fillStyle = css("--surface-solid"); ctx.strokeStyle = css("--border"); ctx.lineWidth = 2;
    roundRect(x, y, w, RH * ROWS + 12, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css("--accent"); ctx.font = "700 13px 'Chakra Petch',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("PAGOS ×3 EN LÍNEA", x + w / 2, y + 20);
    const rowH = (RH * ROWS + 12 - 34) / SYM.length;
    SYM.forEach((s, i) => {
      const ry = y + 30 + i * rowH;
      const isWin = wins.some(win => win.sym === i && !win.partial);
      if (isWin) { ctx.fillStyle = s.c; ctx.globalAlpha = 0.18 + Math.sin(pulse) * 0.12; roundRect(x + 4, ry + 2, w - 8, rowH - 3, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.font = "26px serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(s.e, x + 12, ry + rowH / 2 + 1);
      ctx.font = "700 16px 'Chakra Petch',sans-serif"; ctx.textAlign = "right";
      ctx.fillStyle = isWin ? s.c : css("--text");
      ctx.fillText("×" + s.pay + (i === JACK ? " 💥" : ""), x + w - 12, ry + rowH / 2 + 1);
    });
  }

  function drawCoins() {
    coins.forEach(c => {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.globalAlpha = Math.min(1, c.life / 25);
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 9 * Math.abs(Math.cos(c.rot)) + 2, 0, 0, 7);
      ctx.fillStyle = "#ffd24d"; ctx.fill(); ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // ---------- controles ----------
  document.getElementById("betup").onclick = () => { if (!spinning) { betIdx = Math.min(BETS.length - 1, betIdx + 1); updateHUD(); tone(660, .05, "sine", .4); } };
  document.getElementById("betdown").onclick = () => { if (!spinning) { betIdx = Math.max(0, betIdx - 1); updateHUD(); tone(440, .05, "sine", .4); } };
  document.getElementById("reset").onclick = () => { credits = 100; lastWin = 0; wins = []; save(); updateHUD(); draw(); tone(523, .1, "triangle", .5); };
  ovBtn.onclick = start;
  document.addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); if (state === "idle") start(); else spin(); } });

  NovaSettings.mount({
    gameId: "slots", onChange: (k, v) => { cfg[k] = v; draw(); }, extra: [
      {
        title: "Tabla de pagos (×apuesta)", rows: [
          { type: "info", label: "🍒 / 🍋 / 🔔", value: "×3 / ×5 / ×8" },
          { type: "info", label: "⭐ / 💎 / 7️⃣", value: "×12 / ×25 / ×60 💥" },
          { type: "info", label: "Líneas de pago", value: "5 (centro, sup, inf, 2 diag)" },
          { type: "info", label: "2× 🍒 (centro)", value: "×1.5" },
        ]
      },
      { title: "Juego", rows: [{ type: "toggle", key: "fast", label: "Giro rápido", default: false }] },
      { title: "Gráficos", rows: [{ type: "toggle", key: "glow", label: "Brillo neón", default: true }] },
      { title: "Controles", rows: [{ type: "keys", label: "Girar", value: "Botón / Espacio" }] },
    ]
  });
  document.addEventListener("nova-theme-change", draw);
  load(); draw();
})();
