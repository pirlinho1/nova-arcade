/* NOVA ARCADE — panel de configuración reutilizable.
   NovaSettings.mount({ gameId, extra }) inyecta engranaje + modal con:
   - Audio (volumen maestro/música/SFX, mute música/SFX)
   - Tema (light/dark, extensible)
   - secciones extra propias del juego (controles, gráficos, dificultad...)
   Persiste los valores propios del juego en localStorage 'nova-cfg-<gameId>'.
*/
(function () {
  function cfgKey(id) { return "nova-cfg-" + id; }
  function loadCfg(id) { try { return JSON.parse(localStorage.getItem(cfgKey(id))) || {}; } catch { return {}; } }
  function saveCfg(id, c) { localStorage.setItem(cfgKey(id), JSON.stringify(c)); }

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function mount(opts) {
    const gameId = opts.gameId || "portal";
    const extra = opts.extra || [];           // [{title, rows:[...]}]
    const onChange = opts.onChange || (() => {});
    const cfg = loadCfg(gameId);
    // defaults de las filas del juego
    extra.forEach(s => s.rows.forEach(r => { if (r.key && cfg[r.key] === undefined && r.default !== undefined) cfg[r.key] = r.default; }));
    saveCfg(gameId, cfg);

    // engranaje (si el host marcó un contenedor con id=nova-gear-host lo usa; si no, flota)
    const gear = el("button", "icon-btn", "⚙");
    gear.title = "Configuración"; gear.setAttribute("aria-label", "Configuración");
    const host = document.getElementById("nova-gear-host");
    if (host) host.appendChild(gear);
    else { gear.style.cssText = "position:fixed;top:16px;right:16px;z-index:9400"; document.body.appendChild(gear); }

    // modal
    const backdrop = el("div", "cfg-backdrop");
    const panel = el("div", "cfg-panel");
    panel.appendChild(el("div", "cfg-head", `<h3>Configuración</h3>`));
    const close = el("button", "icon-btn", "✕"); close.style.cssText = "width:34px;height:34px;font-size:14px";
    panel.querySelector(".cfg-head").appendChild(close);
    const body = el("div", "cfg-body");
    panel.appendChild(body); backdrop.appendChild(panel); document.body.appendChild(backdrop);

    const a = window.NovaAudio.get();

    // --- sección AUDIO ---
    const audioSec = el("div", "cfg-section");
    audioSec.appendChild(el("div", "cfg-label", "Audio"));
    audioSec.appendChild(rangeRow("Volumen general", "master", a.master, v => NovaAudio.set("master", v)));
    audioSec.appendChild(toggleRow("Música", !a.muteMusic, on => NovaAudio.set("muteMusic", !on)));
    audioSec.appendChild(rangeRow("Volumen música", "music", a.music, v => NovaAudio.set("music", v)));
    audioSec.appendChild(toggleRow("Efectos (SFX)", !a.muteSfx, on => NovaAudio.set("muteSfx", !on)));
    audioSec.appendChild(rangeRow("Volumen SFX", "sfx", a.sfx, v => NovaAudio.set("sfx", v)));
    body.appendChild(audioSec);

    // --- secciones del juego ---
    extra.forEach(sec => {
      const s = el("div", "cfg-section");
      s.appendChild(el("div", "cfg-label", sec.title));
      sec.rows.forEach(r => {
        if (r.type === "range") s.appendChild(rangeRow(r.label, null, cfg[r.key], v => { cfg[r.key] = v; saveCfg(gameId, cfg); onChange(r.key, v, cfg); }, r.min, r.max, r.step, r.fmt));
        else if (r.type === "toggle") s.appendChild(toggleRow(r.label, cfg[r.key], on => { cfg[r.key] = on; saveCfg(gameId, cfg); onChange(r.key, on, cfg); }, r.hint));
        else if (r.type === "select") s.appendChild(selectRow(r.label, r.options, cfg[r.key], v => { cfg[r.key] = v; saveCfg(gameId, cfg); onChange(r.key, v, cfg); }));
        else if (r.type === "keys") s.appendChild(keysRow(r.label, r.value));
        else if (r.type === "info") s.appendChild(infoRow(r.label, r.value));
      });
      body.appendChild(s);
    });

    // --- sección TEMA ---
    const themeSec = el("div", "cfg-section");
    themeSec.appendChild(el("div", "cfg-label", "Tema"));
    const trow = el("div", "cfg-row");
    trow.appendChild(el("label", null, "Apariencia"));
    const seg = el("div", "seg");
    NovaTheme.list().forEach(t => {
      const b = el("button", NovaTheme.get() === t.id ? "active" : "", t.name);
      b.onclick = () => { NovaTheme.set(t.id); seg.querySelectorAll("button").forEach(x => x.classList.remove("active")); b.classList.add("active"); NovaAudio.play("ui"); };
      seg.appendChild(b);
    });
    trow.appendChild(seg); themeSec.appendChild(trow);
    body.appendChild(themeSec);

    // abrir/cerrar
    function open() { NovaAudio.resume(); backdrop.classList.add("open"); NovaAudio.play("ui"); }
    function hide() { backdrop.classList.remove("open"); }
    gear.onclick = open; close.onclick = hide;
    backdrop.onclick = e => { if (e.target === backdrop) hide(); };
    document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });

    return { cfg, open, close: hide, get: () => loadCfg(gameId) };
  }

  // helpers de filas
  function rangeRow(label, audioKey, val, cb, min = 0, max = 1, step = 0.05, fmt) {
    const row = document.createElement("div"); row.className = "cfg-row";
    const l = document.createElement("label"); l.textContent = label;
    const wrap = document.createElement("div"); wrap.style.cssText = "display:flex;align-items:center;gap:10px";
    const out = document.createElement("span"); out.style.cssText = "font-size:12px;color:var(--text-dim);min-width:34px;text-align:right";
    const r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = val;
    const render = v => out.textContent = fmt ? fmt(v) : Math.round(v * 100) + "%";
    render(val);
    r.oninput = () => { const v = parseFloat(r.value); render(v); cb(v); };
    wrap.append(r, out); row.append(l, wrap); return row;
  }
  function toggleRow(label, on, cb, hint) {
    const row = document.createElement("div"); row.className = "cfg-row";
    const l = document.createElement("label"); l.innerHTML = label + (hint ? ` <span class="hint">${hint}</span>` : "");
    const sw = document.createElement("label"); sw.className = "switch";
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = !!on;
    const tr = document.createElement("span"); tr.className = "track";
    inp.onchange = () => { cb(inp.checked); NovaAudio.play("ui"); };
    sw.append(inp, tr); row.append(l, sw); return row;
  }
  function selectRow(label, options, val, cb) {
    const row = document.createElement("div"); row.className = "cfg-row";
    const l = document.createElement("label"); l.textContent = label;
    const sel = document.createElement("select"); sel.className = "cfg-select";
    options.forEach(o => { const op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value == val) op.selected = true; sel.appendChild(op); });
    sel.onchange = () => { cb(sel.value); NovaAudio.play("ui"); };
    row.append(l, sel); return row;
  }
  function keysRow(label, value) {
    const row = document.createElement("div"); row.className = "cfg-row";
    row.innerHTML = `<label>${label}</label><span class="hint" style="text-align:right">${value}</span>`;
    return row;
  }
  function infoRow(label, value) {
    const row = document.createElement("div"); row.className = "cfg-row";
    row.innerHTML = `<label>${label}</label><span class="hint">${value}</span>`;
    return row;
  }

  window.NovaSettings = { mount, loadCfg };
})();
