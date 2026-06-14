/* Biz Tycoon — NOVA ARCADE. Gestión incremental de una pizzería. */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const ov = document.getElementById("ov"), ovBtn = document.getElementById("ov-btn");
  const $ = id => document.getElementById(id);
  const shopEl = $("shop");

  const UPGRADES = [
    { id: "price", ic: "💲", name: "Sube precio", desc: "+$1 por pizza vendida", base: 25, mult: 1.5, max: 30 },
    { id: "oven", ic: "🔥", name: "Horno extra", desc: "+0.4 pizzas/seg automáticas", base: 60, mult: 1.55, max: 25 },
    { id: "cook", ic: "👨‍🍳", name: "Pizzero", desc: "+1.2 pizzas/seg automáticas", base: 300, mult: 1.6, max: 25 },
    { id: "deliver", ic: "🛵", name: "Reparto", desc: "+3 pizzas/seg automáticas", base: 1500, mult: 1.65, max: 20 },
    { id: "branch", ic: "🏪", name: "Sucursal", desc: "Multiplica TODO ×1.5", base: 8000, mult: 2.2, max: 12 },
    { id: "click", ic: "✋", name: "Mano rápida", desc: "Tu clic vale ×2", base: 120, mult: 1.8, max: 12 },
  ];

  let st, raf = null, t0, pops = [], oven = { glow: 0 }, customer = { x: -40, active: false };
  let cfg = NovaSettings.loadCfg("tycoon");

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._tyA || (window._tyA = new (window.AudioContext || window.webkitAudioContext)()); }
  function tone(f, d, t, v) { try { const A = actx(), s = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "sine"; o.frequency.value = f; const vol = (s.muteSfx ? 0 : s.sfx) * s.master * (v || .35); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }

  function fresh() { return { cash: 0, served: 0, lv: {} }; }
  function load() { try { st = JSON.parse(localStorage.getItem("tycoon-save")) || fresh(); } catch { st = fresh(); } UPGRADES.forEach(u => { if (st.lv[u.id] == null) st.lv[u.id] = 0; }); }
  function save() { localStorage.setItem("tycoon-save", JSON.stringify(st)); }
  function lv(id) { return st.lv[id] || 0; }
  function cost(u) { return Math.floor(u.base * Math.pow(u.mult, lv(u.id))); }
  function branchMult() { return Math.pow(1.5, lv("branch")); }
  function pricePer() { return (1 + lv("price")) * branchMult() * (lv("click") ? Math.pow(2, lv("click")) : 1); }
  function autoRate() { return (lv("oven") * 0.4 + lv("cook") * 1.2 + lv("deliver") * 3) * branchMult(); }
  function sellValue() { return (1 + lv("price")) * branchMult(); }

  function fmt(n) { if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k"; return "$" + Math.floor(n); }
  function updateHUD() { $("cash").textContent = fmt(st.cash); $("rate").textContent = fmt(autoRate() * sellValue()) + "/s"; $("served").textContent = Math.floor(st.served); }

  function bake(manual) {
    const v = manual ? pricePer() : sellValue();
    st.cash += v; st.served += manual ? 1 : 0;
    if (manual) { oven.glow = 1; pops.push({ x: W * 0.28, y: 70, vy: -1.4, life: 60, txt: "+" + fmt(v) }); tone(660, .06, "square", .4); customer.active = true; }
    updateHUD();
  }

  function buy(u) {
    const c = cost(u); if (st.cash < c || lv(u.id) >= u.max) return;
    st.cash -= c; st.lv[u.id]++; save(); renderShop(); updateHUD(); tone(880, .08, "triangle", .45); setTimeout(() => tone(1180, .08, "triangle", .4), 70);
  }

  function renderShop() {
    shopEl.innerHTML = "";
    UPGRADES.forEach(u => {
      const row = document.createElement("div"); row.className = "up";
      const maxed = lv(u.id) >= u.max, c = cost(u), can = st.cash >= c && !maxed;
      row.innerHTML = `<span class="ic">${u.ic}</span><div class="info"><b>${u.name}</b><small>${u.desc}</small></div><span class="lvl">N${lv(u.id)}</span>`;
      const btn = document.createElement("button"); btn.className = "btn" + (can ? " btn-accent" : ""); btn.textContent = maxed ? "MÁX" : fmt(c);
      btn.disabled = !can; btn.onclick = () => buy(u); row.appendChild(btn); shopEl.appendChild(row);
    });
  }

  function start() { ov.classList.remove("show"); actx(); if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("neon", 96); t0 = performance.now(); renderShop(); updateHUD(); if (raf == null) loop(t0); }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - (loop._l || now)) / 1000; loop._l = now; if (dt > .2) dt = .2;
    // ingreso automático
    const auto = autoRate();
    if (auto > 0) { st.cash += auto * sellValue() * dt; st.served += auto * dt; }
    // refrescar tienda (habilitar/deshabilitar) periódicamente
    loop._a = (loop._a || 0) + dt; if (loop._a > 0.4) { loop._a = 0; updateHUD(); refreshButtons(); save(); }
    // animaciones
    oven.glow = Math.max(0, oven.glow - dt * 2);
    pops.forEach(p => { p.y += p.vy; p.life--; }); pops = pops.filter(p => p.life > 0);
    if (customer.active) { customer.x += 80 * dt; if (customer.x > W + 40) { customer.x = -40; customer.active = false; } }
    draw();
  }
  function refreshButtons() {
    const btns = shopEl.querySelectorAll(".up");
    UPGRADES.forEach((u, i) => { const row = btns[i]; if (!row) return; const b = row.querySelector("button"); const maxed = lv(u.id) >= u.max, c = cost(u), can = st.cash >= c && !maxed; b.disabled = !can; b.className = "btn" + (can ? " btn-accent" : ""); b.textContent = maxed ? "MÁX" : fmt(c); row.querySelector(".lvl").textContent = "N" + lv(u.id); });
  }

  function draw() {
    ctx.fillStyle = "#1a2030"; ctx.fillRect(0, 0, W, H);
    // suelo y mostrador
    ctx.fillStyle = "#2a3145"; ctx.fillRect(0, 120, W, H - 120);
    ctx.fillStyle = "#3a2a1a"; ctx.fillRect(0, 110, W, 14);
    // local
    ctx.fillStyle = "#8a3b2a"; ctx.fillRect(20, 20, 200, 90);
    ctx.fillStyle = "#ffd23b"; ctx.font = "16px 'Bungee'"; ctx.textAlign = "center"; ctx.fillText("🍕 PIZZA", 120, 60);
    // horno (clicable)
    const ox = W * 0.28, oy = 70;
    ctx.fillStyle = oven.glow > 0 ? "#ff8a3b" : "#555"; ctx.beginPath(); ctx.roundRect(ox - 34, oy - 30, 68, 60, 8); ctx.fill();
    ctx.fillStyle = oven.glow > 0 ? "#ffec99" : "#222"; ctx.beginPath(); ctx.arc(ox, oy, 18, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "10px 'Chakra Petch'"; ctx.fillText("HORNO (clic)", ox, oy + 44);
    // pizzero si hay
    if (lv("cook")) { ctx.font = "28px serif"; ctx.fillText("👨‍🍳", ox + 70, oy + 6); }
    // cliente
    if (customer.active) { ctx.font = "30px serif"; ctx.fillText("🧍", customer.x, 100); }
    // reparto
    if (lv("deliver")) { ctx.font = "26px serif"; ctx.fillText("🛵", (performance.now() / 14 % (W + 60)) - 30, 132); }
    // pops
    pops.forEach(p => { ctx.fillStyle = `rgba(123,255,158,${p.life / 60})`; ctx.font = "14px 'Chakra Petch'"; ctx.textAlign = "center"; ctx.fillText(p.txt, p.x, p.y); });
  }

  cv.addEventListener("click", () => { if (ov.classList.contains("show")) return; bake(true); });
  document.addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); if (!ov.classList.contains("show")) bake(true); } });
  ovBtn.onclick = start;

  NovaSettings.mount({ gameId: "tycoon", extra: [
    { title: "Negocio", rows: [
      { type: "info", label: "Objetivo", value: "Crece tu imperio pizzero" },
      { type: "keys", label: "Hornear", value: "Clic / Espacio" },
      { type: "info", label: "Progreso", value: "Se guarda solo" },
    ]},
    { title: "Datos", rows: [{ type: "toggle", key: "_reset", label: "Borrar partida (recarga)", default: false }] },
  ], onChange: (k, v) => { if (k === "_reset" && v) { localStorage.removeItem("tycoon-save"); location.reload(); } } });

  load(); renderShop(); updateHUD(); draw();
})();
