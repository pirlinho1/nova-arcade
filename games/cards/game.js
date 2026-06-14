/* Video Póker (Jacks or Better) — NOVA ARCADE. Fichas virtuales, sin dinero real. */
(function () {
  const $ = id => document.getElementById(id);
  const handEl = $("hand"), payEl = $("paytable"), resEl = $("result");
  const SUITS = [{ s: "♠", r: 0 }, { s: "♥", r: 1 }, { s: "♦", r: 1 }, { s: "♣", r: 0 }];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  // tabla de pagos (×apuesta)
  const PAYS = [
    { name: "Escalera real", key: "royal", pay: 250 },
    { name: "Escalera de color", key: "sflush", pay: 50 },
    { name: "Póker", key: "four", pay: 25 },
    { name: "Full", key: "full", pay: 9 },
    { name: "Color", key: "flush", pay: 6 },
    { name: "Escalera", key: "straight", pay: 4 },
    { name: "Trío", key: "three", pay: 3 },
    { name: "Doble pareja", key: "twopair", pay: 2 },
    { name: "Pareja (J o más)", key: "jacks", pay: 1 },
  ];
  const BETS = [1, 5, 10, 25];

  let credits, betIdx, deck, hand, held, phase = "deal"; // deal -> draw
  let cfg = NovaSettings.loadCfg("cards");

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._pkA || (window._pkA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.value = f; const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function load() { credits = +(localStorage.getItem("cards-credits") || 100); betIdx = 1; hand = []; held = [false, false, false, false, false]; phase = "deal"; renderPay(); renderHand(true); updateHUD(); }
  function save() { localStorage.setItem("cards-credits", credits); }
  function updateHUD() { $("credits").textContent = credits; $("bet").textContent = BETS[betIdx]; }

  function newDeck() { const d = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ s, r }); for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[d[i], d[j]] = [d[j], d[i]]; } return d; }

  function deal() {
    if (phase === "deal") {
      const bet = BETS[betIdx];
      if (credits < bet) { resEl.textContent = "Sin créditos: Recarga."; return; }
      credits -= bet; updateHUD(); save();
      resEl.classList.remove("big");
      deck = newDeck(); hand = deck.splice(0, 5); held = [false, false, false, false, false];
      phase = "draw"; resEl.textContent = "Elige cartas a mantener…"; $("deal").textContent = "🔄 Cambiar";
      renderHand(false, [0, 1, 2, 3, 4]); dealSound(5);
    } else {
      // cambiar las no retenidas (con flip animado solo en las cambiadas)
      const changed = [];
      for (let i = 0; i < 5; i++) if (!held[i]) { hand[i] = deck.splice(0, 1)[0]; changed.push(i); }
      renderHand(false, changed); dealSound(changed.length || 1);
      setTimeout(evaluate, 260); phase = "deal"; $("deal").textContent = "🂠 Repartir";
    }
  }
  function dealSound(n) { for (let i = 0; i < n; i++) setTimeout(() => tone(420 + i * 30, .04, "square", .3), i * 70); }

  function evaluate() {
    const res = score(hand);
    let win = 0, key = null;
    if (res) { key = res; const pd = PAYS.find(p => p.key === res); win = pd.pay * BETS[betIdx]; }
    if (win > 0) {
      credits += win; const big = win >= BETS[betIdx] * 9;
      resEl.textContent = "¡" + PAYS.find(p => p.key === key).name + "! +" + win;
      resEl.classList.toggle("big", big);
      // resaltar las cartas que forman la jugada
      const winIdx = winningIndices(hand, key);
      const cards = handEl.querySelectorAll(".pcard");
      winIdx.forEach(i => cards[i] && cards[i].classList.add("win"));
      winSound(big);
    }
    else { resEl.textContent = "Sin premio. ¡Otra vez!"; resEl.classList.remove("big"); tone(200, .15, "sawtooth", .3); }
    $("lastwin").textContent = win; updateHUD(); save(); renderPay(key);
    if (credits <= 0) resEl.textContent = "Sin créditos. Pulsa Recargar.";
  }
  // índices de las cartas que componen la jugada (para resaltar)
  function winningIndices(h, key) {
    if (["royal", "sflush", "flush", "straight", "full"].includes(key)) return [0, 1, 2, 3, 4];
    const counts = {}; h.forEach((c, i) => (counts[c.r] = counts[c.r] || []).push(i));
    const groups = Object.values(counts).sort((a, b) => b.length - a.length);
    if (key === "four") return groups[0];
    if (key === "three") return groups[0];
    if (key === "twopair") return [...groups[0], ...groups[1]];
    if (key === "jacks") return groups.find(g => g.length === 2) || [];
    return [];
  }
  function winSound(big) { const seq = big ? [523, 659, 784, 1046, 1318] : [523, 659, 784]; seq.forEach((f, i) => setTimeout(() => tone(f, .14, "triangle", .5), i * 90)); }

  // ---- evaluación de mano ----
  function score(h) {
    const ranks = h.map(c => c.r).sort((a, b) => a - b);
    const suits = h.map(c => c.s);
    const flush = suits.every(s => s === suits[0]);
    const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const vals = Object.values(counts).sort((a, b) => b - a);
    // escalera (incluye A-2-3-4-5 y 10-J-Q-K-A)
    let straight = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
    const royalSet = [8, 9, 10, 11, 12]; // 10 J Q K A
    const isRoyalRanks = JSON.stringify(ranks) === JSON.stringify(royalSet);
    const lowAce = JSON.stringify(ranks) === JSON.stringify([0, 1, 2, 3, 12]);
    if (lowAce) straight = true;
    if (flush && isRoyalRanks) return "royal";
    if (flush && straight) return "sflush";
    if (vals[0] === 4) return "four";
    if (vals[0] === 3 && vals[1] === 2) return "full";
    if (flush) return "flush";
    if (straight) return "straight";
    if (vals[0] === 3) return "three";
    if (vals[0] === 2 && vals[1] === 2) return "twopair";
    if (vals[0] === 2) { // pareja de J o más
      const pairRank = +Object.keys(counts).find(k => counts[k] === 2);
      if (pairRank >= 9 || pairRank === 12) return "jacks"; // J(9),Q,K,A(12)
    }
    return null;
  }

  // ---- render ----
  function renderPay(hot) {
    payEl.innerHTML = "";
    PAYS.forEach(p => { const d = document.createElement("div"); if (hot === p.key) d.className = "hot"; d.innerHTML = `<span>${p.name}</span><span>×${p.pay}</span>`; payEl.appendChild(d); });
  }
  function renderHand(back, animIdx) {
    handEl.innerHTML = ""; animIdx = animIdx || [];
    let anim = 0;
    for (let i = 0; i < 5; i++) {
      const el = document.createElement("div"); el.className = "pcard";
      if (back || !hand[i]) { el.classList.add("back"); handEl.appendChild(el); continue; }
      const c = hand[i], red = SUITS[c.s].r === 1;
      if (red) el.classList.add("red"); if (held[i]) el.classList.add("held");
      if (animIdx.includes(i)) { el.classList.add("dealin"); el.style.animationDelay = (anim++ * 0.09) + "s"; }
      el.innerHTML = `<span class="hold-tag">MANTÉN</span><span class="r">${RANKS[c.r]}</span><span class="c">${SUITS[c.s].s}</span><span class="s">${SUITS[c.s].s}</span>`;
      el.onclick = () => { if (phase !== "draw") return; held[i] = !held[i]; el.classList.toggle("held"); tone(held[i] ? 600 : 400, .04, "sine", .35); };
      handEl.appendChild(el);
    }
  }

  $("deal").onclick = deal;
  $("betup").onclick = () => { if (phase === "deal") { betIdx = Math.min(BETS.length - 1, betIdx + 1); updateHUD(); tone(660, .05, "sine"); } };
  $("betdown").onclick = () => { if (phase === "deal") { betIdx = Math.max(0, betIdx - 1); updateHUD(); tone(440, .05, "sine"); } };
  $("reset").onclick = () => { credits = 100; $("lastwin").textContent = 0; resEl.textContent = ""; save(); updateHUD(); };
  document.addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); deal(); } if (/[1-5]/.test(e.key) && phase === "draw") { const i = +e.key - 1; held[i] = !held[i]; renderHand(); } });

  NovaSettings.mount({ gameId: "cards", extra: [
    { title: "Pagos (×apuesta)", rows: [
      { type: "info", label: "Escalera real / color", value: "×250 / ×50" },
      { type: "info", label: "Póker / Full / Color", value: "×25 / ×9 / ×6" },
      { type: "info", label: "Escalera / Trío", value: "×4 / ×3" },
      { type: "info", label: "Doble par / Par (J+)", value: "×2 / ×1" },
    ]},
    { title: "Controles", rows: [{ type: "keys", label: "Repartir/Cambiar", value: "Espacio" }, { type: "keys", label: "Mantener carta", value: "1–5 / clic" }] },
  ]});
  load();
})();
