/* COLOR RUSH — NOVA ARCADE. Juego de cartas de descarte (estilo "crazy eights").
   Humano (0) vs IA. Capa de efectos: vuelo con arco/giro/escala, impacto con
   partículas y screen-shake, efectos por carta especial, reparto animado,
   "¡RUSH!" dramático y confeti al ganar. Marca y arte originales. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const ov = document.getElementById("ov"), ovTitle = document.getElementById("ov-title"), ovMsg = document.getElementById("ov-msg"), ovBtn = document.getElementById("ov-btn");
  const msgEl = document.getElementById("msg"), picker = document.getElementById("colorpick");
  const COLORS = { r: "#ff3b51", y: "#ffd23b", g: "#2fe06a", b: "#3b9bff", w: "#2a2a44" };
  const DARK = { r: "#9c1426", y: "#a07c10", g: "#157a3a", b: "#1f5fb8", w: "#15152a" };
  const W = cv.width, H = cv.height, CW = 58, CH = 86;
  let cfg = Object.assign({ players: "4", speed: "normal", glow: true }, NovaSettings.loadCfg("uno"));
  const PACE = { rapido: 420, normal: 760, lento: 1200 };
  let hands, draw, discard, curColor, curVal, dir, turn, np, state = "idle", busy = false, pendingWild = null, handRects = [];
  let anims = [], fx = [], parts = [], unoCall = { p: -1, t: 0 }, colorFlash = 0, shake = 0, raf = null, dealing = false, revealHand = true;

  // ── audio ──
  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._uA || (window._uA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }
  function noise(d, v, lp) { try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * d, A.sampleRate); const da = b.getChannelData(0); for (let i = 0; i < da.length; i++) da[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / da.length, 2); n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * v; const f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 2200; n.connect(f); f.connect(g); g.connect(A.destination); n.start(); } catch (e) {} }
  const sndSlam = (sp) => { noise(.12, sp ? .5 : .3, 1400); tone(sp ? 150 : 300, .1, "square", sp ? .45 : .3, sp ? 70 : 200); };
  const sndDeal = () => tone(620 + Math.random() * 120, .04, "square", .25);

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function buildDeck() { const d = []; for (const c of ["r", "y", "g", "b"]) { d.push({ c, v: "0" }); for (let n = 1; n <= 9; n++) { d.push({ c, v: String(n) }); d.push({ c, v: String(n) }); } for (const a of ["skip", "rev", "+2"]) { d.push({ c, v: a }); d.push({ c, v: a }); } } for (let i = 0; i < 4; i++) { d.push({ c: "w", v: "wild" }); d.push({ c: "w", v: "+4" }); } for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[d[i], d[j]] = [d[j], d[i]]; } return d; }
  function setup() { np = parseInt(cfg.players); draw = buildDeck(); hands = Array.from({ length: np }, () => draw.splice(0, 7)); let first; do { first = draw.shift(); } while (first.c === "w"); discard = [first]; curColor = first.c; curVal = first.v; dir = 1; turn = 0; anims = []; fx = []; parts = []; busy = false; if (first.v === "rev") dir = -1; if (first.v === "skip") turn = next(turn); if (first.v === "+2") { drawN(0, 2); turn = next(turn); } }
  function next(t, s = 1) { return ((t + dir * s) % np + np) % np; }
  function reshuffle() { if (draw.length) return; const top = discard.pop(); draw = discard; discard = [top]; for (let i = draw.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[draw[i], draw[j]] = [draw[j], draw[i]]; } draw.forEach(c => { if (c.c === "w") c.chosen = null; }); }
  function drawN(p, n) { for (let k = 0; k < n; k++) { reshuffle(); if (draw.length) hands[p].push(draw.shift()); } }
  function playable(card) { return card.c === "w" || card.c === curColor || card.v === curVal; }

  const DISCARD = { x: W / 2 - CW / 2, y: H / 2 - CH / 2 - 10 }, DRAW = { x: W / 2 - CW - 16, y: H / 2 - CH / 2 - 10 };
  const dCenter = { x: DISCARD.x + CW / 2, y: DISCARD.y + CH / 2 };
  function seatPos(p) { if (p === 0) return { x: W / 2, y: H - CH / 2 - 12 }; const map = { 1: { x: 42, y: H / 2 }, 2: { x: W / 2, y: 48 }, 3: { x: W - 42, y: H / 2 } }; return map[p] || { x: W / 2, y: 48 }; }
  function oppSeats() { return ({ 2: [2], 3: [1, 2], 4: [2, 1, 3] })[np] || [2]; }

  // ── partículas / efectos ──
  function burst(x, y, color, n, spd = 220, grav = 260) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = spd * (.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: .5 + Math.random() * .5, max: 1, c: color, r: 2 + Math.random() * 3, grav, type: "spark" }); } }
  function ring(x, y, color) { fx.push({ type: "ring", x, y, t: 0, dur: .45, c: color }); }
  function confetti() { const cols = ["#ff3b51", "#ffd23b", "#2fe06a", "#3b9bff", "#b06bff", "#ff8a2e"]; for (let i = 0; i < 140; i++) parts.push({ x: Math.random() * W, y: -10 - Math.random() * 80, vx: (Math.random() - .5) * 60, vy: 60 + Math.random() * 120, life: 2.5 + Math.random() * 1.5, max: 4, c: cols[(Math.random() * cols.length) | 0], r: 3 + Math.random() * 3, grav: 40, type: "confetti", rot: Math.random() * 6, vr: (Math.random() - .5) * 10, w: 5 + Math.random() * 5 }); }

  function start() { if (state === "play" && hands) return; setup(); state = "play"; ov.classList.remove("show"); actx(); if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("chip", 104); lastT = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); dealAnimation(); }

  function dealAnimation() {
    dealing = true; revealHand = false; busy = true; msg("Repartiendo…");
    const order = [0, ...oppSeats()]; let step = 0; const totalSteps = 7 * order.length;
    const tick = () => {
      if (step >= totalSteps) { dealing = false; revealHand = true; busy = false; sndSlam(false); ring(dCenter.x, dCenter.y, COLORS[curColor] || "#fff"); setTimeout(turnLoop, 200); return; }
      const p = order[step % order.length]; const to = seatPos(p);
      anims.push({ card: { c: "w", v: "back" }, x: DRAW.x, y: DRAW.y, tx: to.x - CW / 2, ty: to.y - CH / 2, t: 0, dur: 230, arc: 30, spin: (Math.random() - .5) * 2, sc0: .5, sc1: .7, deal: true });
      sndDeal(); step++; setTimeout(tick, 70);
    };
    tick();
  }

  function turnLoop() {
    if (state !== "play" || anims.length || dealing) return;
    if (turn === 0) { msg("Tu turno — juega una carta válida (resaltada) o roba."); busy = false; return; }
    busy = true; msg(`Pensando: IA ${turn}…`);
    setTimeout(aiTurn, PACE[cfg.speed]);
  }
  function aiTurn() {
    if (state !== "play") return; const hand = hands[turn];
    let opts = hand.map((c, i) => ({ c, i })).filter(o => playable(o.c));
    if (opts.length) {
      opts.sort((a, b) => scoreCard(b.c) - scoreCard(a.c)); const pick = opts[0]; let chosen = null;
      if (pick.c.c === "w") { const cnt = { r: 0, y: 0, g: 0, b: 0 }; hand.forEach(c => { if (cnt[c.c] != null) cnt[c.c]++; }); chosen = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; }
      animatePlay(turn, pick.i, chosen);
    } else { animateDraw(turn, 1, () => { const c = hands[turn][hands[turn].length - 1]; if (playable(c)) { const chosen = c.c === "w" ? ["r", "y", "g", "b"][(Math.random() * 4) | 0] : null; setTimeout(() => animatePlay(turn, hands[turn].length - 1, chosen), PACE[cfg.speed] * 0.5); } else { msg(`IA ${turn} robó y pasa.`); turn = next(turn); setTimeout(turnLoop, PACE[cfg.speed] * 0.5); } }); }
  }
  function scoreCard(c) { if (c.v === "+4") return 5; if (["+2", "skip", "rev"].includes(c.v)) return 4; if (c.v === "wild") return 1; return 2; }

  // ── animaciones de juego ──
  function animatePlay(p, idx, chosen) {
    busy = true; const card = hands[p].splice(idx, 1)[0];
    const from = seatPos(p); const special = ["+4", "+2", "skip", "rev", "wild"].includes(card.v);
    anims.push({ card, x: from.x - CW / 2, y: from.y - CH / 2, tx: DISCARD.x, ty: DISCARD.y, t: 0, dur: PACE[cfg.speed] * 0.5, arc: 60, spin: special ? Math.PI * 4 : Math.PI * 2, sc0: 1, sc1: 1.28, onDone: () => finishPlay(p, card, chosen) });
    tone(700, .05, "sine", .25);
  }
  function finishPlay(p, card, chosen) {
    discard.push(card);
    const special = ["+4", "+2"].includes(card.v);
    sndSlam(special); shake = special ? 0.7 : 0.4;
    if (card.c === "w") { curColor = chosen || ["r", "y", "g", "b"][(Math.random() * 4) | 0]; card.chosen = curColor; curVal = "wild"; colorFlash = 26; colorWheelFx(); }
    else { curColor = card.c; curVal = card.v; }
    // efectos por tipo
    ring(dCenter.x, dCenter.y, COLORS[curColor] || "#fff");
    if (card.v === "+4") { burst(dCenter.x, dCenter.y, COLORS[curColor], 30, 320); burst(dCenter.x, dCenter.y, "#fff", 12, 200); }
    else if (card.v === "+2") burst(dCenter.x, dCenter.y, COLORS[curColor], 20, 260);
    else if (card.v === "skip") fx.push({ type: "icon", txt: "⊘", x: 0, y: 0, t: 0, dur: .7, c: "#ff3b51", seat: next(turn) });
    else if (card.v === "rev") fx.push({ type: "rev", x: dCenter.x, y: dCenter.y, t: 0, dur: .7 });
    else burst(dCenter.x, dCenter.y, COLORS[curColor] || "#fff", 10, 160);

    let skip = false;
    if (card.v === "rev") { dir *= -1; if (np === 2) skip = true; }
    if (card.v === "skip") skip = true;
    if (card.v === "+2") { const t = next(turn); animateDraw(t, 2); skip = true; }
    if (card.v === "+4") { const t = next(turn); animateDraw(t, 4); skip = true; }
    if (hands[p].length === 1) { unoCall = { p, t: 130 }; rushCall(p); }
    if (hands[p].length === 0) return win(p);
    turn = next(turn, skip ? 2 : 1);
    busy = false; setTimeout(turnLoop, 300);
  }
  function colorWheelFx() { fx.push({ type: "wheel", x: dCenter.x, y: dCenter.y, t: 0, dur: .8, target: curColor }); }
  function rushCall(p) { tone(700, .12, "square", .5, 1100); setTimeout(() => tone(1100, .14, "square", .5, 1500), 110); burst(seatPos(p).x, seatPos(p).y, "#ffd23b", 16, 200); }

  function animateDraw(p, n, done) {
    busy = true; let k = 0;
    (function one() { if (k >= n) { busy = false; done && done(); return; } drawN(p, 1); const to = seatPos(p); anims.push({ card: { c: "w", v: "back" }, x: DRAW.x, y: DRAW.y, tx: to.x - CW / 2, ty: to.y - CH / 2, t: 0, dur: PACE[cfg.speed] * 0.38, arc: 40, spin: (Math.random() - .5) * 3, sc0: .8, sc1: 1, onDone: () => { sndDeal(); k++; one(); } }); })();
  }
  function who(p) { return p === 0 ? "Tú" : "IA " + p; }
  function msg(t) { msgEl.textContent = t; }
  function humanDraw() { if (state !== "play" || turn !== 0 || busy || anims.length || dealing) return; animateDraw(0, 1, () => { const c = hands[0][hands[0].length - 1]; if (playable(c)) msg("Robaste una jugable: clic para jugarla."); else { msg("Sin jugada — pasas."); turn = next(turn); setTimeout(turnLoop, 300); } }); }
  function win(p) { state = "over"; NovaAudio.stopMusic(); NovaAudio.play(p === 0 ? "win" : "over"); if (p === 0) { confetti(); [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .15, "triangle", .5), i * 120)); } ovTitle.textContent = p === 0 ? "¡GANASTE!" : "PERDISTE"; ovTitle.className = p === 0 ? "win" : "lose"; ovMsg.textContent = p === 0 ? "Te quedaste sin cartas." : `Ganó ${who(p)}.`; ovBtn.textContent = "↻ Nuevo"; ov.classList.add("show"); }

  // ── render ──
  function drawCardFace(card, x, y, sel, scale = 1, rot = 0) {
    const w = CW * scale, h = CH * scale, base = card.c === "w" ? DARK.w : COLORS[card.c];
    ctx.save();
    if (rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    if (sel && cfg.glow) { ctx.shadowColor = css("--accent"); ctx.shadowBlur = 16; } else { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3; }
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, base); g.addColorStop(1, card.c === "w" ? "#0c0c1a" : DARK[card.c] || base);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10 * scale); ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = sel ? css("--accent") : "rgba(255,255,255,.75)"; ctx.lineWidth = sel ? 3 : 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10 * scale); ctx.stroke();
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-0.35); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.42, 0, 0, 7); ctx.fill(); ctx.restore();
    const lbl = ({ skip: "⊘", rev: "⇄", "+2": "+2", "+4": "+4", wild: "★" })[card.v] || card.v;
    ctx.fillStyle = card.c === "w" ? "#222" : (DARK[card.c] || "#222"); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${26 * scale}px "Chakra Petch"`; ctx.fillText(lbl, x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.font = `700 ${12 * scale}px "Chakra Petch"`; ctx.textAlign = "left"; ctx.fillText(lbl, x + 6 * scale, y + 13 * scale); ctx.textAlign = "right"; ctx.fillText(lbl, x + w - 6 * scale, y + h - 7 * scale);
    if (card.c === "w" && card.chosen) { ctx.fillStyle = COLORS[card.chosen]; ctx.beginPath(); ctx.arc(x + w - 12 * scale, y + 12 * scale, 6 * scale, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function drawBack(x, y, scale = 1, rot = 0) {
    const w = CW * scale, h = CH * scale; ctx.save();
    if (rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, "#262b40"); g.addColorStop(1, "#171a2a");
    ctx.fillStyle = g; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10 * scale); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-0.35); ctx.fillStyle = "#ff3b51"; ctx.globalAlpha = .9; ctx.beginPath(); ctx.ellipse(0, 0, w * .32, h * .4, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.font = `700 ${15 * scale}px "Bungee"`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("R", 0, 0); ctx.restore(); ctx.restore();
  }

  function render() {
    handRects = [];
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 10 * shake, (Math.random() - .5) * 10 * shake);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * .7); bg.addColorStop(0, "#16243a"); bg.addColorStop(1, "#0b1018");
    ctx.fillStyle = bg; ctx.fillRect(-12, -12, W + 24, H + 24);
    if (colorFlash > 0) { ctx.fillStyle = COLORS[curColor]; ctx.globalAlpha = colorFlash / 90; ctx.fillRect(-12, -12, W + 24, H + 24); ctx.globalAlpha = 1; }
    if (!hands) { ctx.restore(); return; }
    // oponentes
    oppSeats().forEach(pi => {
      const s = seatPos(pi), cnt = hands[pi].length, horiz = (pi === 2);
      for (let i = 0; i < cnt; i++) { const off = (i - (cnt - 1) / 2) * (horiz ? 15 : 0), offv = (i - (cnt - 1) / 2) * (horiz ? 0 : 12); drawBack(s.x - CW * 0.35 + off, s.y - CH * 0.35 + offv, 0.7); }
      const active = turn === pi && !dealing;
      ctx.fillStyle = active ? css("--accent") : css("--text-dim"); ctx.font = '700 12px "Chakra Petch"'; ctx.textAlign = "center";
      ctx.fillText(`IA ${pi} · ${cnt}`, s.x, pi === 2 ? s.y + 34 : s.y + (CH * 0.5) + 12);
      if (active) { ctx.strokeStyle = css("--accent"); ctx.lineWidth = 2; ctx.globalAlpha = .6 + Math.sin(performance.now() / 200) * .3; ctx.beginPath(); ctx.roundRect(s.x - 30, s.y - 30, 60, 60, 10); ctx.stroke(); ctx.globalAlpha = 1; }
    });
    // mazo y descarte
    drawBack(DRAW.x + 2, DRAW.y + 2, 1); drawBack(DRAW.x, DRAW.y, 1); ctx.fillStyle = css("--text-dim"); ctx.font = '700 10px "Chakra Petch"'; ctx.textAlign = "center"; ctx.fillText("ROBAR", DRAW.x + CW / 2, DRAW.y + CH + 13);
    const top = discard[discard.length - 1]; if (top) drawCardFace(top, DISCARD.x, DISCARD.y, false);
    ctx.fillStyle = COLORS[curColor]; if (cfg.glow) { ctx.shadowColor = COLORS[curColor]; ctx.shadowBlur = 14; } ctx.beginPath(); ctx.roundRect(DISCARD.x + CW + 14, DISCARD.y + CH / 2 - 13, 24, 24, 6); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = css("--text-dim"); ctx.font = '18px serif'; ctx.fillText(dir === 1 ? "↻" : "↺", DISCARD.x + CW / 2, DISCARD.y - 12);
    // mano humana
    if (revealHand) {
      const hand = hands[0]; const totalW = Math.min(W - 20, hand.length * (CW + 6)); const step = hand.length > 1 ? (totalW - CW) / (hand.length - 1) : 0; const sx = (W - totalW) / 2, y = H - CH - 10;
      hand.forEach((card, i) => { const x = sx + i * step; const ok = turn === 0 && state === "play" && !busy && !anims.length && playable(card); const yy = ok ? y - 12 : y; drawCardFace(card, x, yy, ok); handRects.push({ x, y: yy, w: CW, h: CH, i, ok }); });
      if (turn === 0 && !busy && !anims.length) { ctx.strokeStyle = css("--accent"); ctx.lineWidth = 2; ctx.globalAlpha = .45; ctx.beginPath(); ctx.roundRect(sx - 6, y - 18, totalW + 12, CH + 20, 12); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // efectos especiales (fx)
    drawFx();
    // cartas en vuelo
    anims.forEach(a => { const k = Math.min(1, a.t / a.dur), e = 1 - Math.pow(1 - k, 3); const x = a.x + (a.tx - a.x) * e; let yy = a.y + (a.ty - a.y) * e; if (a.arc) yy -= a.arc * Math.sin(Math.PI * e); const sc = (a.sc0 || 1) + ((a.sc1 || 1) - (a.sc0 || 1)) * Math.sin(Math.PI * e); const rot = (a.spin || 0) * e; if (a.card.v === "back") drawBack(x, yy, sc, rot); else drawCardFace(a.card, x, yy, false, sc, rot); });
    // partículas
    drawParts();
    // ¡RUSH!
    if (unoCall.t > 0) { const s = seatPos(unoCall.p); const k = (130 - unoCall.t) / 130; const sc = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.5; ctx.save(); ctx.translate(s.x, s.y - 30); ctx.scale(sc, sc); ctx.fillStyle = "#ffd23b"; ctx.font = '800 30px "Bungee"'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; if (cfg.glow) { ctx.shadowColor = "#ff8a2e"; ctx.shadowBlur = 18; } ctx.lineWidth = 4; ctx.strokeStyle = "#7c0d18"; ctx.strokeText("¡RUSH!", 0, 0); ctx.fillText("¡RUSH!", 0, 0); ctx.restore(); unoCall.t--; }
    ctx.restore();
  }
  function drawFx() {
    fx.forEach(f => {
      const k = f.t / f.dur, a = 1 - k;
      if (f.type === "ring") { ctx.strokeStyle = f.c; ctx.globalAlpha = a; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(f.x, f.y, 20 + k * 70, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (f.type === "wheel") { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(k * 12); const cols = ["r", "y", "g", "b"]; cols.forEach((c, i) => { ctx.fillStyle = COLORS[c]; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40 * (1 - k * .3), i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fill(); }); ctx.globalAlpha = 1; ctx.restore(); }
      else if (f.type === "rev") { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(k * 10 * dir); ctx.strokeStyle = "#fff"; ctx.globalAlpha = a; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 34, 0.4, Math.PI - 0.4); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI + 0.4, 2 * Math.PI - 0.4); ctx.stroke(); ctx.globalAlpha = 1; ctx.restore(); }
      else if (f.type === "icon") { const s = seatPos(f.seat); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = f.c; ctx.font = `800 ${40 + k * 30}px "Chakra Petch"`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; if (cfg.glow) { ctx.shadowColor = f.c; ctx.shadowBlur = 14; } ctx.fillText(f.txt, s.x, s.y); ctx.restore(); }
    });
  }
  function drawParts() {
    parts.forEach(p => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * .5)));
      if (p.type === "confetti") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.r / 2, p.w, p.r); ctx.restore(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
  }

  let lastT = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = lastT ? Math.min(60, now - lastT) : 16; lastT = now; const ds = dt / 1000;
    for (let i = anims.length - 1; i >= 0; i--) { anims[i].t += dt; if (anims[i].t >= anims[i].dur) { const a = anims.splice(i, 1)[0]; a.onDone && a.onDone(); } }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += ds; if (fx[i].t >= fx[i].dur) fx.splice(i, 1); }
    parts.forEach(p => { p.x += p.vx * ds; p.y += p.vy * ds; p.vy += (p.grav || 200) * ds; if (p.vr) p.rot += p.vr * ds; p.life -= ds; });
    parts = parts.filter(p => p.life > 0 && p.y < H + 40);
    if (colorFlash > 0) colorFlash--;
    if (shake > 0) shake = Math.max(0, shake - ds * 3);
    render();
  }

  cv.addEventListener("click", e => {
    if (state !== "play" || turn !== 0 || busy || anims.length || dealing) return;
    const rect = cv.getBoundingClientRect(); const x = (e.clientX - rect.left) * (W / rect.width), y = (e.clientY - rect.top) * (H / rect.height);
    for (let k = handRects.length - 1; k >= 0; k--) { const r = handRects[k]; if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { if (!r.ok) { msg("Esa carta no coincide en color ni número."); tone(200, .1, "sawtooth", .3); return; } const card = hands[0][r.i]; if (card.c === "w") { pendingWild = r.i; picker.classList.add("show"); return; } animatePlay(0, r.i); return; } }
  });
  picker.querySelectorAll(".swatch").forEach(s => s.onclick = () => { picker.classList.remove("show"); if (pendingWild != null) { const i = pendingWild; pendingWild = null; animatePlay(0, i, s.dataset.c); } });

  ovBtn.onclick = () => start();
  document.getElementById("draw").onclick = humanDraw;
  document.getElementById("restart").onclick = () => { state = "idle"; hands = null; cancelAnimationFrame(raf); ovTitle.textContent = "COLOR RUSH"; ovTitle.className = ""; ovMsg.textContent = "Tú vs IA. Quédate sin cartas."; ovBtn.textContent = "▶ Jugar"; ov.classList.add("show"); render(); };

  NovaSettings.mount({
    gameId: "uno", onChange: () => { cfg = Object.assign(cfg, NovaSettings.loadCfg("uno")); }, extra: [
      { title: "Juego", rows: [
        { type: "select", key: "players", label: "Jugadores", default: "4", options: [{ value: "2", label: "2 (1 IA)" }, { value: "3", label: "3 (2 IA)" }, { value: "4", label: "4 (3 IA)" }] },
        { type: "select", key: "speed", label: "Ritmo", default: "normal", options: [{ value: "rapido", label: "Rápido" }, { value: "normal", label: "Normal" }, { value: "lento", label: "Lento (explicado)" }] },
      ]},
      { title: "Gráficos", rows: [{ type: "toggle", key: "glow", label: "Brillo neón", default: true }] },
      { title: "Controles", rows: [{ type: "keys", label: "Jugar", value: "Clic en carta válida" }, { type: "keys", label: "Robar", value: "Botón Robar" }] },
    ]
  });
  document.addEventListener("nova-theme-change", () => { if (hands) render(); });
  render();
})();
