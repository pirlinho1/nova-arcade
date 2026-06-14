/* TURBO CUPS — NOVA ARCADE. Kart racer 3D arcade con Three.js (ESM por CDN, sin npm).
   Pista 3D texturizada generada desde una spline, cielo por shader, físicas con drift +
   mini-turbo, ítems, rivales IA, vueltas/posición, minimapa. Marca y assets ORIGINALES. */
import * as THREE from "three";

const $ = id => document.getElementById(id);
const cv = $("cv"), mini = $("kmini"), mctx = mini.getContext("2d");
const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");

// ---------- config ----------
let cfg = { diff: "normal", laps: 3, cam: "cerca" };
const DIFF = { facil: 0.86, normal: 0.94, dificil: 1.0 };
const ROAD_W = 13, WALL_H = 1.6;
const KCOL = [0xff3b51, 0x3bff7b, 0x3b9bff, 0xffd23b, 0xb06bff, 0xff8a2e];
const KNAME = ["Tú", "Verde", "Azul", "Ámbar", "Violeta", "Naranja"];

// ---------- three básicos ----------
let renderer, scene, camera, raf = null, lastT = 0;
let karts = [], player, items = [], hazards = [], projectiles = [], sparks = [];
let center = [];          // muestras de la línea central {x,z,tx,tz,nx,nz,s}
let trackLen = 0, gstate = "menu", round = 1, raceTime = 0, countdown = 0, finishOrder = [];
let keys = {};
const tmp = new THREE.Vector3();

// ---------- texturas procedurales ----------
function makeTex(draw, w = 128, h = 128, rx = 1, ry = 1) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
const texRoad = makeTex((g, w, h) => {
  g.fillStyle = "#34373f"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  // bordes blanco/rojo
  g.fillStyle = "#e8e8ef"; g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
  g.fillStyle = "#ff4b5c"; for (let y = 0; y < h; y += 32) { g.fillRect(0, y, 8, 16); g.fillRect(w - 8, y + 16, 8, 16); }
}, 128, 128);
const texGrass = makeTex((g, w, h) => {
  g.fillStyle = "#2f8a3a"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { const v = Math.random(); g.fillStyle = v < .5 ? "rgba(0,0,0,.10)" : "rgba(180,255,150,.12)"; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
}, 64, 64, 60, 60);

// ---------- cielo por shader ----------
function addSky() {
  const geo = new THREE.SphereGeometry(800, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { top: { value: new THREE.Color(0x2a6fd6) }, bot: { value: new THREE.Color(0xbfe3ff) } },
    vertexShader: `varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vp; uniform vec3 top; uniform vec3 bot; void main(){ float t=clamp((normalize(vp).y*0.5+0.5),0.0,1.0); vec3 c=mix(bot,top,pow(t,0.8)); gl_FragColor=vec4(c,1.0);} `
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// ---------- spline de la pista ----------
const CTRL = [[0, -78], [52, -64], [74, -16], [62, 34], [30, 62], [-16, 70], [-58, 50], [-78, 4], [-58, -44], [-20, -64]];
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function buildCenter() {
  const pts = []; const N = CTRL.length; const SUB = 26;
  for (let i = 0; i < N; i++) {
    const p0 = CTRL[(i - 1 + N) % N], p1 = CTRL[i], p2 = CTRL[(i + 1) % N], p3 = CTRL[(i + 2) % N];
    for (let j = 0; j < SUB; j++) { const t = j / SUB; pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  center = []; let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
    center.push({ x: a[0], z: a[1], tx, tz, nx: -tz, nz: tx, s });
    s += len;
  }
  trackLen = s;
}

// ---------- malla de la pista ----------
function buildTrackMesh() {
  const n = center.length; const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) { const c = center[i % n]; const hw = ROAD_W / 2;
    pos.push(c.x + c.nx * hw, 0.02, c.z + c.nz * hw); pos.push(c.x - c.nx * hw, 0.02, c.z - c.nz * hw);
    const v = c.s / 8; uv.push(0, v); uv.push(1, v);
  }
  for (let i = 0; i < n; i++) { const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texRoad, roughness: .92 })); road.receiveShadow = true; scene.add(road);
  // muros (postes a los lados)
  const postGeo = new THREE.BoxGeometry(0.7, WALL_H, 0.7);
  const postMatL = new THREE.MeshStandardMaterial({ color: 0xff4b5c }), postMatR = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let i = 0; i < n; i += 3) { const c = center[i]; const hw = ROAD_W / 2 + 0.6;
    const pl = new THREE.Mesh(postGeo, (i / 3 | 0) % 2 ? postMatL : postMatR); pl.position.set(c.x + c.nx * hw, WALL_H / 2, c.z + c.nz * hw); pl.castShadow = true; scene.add(pl);
    const pr = new THREE.Mesh(postGeo, (i / 3 | 0) % 2 ? postMatR : postMatL); pr.position.set(c.x - c.nx * hw, WALL_H / 2, c.z - c.nz * hw); pr.castShadow = true; scene.add(pr);
  }
  // meta a cuadros en s≈0
  const c0 = center[0]; const fg = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 3), new THREE.MeshBasicMaterial({ map: checkerTex() }));
  fg.rotation.x = -Math.PI / 2; fg.position.set(c0.x, 0.04, c0.z); fg.rotation.z = Math.atan2(c0.tx, c0.tz); scene.add(fg);
}
function checkerTex() { return makeTex((g, w, h) => { const s = w / 8; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * s, y * s, s, s); } }, 64, 24); }

function addScenery() {
  // suelo de césped enorme
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ map: texGrass, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; grass.receiveShadow = true; scene.add(grass);
  // árboles (conos) fuera de la pista
  const trunkG = new THREE.CylinderGeometry(0.4, 0.5, 2, 6), leafG = new THREE.ConeGeometry(2.2, 5, 8);
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2a }), leafM = new THREE.MeshStandardMaterial({ color: 0x2c7a3a });
  for (let i = 0; i < center.length; i += 7) { const c = center[i]; const side = (i % 14 < 7) ? 1 : -1; const off = ROAD_W / 2 + 6 + Math.random() * 14;
    const x = c.x + c.nx * off * side, z = c.z + c.nz * off * side;
    const tr = new THREE.Mesh(trunkG, trunkM); tr.position.set(x, 1, z); tr.castShadow = true; scene.add(tr);
    const lf = new THREE.Mesh(leafG, leafM); lf.position.set(x, 4, z); lf.castShadow = true; scene.add(lf);
  }
}

// ---------- inicialización ----------
function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(cv.width, cv.height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe3ff, 120, 380);
  camera = new THREE.PerspectiveCamera(68, cv.width / cv.height, 0.1, 1000);
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5a2a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.3); sun.position.set(60, 120, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 10; sun.shadow.camera.far = 400; const d = 140;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d; scene.add(sun);
  addSky(); buildCenter(); buildTrackMesh(); addScenery(); buildItemBoxes();
}

// ---------- karts ----------
function buildKartMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3), new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .2 })); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1), new THREE.MeshStandardMaterial({ color, roughness: .5 })); nose.position.set(0, 0.45, 1.6); g.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x222633 })); seat.position.set(0, 0.95, -0.4); g.add(seat);
  // piloto (cápsula + cabeza)
  const drv = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); drv.position.set(0, 1.25, -0.3); g.add(drv);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color })); head.position.set(0, 1.85, -0.3); g.add(head);
  // ruedas
  const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), wm = new THREE.MeshStandardMaterial({ color: 0x14161c });
  const wpos = [[-1, 1.1], [1, 1.1], [-1, -1.1], [1, -1.1]]; const wheels = [];
  wpos.forEach(([x, z]) => { const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(x, 0.5, z); w.castShadow = true; g.add(w); wheels.push(w); });
  g.userData.wheels = wheels; g.userData.head = head;
  return g;
}
function makeKart(idx, isPlayer) {
  const c0 = center[2 + idx]; const off = ((idx % 2) ? 1 : -1) * 2.4;
  const a = {
    isPlayer, name: KNAME[idx], color: KCOL[idx],
    x: c0.x + c0.nx * off, z: c0.z + c0.nz * off, ang: Math.atan2(c0.tx, c0.tz), speed: 0,
    drifting: false, driftDir: 0, driftCharge: 0, boost: 0, spinT: 0, shieldT: 0,
    item: null, lap: 0, cont: 0, lastNi: 2 + idx, place: idx + 1, finished: false, aiItemT: 1 + Math.random() * 3,
  };
  a.mesh = buildKartMesh(a.color); a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.ang; scene.add(a.mesh);
  return a;
}

// ---------- cajas de ítems ----------
const ITEMS = ["boost", "bolt", "oil", "shield"];
const ITEM_ICON = { boost: "🚀", bolt: "⚡", oil: "🛢️", shield: "🛡️" };
function buildItemBoxes() {
  items = [];
  for (let i = 10; i < center.length; i += 40) {
    const c = center[i];
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xffd23b, emissive: 0x553300, transparent: true, opacity: .85 }));
    m.position.set(c.x, 1.3, c.z); scene.add(m);
    items.push({ x: c.x, z: c.z, mesh: m, cooldown: 0 });
  }
}

// ---------- progreso / nearest ----------
function nearestNi(a) {
  let bi = a.lastNi, bd = 1e9; const n = center.length;
  for (let k = -16; k <= 16; k++) { const i = (a.lastNi + k + n) % n; const c = center[i]; const d = (c.x - a.x) ** 2 + (c.z - a.z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
function updateProgress(a) {
  const n = center.length; const ni = nearestNi(a);
  let d = ni - a.lastNi; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
  a.cont += d; a.lastNi = ni;
  const newLap = Math.floor(a.cont / n);
  if (newLap > a.lap && a.cont > 0) { a.lap = newLap; if (a.isPlayer) { sfxLap(); if (a.lap >= cfg.laps) finish(a); } else if (a.lap >= cfg.laps) finish(a); }
}
function latInfo(a) { // distancia lateral al centro + on-road
  const c = center[a.lastNi]; const dx = a.x - c.x, dz = a.z - c.z; const lat = dx * c.nx + dz * c.nz; return { lat, onRoad: Math.abs(lat) < ROAD_W / 2 + 0.5 };
}

// ---------- audio ----------
function actx() { try { NovaAudio.resume(); } catch (e) {} return window._kA || (window._kA = new (window.AudioContext || window.webkitAudioContext)()); }
let engOsc = null, engGain = null;
function startEngine() { try { const A = actx(); engOsc = A.createOscillator(); engGain = A.createGain(); engOsc.type = "sawtooth"; engOsc.frequency.value = 60; const st = NovaAudio.get(); engGain.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * 0.06; const f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; engOsc.connect(f); f.connect(engGain); engGain.connect(A.destination); engOsc.start(); } catch (e) {} }
function stopEngine() { try { engOsc && engOsc.stop(); } catch (e) {} engOsc = null; }
function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }
function noise(d, v) { try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * d, A.sampleRate); const da = b.getChannelData(0); for (let i = 0; i < da.length; i++) da[i] = (Math.random() * 2 - 1) * (1 - i / da.length); n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * v; n.connect(g); g.connect(A.destination); n.start(); } catch (e) {} }
const sfxLap = () => tone(660, .12, "triangle", .5, 990);
const sfxBoost = () => { tone(300, .25, "sawtooth", .45, 900); noise(.2, .2); };
const sfxItem = () => { tone(700, .08, "square", .4, 1100); setTimeout(() => tone(1100, .1, "square", .4), 70); };
const sfxHit = () => { tone(180, .2, "sawtooth", .5, 80); noise(.18, .3); };

// ---------- carrera ----------
function setupRace() {
  karts.forEach(k => { if (k.mesh) scene.remove(k.mesh); });
  karts = []; player = makeKart(0, true); karts.push(player);
  const n = parseInt(NovaSettings.loadCfg("kart").rivals || "3");
  for (let i = 1; i <= n; i++) karts.push(makeKart(i, false));
  items.forEach(it => { it.cooldown = 0; it.mesh.visible = true; });
  hazards.forEach(h => scene.remove(h.mesh)); hazards = [];
  projectiles.forEach(p => scene.remove(p.mesh)); projectiles = [];
  finishOrder = []; raceTime = 0; $("np").textContent = karts.length;
}
function startRace() {
  setupRace(); gstate = "countdown"; countdown = 3.99; ov.classList.remove("show"); $("lockHint").classList.remove("hide");
  actx(); if (!NovaAudio.isMusicOn() && !NovaAudio.get().muteMusic) NovaAudio.startMusic("neon", 132);
  startEngine(); lastT = performance.now(); if (raf == null) loop(lastT);
  $("count").textContent = "3"; $("count").style.opacity = 1;
}
function finish(a) {
  if (a.finished) return; a.finished = true; finishOrder.push(a);
  if (a.isPlayer) { gstate = "finishing"; a.place = finishOrder.length; }
  if (karts.every(k => k.finished) || (player.finished)) {
    if (player.finished && gstate !== "results") setTimeout(endRace, player.isPlayer && karts.every(k => k.finished) ? 0 : 1200);
  }
}
function endRace() {
  gstate = "results"; stopEngine(); NovaAudio.stopMusic();
  // completar orden con los que no terminaron, por progreso
  const rest = karts.filter(k => !finishOrder.includes(k)).sort((a, b) => b.cont - a.cont); finishOrder.push(...rest);
  const place = finishOrder.indexOf(player) + 1;
  NovaAudio.play(place === 1 ? "win" : "over");
  ovTitle.textContent = place === 1 ? "🏆 ¡1er PUESTO!" : place + "º puesto";
  ovTitle.className = place === 1 ? "win" : "lose";
  ovMsg.innerHTML = "Tiempo: <b>" + raceTime.toFixed(1) + "s</b><br>" + finishOrder.map((k, i) => `${i + 1}. ${k.name}`).join(" · ");
  ovBtn.textContent = "🏁 Otra carrera"; ov.classList.add("show");
}

// ---------- ítems ----------
function giveItem(a) { a.item = ITEMS[(Math.random() * ITEMS.length) | 0]; if (a.isPlayer) { sfxItem(); updateItemHUD(); $("itemBox").classList.add("flash"); setTimeout(() => $("itemBox").classList.remove("flash"), 600); } }
function useItem(a) {
  if (!a.item) return; const it = a.item; a.item = null; if (a.isPlayer) updateItemHUD();
  if (it === "boost") { a.boost = 1.3; sfxBoost(); }
  else if (it === "shield") { a.shieldT = 5; tone(500, .2, "sine", .4, 800); }
  else if (it === "oil") { const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshStandardMaterial({ color: 0x14110a, roughness: .3 })); m.rotation.x = -Math.PI / 2; m.position.set(a.x - Math.sin(a.ang) * 3, 0.05, a.z - Math.cos(a.ang) * 3); scene.add(m); hazards.push({ x: m.position.x, z: m.position.z, mesh: m, owner: a, t: 0 }); tone(200, .1, "sawtooth", .3); }
  else if (it === "bolt") { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshBasicMaterial({ color: 0x9bd1ff })); m.position.set(a.x, 1, a.z); scene.add(m); projectiles.push({ x: a.x, z: a.z, ang: a.ang, mesh: m, owner: a, life: 2.5 }); tone(900, .1, "square", .4, 1300); }
}
function spinKart(a) { if (a.shieldT > 0) { a.shieldT = 0; return; } if (a.spinT > 0) return; a.spinT = 1.1; a.speed *= 0.3; if (a.isPlayer) sfxHit(); }

// ---------- input ----------
document.addEventListener("keydown", e => { const k = e.key.toLowerCase(); if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault(); keys[k] = true; if ((k === "e" || k === "control") && gstate === "race") useItem(player); });
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
$("restart").onclick = () => { gstate = "menu"; startRace(); };

// ---------- física del jugador ----------
function stepPlayer(a, dt) {
  if (a.finished) { a.speed *= 0.96; moveKart(a, dt, 0, false); return; }
  if (a.spinT > 0) { a.spinT -= dt; a.ang += dt * 14; a.speed *= 0.97; moveKart(a, dt, 0, false); return; }
  const up = keys.w || keys.arrowup, dn = keys.s || keys.arrowdown;
  const steer = (keys.a || keys.arrowleft ? -1 : 0) + (keys.d || keys.arrowright ? 1 : 0);
  const driftKey = keys[" "];
  const li = latInfo(a); const maxS = (li.onRoad ? 46 : 26) * (a.boost > 0 ? 1.35 : 1);
  if (up) a.speed += 34 * dt; else if (dn) a.speed -= 40 * dt; else a.speed *= 0.985;
  a.speed = Math.max(-12, Math.min(maxS, a.speed));
  if (!li.onRoad) a.speed *= 0.965;
  // drift
  if (driftKey && steer && Math.abs(a.speed) > 16 && !a.drifting) { a.drifting = true; a.driftDir = steer; a.driftCharge = 0; tone(220, .06, "square", .25); }
  if (a.drifting) { if (!driftKey || Math.abs(a.speed) < 8) { releaseDrift(a); } else { a.driftCharge += dt; if (Math.random() < .5) spawnSpark(a); } }
  let turn = steer * 2.0 * Math.min(1, Math.abs(a.speed) / 20);
  if (a.drifting) turn = (a.driftDir * 1.4 + steer * 0.8) * Math.min(1, Math.abs(a.speed) / 20);
  a.ang += turn * dt * Math.sign(a.speed || 1);
  if (a.boost > 0) a.boost -= dt;
  moveKart(a, dt, steer, a.drifting);
  updateProgress(a);
}
function releaseDrift(a) {
  if (a.driftCharge > 1.4) { a.boost = Math.max(a.boost, a.driftCharge > 2.4 ? 1.1 : 0.6); sfxBoost(); }
  a.drifting = false; a.driftDir = 0; a.driftCharge = 0;
}
function moveKart(a, dt, steer, drifting) {
  const fx = Math.sin(a.ang), fz = Math.cos(a.ang);
  let nx = a.x + fx * a.speed * dt, nz = a.z + fz * a.speed * dt;
  a.x = nx; a.z = nz;
  // contención: empujar hacia la pista si se sale mucho
  const c = center[a.lastNi]; const dx = a.x - c.x, dz = a.z - c.z; const lat = dx * c.nx + dz * c.nz; const lim = ROAD_W / 2 + 3;
  if (Math.abs(lat) > lim) { const push = (Math.abs(lat) - lim) * Math.sign(lat); a.x -= c.nx * push; a.z -= c.nz * push; a.speed *= 0.9; }
  // mesh
  a.mesh.position.set(a.x, 0, a.z);
  const tilt = drifting ? a.driftDir * 0.18 : (steer * Math.min(1, Math.abs(a.speed) / 30) * 0.06);
  a.mesh.rotation.set(0, a.ang + (drifting ? a.driftDir * 0.3 : 0), -tilt);
  a.mesh.userData.wheels.forEach(w => w.rotation.x += a.speed * dt * 1.2);
}

// ---------- IA ----------
function stepAI(a, dt) {
  if (a.finished) { a.speed *= 0.97; moveKart(a, dt, 0, false); return; }
  if (a.spinT > 0) { a.spinT -= dt; a.ang += dt * 14; a.speed *= 0.97; moveKart(a, dt, 0, false); updateProgress(a); return; }
  const look = center[(a.lastNi + 9) % center.length];
  const want = Math.atan2(look.x - a.x, look.z - a.z);
  let d = want - a.ang; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
  const steer = Math.max(-1, Math.min(1, d * 2));
  const maxS = 44 * DIFF[cfg.diff] * (a.boost > 0 ? 1.3 : 1);
  a.speed += 30 * dt; a.speed = Math.min(maxS, a.speed);
  a.ang += steer * 2.0 * Math.min(1, a.speed / 20) * dt;
  if (a.boost > 0) a.boost -= dt;
  // usar ítem
  a.aiItemT -= dt; if (a.item && a.aiItemT <= 0) { useItem(a); a.aiItemT = 3 + Math.random() * 4; }
  moveKart(a, dt, steer, false);
  updateProgress(a);
}

// ---------- colisiones de mundo ----------
function worldCollisions(dt) {
  // ítems
  items.forEach(it => {
    if (it.cooldown > 0) { it.cooldown -= dt; if (it.cooldown <= 0) it.mesh.visible = true; return; }
    it.mesh.rotation.y += dt * 2; it.mesh.position.y = 1.3 + Math.sin(performance.now() / 300) * 0.2;
    for (const k of karts) if (!k.item && Math.hypot(k.x - it.x, k.z - it.z) < 2.2) { giveItem(k); it.cooldown = 5; it.mesh.visible = false; break; }
  });
  // aceites
  hazards.forEach(h => { h.t += dt; for (const k of karts) { if (k === h.owner && h.t < 0.6) continue; if (Math.hypot(k.x - h.x, k.z - h.z) < 1.6) spinKart(k); } });
  hazards = hazards.filter(h => { if (h.t > 14) { scene.remove(h.mesh); return false; } return true; });
  // proyectiles
  projectiles.forEach(p => {
    p.life -= dt; p.x += Math.sin(p.ang) * 70 * dt; p.z += Math.cos(p.ang) * 70 * dt; p.mesh.position.set(p.x, 1, p.z);
    for (const k of karts) if (k !== p.owner && Math.hypot(k.x - p.x, k.z - p.z) < 1.8) { spinKart(k); p.life = 0; break; }
  });
  projectiles = projectiles.filter(p => { if (p.life <= 0) { scene.remove(p.mesh); return false; } return true; });
  // kart-kart
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) { const a = karts[i], b = karts[j]; const dx = b.x - a.x, dz = b.z - a.z, dd = Math.hypot(dx, dz); if (dd < 2.6 && dd > 0.01) { const p = (2.6 - dd) / 2; a.x -= dx / dd * p; a.z -= dz / dd * p; b.x += dx / dd * p; b.z += dz / dd * p; } }
}

// ---------- sparks de drift ----------
function spawnSpark(a) {
  const col = a.driftCharge > 2.4 ? 0xff3b51 : a.driftCharge > 1.4 ? 0xffd23b : 0x9bd1ff;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 5), new THREE.MeshBasicMaterial({ color: col }));
  m.position.set(a.x - Math.sin(a.ang) * 1.4, 0.4, a.z - Math.cos(a.ang) * 1.4); scene.add(m);
  sparks.push({ m, life: 0.35, vy: 3 + Math.random() * 2, vx: (Math.random() - .5) * 4, vz: (Math.random() - .5) * 4 });
}

// ---------- cámara ----------
function updateCamera(dt) {
  const back = cfg.cam === "lejos" ? 13 : 9.5, up = cfg.cam === "lejos" ? 6.5 : 5;
  const fx = Math.sin(player.ang), fz = Math.cos(player.ang);
  const tx = player.x - fx * back, tz = player.z - fz * back, ty = up;
  camera.position.lerp(tmp.set(tx, ty, tz), Math.min(1, dt * 6));
  camera.lookAt(player.x + fx * 6, 1.2, player.z + fz * 6);
  const targetFov = 68 + Math.min(16, Math.abs(player.speed) * 0.35) + (player.boost > 0 ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- HUD ----------
function updateItemHUD() { $("itemBox").firstChild.textContent = player.item ? ITEM_ICON[player.item] : "—"; }
function updateHUD() {
  $("lap").textContent = Math.min(cfg.laps, player.lap + 1);
  const sorted = [...karts].sort((a, b) => b.cont - a.cont); const place = sorted.indexOf(player) + 1;
  $("pos").textContent = place; $("posSup").textContent = place === 1 ? "º" : "º";
  $("speed").textContent = Math.round(Math.abs(player.speed) * 3.2);
  $("driftFill").style.width = Math.min(100, player.driftCharge / 2.4 * 100) + "%";
  $("driftFill").style.background = player.driftCharge > 2.4 ? "#ff3b51" : player.driftCharge > 1.4 ? "#ffd23b" : "#3bff7b";
}
function drawMini() {
  const pad = 12, sz = mini.width - pad * 2; mctx.clearRect(0, 0, mini.width, mini.height);
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  center.forEach(c => { minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x); minz = Math.min(minz, c.z); maxz = Math.max(maxz, c.z); });
  const sc = sz / Math.max(maxx - minx, maxz - minz);
  const mx = x => pad + (x - minx) * sc, mz = z => pad + (z - minz) * sc;
  mctx.strokeStyle = "rgba(255,255,255,.5)"; mctx.lineWidth = 3; mctx.beginPath();
  center.forEach((c, i) => i ? mctx.lineTo(mx(c.x), mz(c.z)) : mctx.moveTo(mx(c.x), mz(c.z))); mctx.closePath(); mctx.stroke();
  karts.forEach(k => { mctx.fillStyle = "#" + k.color.toString(16).padStart(6, "0"); mctx.beginPath(); mctx.arc(mx(k.x), mz(k.z), k.isPlayer ? 4 : 3, 0, 7); mctx.fill(); });
}

// ---------- bucle ----------
function loop(t) {
  raf = requestAnimationFrame(loop);
  let dt = (t - lastT) / 1000; if (dt > 0.05) dt = 0.05; lastT = t;
  if (gstate === "countdown") {
    countdown -= dt; const ci = Math.ceil(countdown - 1);
    const cEl = $("count");
    if (countdown <= 1) { if (gstate !== "race") { cEl.textContent = "¡GO!"; cEl.style.opacity = 1; tone(880, .25, "square", .5, 1320); gstate = "race"; setTimeout(() => cEl.style.opacity = 0, 700); } }
    else { cEl.textContent = ci > 0 ? ci : ""; cEl.style.opacity = Math.min(1, (countdown - ci) * 2); if (cEl.dataset.last !== String(ci)) { cEl.dataset.last = String(ci); tone(440, .12, "square", .4); } }
  }
  if (gstate === "race" || gstate === "finishing" || gstate === "countdown") {
    raceTime += (gstate === "race" || gstate === "finishing") ? dt : 0;
    karts.forEach(k => { if (gstate === "countdown" && !k.finished) return; k.isPlayer ? stepPlayer(k, dt) : stepAI(k, dt); });
    worldCollisions(dt);
    // engine pitch
    if (engOsc) engOsc.frequency.value = 55 + Math.abs(player.speed) * 7 + (player.boost > 0 ? 120 : 0);
    // sparks
    sparks.forEach(s => { s.life -= dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.vy -= 10 * dt; s.m.position.z += s.vz * dt; });
    sparks = sparks.filter(s => { if (s.life <= 0) { scene.remove(s.m); return false; } return true; });
    updateHUD();
  }
  if (player) updateCamera(dt); else { camera.position.set(0, 60, 110); camera.lookAt(0, 0, 0); }
  renderer.render(scene, camera); drawMini();
}

// ---------- settings ----------
NovaSettings.mount({
  gameId: "kart", onChange: (k, v) => { cfg[k] = (k === "diff" || k === "cam") ? v : +v; }, extra: [{
    title: "Carrera", rows: [
      { type: "select", key: "diff", label: "Dificultad rivales", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
      { type: "select", key: "laps", label: "Vueltas", default: "3", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "5", label: "5" }] },
      { type: "select", key: "rivals", label: "Rivales", default: "3", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "5", label: "5" }] },
      { type: "select", key: "cam", label: "Cámara", default: "cerca", options: [{ value: "cerca", label: "Cerca" }, { value: "lejos", label: "Lejos" }] },
      { type: "keys", label: "Conducir", value: "↑↓←→ / WASD" },
      { type: "keys", label: "Derrape · Ítem", value: "Espacio · E" },
    ]
  }]
});
const sv = NovaSettings.loadCfg("kart"); cfg.diff = sv.diff || "normal"; cfg.laps = +sv.laps || 3; cfg.cam = sv.cam || "cerca";

// ---------- arranque ----------
initScene();
ovBtn.onclick = () => { cfg.laps = +(NovaSettings.loadCfg("kart").laps) || 3; startRace(); };
lastT = performance.now(); loop(lastT);
