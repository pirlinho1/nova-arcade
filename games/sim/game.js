/* Sim Lab — NOVA ARCADE. Sandbox de partículas (falling sand). */
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const GW = cv.width, GH = cv.height;
  const ov = document.getElementById("ov"), ovBtn = document.getElementById("ov-btn");
  const $ = id => document.getElementById(id);

  // materiales
  const EMPTY = 0, SAND = 1, WATER = 2, WALL = 3, FIRE = 4, PLANT = 5, OIL = 6, STEAM = 7, EMBER = 8;
  const MATS = [
    { id: SAND, name: "Arena", c: "#e3c16f", swatch: "#e3c16f" },
    { id: WATER, name: "Agua", c: "#3b82f6", swatch: "#3b82f6" },
    { id: OIL, name: "Aceite", c: "#6b4f2a", swatch: "#6b4f2a" },
    { id: WALL, name: "Piedra", c: "#7a7f88", swatch: "#7a7f88" },
    { id: PLANT, name: "Planta", c: "#3bcf5a", swatch: "#3bcf5a" },
    { id: FIRE, name: "Fuego", c: "#ff5a1f", swatch: "#ff5a1f" },
    { id: EMPTY, name: "Borrar", c: "#0b0d12", swatch: "#1c2438" },
  ];
  const colorOf = t => t === SAND ? [227, 193, 111] : t === WATER ? [59, 130, 246] : t === WALL ? [122, 127, 136] :
    t === FIRE ? [255, 90 + (Math.random() * 60 | 0), 31] : t === PLANT ? [59, 207, 90] : t === OIL ? [107, 79, 42] :
    t === STEAM ? [200, 210, 220] : t === EMBER ? [255, 160, 40] : [11, 13, 18];

  let grid = new Uint8Array(GW * GH), life = new Uint8Array(GW * GH);
  let tool = SAND, brush = 3, raf = null, running = false, mouse = { down: false, x: 0, y: 0 };
  const idx = (x, y) => y * GW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

  function actx() { try { NovaAudio.resume(); } catch (e) {} return window._simA || (window._simA = new (window.AudioContext || window.webkitAudioContext)()); }
  function fizz() { try { const A = actx(), s = NovaAudio.get(); if (s.muteSfx) return; const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * .08, A.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++)d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); n.buffer = b; const g = A.createGain(); g.gain.value = s.sfx * s.master * .12; n.connect(g); g.connect(A.destination); n.start(); } catch (e) {} }

  function set(x, y, t) { if (inb(x, y)) { grid[idx(x, y)] = t; if (t === FIRE) life[idx(x, y)] = 40 + (Math.random() * 30 | 0); if (t === STEAM) life[idx(x, y)] = 80; } }
  function paint(cx, cy) { for (let dy = -brush; dy <= brush; dy++) for (let dx = -brush; dx <= brush; dx++) { if (dx * dx + dy * dy <= brush * brush) { if (tool === WATER || tool === SAND || tool === OIL) { if (Math.random() < .7) set(cx + dx, cy + dy, tool); } else set(cx + dx, cy + dy, tool); } } }

  function swap(a, b) { const t = grid[a]; grid[a] = grid[b]; grid[b] = t; const l = life[a]; life[a] = life[b]; life[b] = l; }

  function step() {
    // recorrer de abajo hacia arriba, alternando dirección horizontal
    const dir = (Math.random() < .5) ? 1 : -1;
    for (let y = GH - 1; y >= 0; y--) {
      for (let i = 0; i < GW; i++) {
        const x = dir === 1 ? i : GW - 1 - i;
        const a = idx(x, y), t = grid[a];
        if (t === EMPTY || t === WALL) continue;
        if (t === SAND) {
          if (y + 1 < GH) {
            const b = idx(x, y + 1);
            if (grid[b] === EMPTY || grid[b] === WATER || grid[b] === OIL) { swap(a, b); continue; }
            const lft = x > 0 && (grid[idx(x - 1, y + 1)] === EMPTY), rgt = x < GW - 1 && (grid[idx(x + 1, y + 1)] === EMPTY);
            if (lft && (!rgt || Math.random() < .5)) swap(a, idx(x - 1, y + 1)); else if (rgt) swap(a, idx(x + 1, y + 1));
          }
        } else if (t === WATER || t === OIL) {
          if (y + 1 < GH && grid[idx(x, y + 1)] === EMPTY) swap(a, idx(x, y + 1));
          else { const d = Math.random() < .5 ? -1 : 1; if (inb(x + d, y) && grid[idx(x + d, y)] === EMPTY) swap(a, idx(x + d, y)); else if (inb(x - d, y) && grid[idx(x - d, y)] === EMPTY) swap(a, idx(x - d, y)); else if (y + 1 < GH) { const dl = x > 0 && grid[idx(x - 1, y + 1)] === EMPTY, dr = x < GW - 1 && grid[idx(x + 1, y + 1)] === EMPTY; if (dl) swap(a, idx(x - 1, y + 1)); else if (dr) swap(a, idx(x + 1, y + 1)); } }
        } else if (t === FIRE || t === EMBER) {
          life[a]--; if (life[a] <= 0) { grid[a] = (Math.random() < .15) ? STEAM : EMPTY; life[a] = grid[a] === STEAM ? 60 : 0; continue; }
          // propagar a planta/aceite vecinos
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const nx = x + dx, ny = y + dy; if (inb(nx, ny)) { const nt = grid[idx(nx, ny)]; if ((nt === PLANT && Math.random() < .35) || (nt === OIL && Math.random() < .25)) { grid[idx(nx, ny)] = FIRE; life[idx(nx, ny)] = 30; } if (nt === WATER && Math.random() < .5) { grid[a] = STEAM; life[a] = 60; } } }
          // el fuego sube un poco
          if (y > 0 && grid[idx(x, y - 1)] === EMPTY && Math.random() < .3) swap(a, idx(x, y - 1));
        } else if (t === STEAM) {
          life[a]--; if (life[a] <= 0) { grid[a] = (Math.random() < .3) ? WATER : EMPTY; continue; }
          if (y > 0 && grid[idx(x, y - 1)] === EMPTY) swap(a, idx(x, y - 1)); else { const d = Math.random() < .5 ? -1 : 1; if (inb(x + d, y) && grid[idx(x + d, y)] === EMPTY) swap(a, idx(x + d, y)); }
        } else if (t === PLANT) {
          // crece hacia agua adyacente ocasionalmente
          if (Math.random() < .02) for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && grid[idx(nx, ny)] === WATER) { grid[idx(nx, ny)] = PLANT; break; } }
        }
      }
    }
  }

  let imgData;
  function draw() {
    if (!imgData) imgData = ctx.createImageData(GW, GH);
    const d = imgData.data;
    for (let i = 0; i < grid.length; i++) { const c = colorOf(grid[i]); const p = i * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; }
    ctx.putImageData(imgData, 0, 0);
  }

  function loop() { raf = requestAnimationFrame(loop); if (running) { step(); if (mouse.down) { paint(mouse.x, mouse.y); if (Math.random() < .2 && (tool === FIRE || tool === WATER)) fizz(); } } draw(); }

  function start() { ov.classList.remove("show"); running = true; actx(); if (raf == null) loop(); }

  // tools UI
  const toolsEl = $("tools");
  MATS.forEach(m => { const el = document.createElement("div"); el.className = "tool" + (m.id === tool ? " sel" : ""); el.innerHTML = `<span class="sw" style="background:${m.swatch}"></span>${m.name}`; el.onclick = () => { tool = m.id; toolsEl.querySelectorAll(".tool").forEach(t => t.classList.remove("sel")); el.classList.add("sel"); try { NovaAudio.play("ui"); } catch (e) {} }; toolsEl.appendChild(el); });

  function toGrid(e) { const r = cv.getBoundingClientRect(); const cxv = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, cyv = (e.touches ? e.touches[0].clientY : e.clientY) - r.top; mouse.x = Math.floor(cxv / r.width * GW); mouse.y = Math.floor(cyv / r.height * GH); }
  cv.addEventListener("mousedown", e => { if (ov.classList.contains("show")) return; mouse.down = true; toGrid(e); paint(mouse.x, mouse.y); });
  cv.addEventListener("mousemove", e => { toGrid(e); });
  window.addEventListener("mouseup", () => mouse.down = false);
  cv.addEventListener("touchstart", e => { e.preventDefault(); mouse.down = true; toGrid(e); paint(mouse.x, mouse.y); });
  cv.addEventListener("touchmove", e => { e.preventDefault(); toGrid(e); });
  cv.addEventListener("touchend", () => mouse.down = false);
  $("brush").oninput = e => brush = +e.target.value;
  $("clear").onclick = () => { grid.fill(0); life.fill(0); try { NovaAudio.play("ui"); } catch (e) {} };
  ovBtn.onclick = start;

  NovaSettings.mount({ gameId: "sim", extra: [
    { title: "Materiales", rows: [
      { type: "info", label: "Arena / Agua / Aceite", value: "caen y fluyen" },
      { type: "info", label: "Fuego", value: "quema planta y aceite" },
      { type: "info", label: "Agua + Fuego", value: "→ vapor" },
      { type: "info", label: "Piedra", value: "sólido fijo" },
    ]},
    { title: "Controles", rows: [{ type: "keys", label: "Dibujar", value: "Clic / arrastrar" }] },
  ]});
  draw();
})();
