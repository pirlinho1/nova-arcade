/* STRIKE FORCE — clon táctico estilo CS. Three.js (CDN, sin npm). Uso personal/privado.
   Paso 2: arsenal completo data-driven (pistolas/SMG/fusiles/sniper/escopeta/MG) con
   recoil/daño/cadencia/sonido propios, cambio de arma, menú de compra + economía, mira
   de sniper, silenciador. Mapa topología dust2 (texturas/nombre originales) + movimiento CS.
   Pendiente: granadas (humo/flash/molotov), wallbang, bots IA, C4/rondas. Ver HANDOFF.md */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const $ = id => document.getElementById(id);
const cv = $("cv"), mini = $("mini"), mctx = mini.getContext("2d");
const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");
const crosshairEl = $("crosshair"), adsVig = $("adsVig"), buyEl = $("buy");

// ---------------- MAPA: rejilla rasterizada desde áreas tipo dust2 ----------------
const N = 46, M = 42, CS = 2.4, WH = 4.2;
const WORLD_X = N * CS, WORLD_Z = M * CS;
const AREAS = [
  [17, 33, 30, 40], [20, 30, 27, 34],
  [21, 14, 26, 31], [20, 9, 27, 15],
  [26, 9, 33, 13],
  [30, 30, 39, 38], [33, 11, 40, 31], [30, 24, 40, 31],
  [30, 3, 41, 12],
  [18, 2, 30, 7],
  [9, 30, 18, 35], [5, 18, 15, 31], [5, 14, 14, 22],
  [3, 3, 14, 14], [14, 5, 20, 11],
];
const grid = Array.from({ length: M }, () => Array(N).fill(1));
AREAS.forEach(([x0, z0, x1, z1]) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (z >= 0 && z < M && x >= 0 && x < N) grid[z][x] = 0; });
const solidCell = (cx, cz) => (cx < 0 || cz < 0 || cx >= N || cz >= M) ? true : grid[cz][cx] === 1;
const solidW = (x, z) => solidCell(Math.floor(x / CS), Math.floor(z / CS));
const cellCenter = (cx, cz) => new THREE.Vector3((cx + .5) * CS, 0, (cz + .5) * CS);
const T_SPAWN = cellCenter(23, 37), CT_SPAWN = cellCenter(24, 4);
const SITE_A = cellCenter(35, 7), SITE_B = cellCenter(8, 8), MID = cellCenter(23, 20);

// ---------------- texturas procedurales (originales) ----------------
function tex(draw, w = 128, h = 128, rx = 1, ry = 1) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
const texWall = tex((g, w, h) => { g.fillStyle = "#b89a6a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * .18})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } g.strokeStyle = "rgba(60,45,25,.35)"; for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
const texFloor = tex((g, w, h) => { g.fillStyle = "#caa46c"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(150,120,70,${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 64, 64, 50, 50);

// ---------------- ARSENAL (data-driven) ----------------
function mkPat(len, climb, drift) { const a = []; for (let i = 0; i < len; i++) { const pitch = climb * (i < 4 ? (0.6 + i * 0.12) : Math.max(.4, 1 - (i - 4) * 0.03)); const yaw = drift * (Math.sin(i * 0.7) + 0.4 * Math.sin(i * 1.9)); a.push([yaw, pitch]); } return a; }
// cat: pistol/smg/rifle/sniper/shotgun/mg/knife. rof=ms entre disparos. accStand/Move/Air en rad.
const WEAPONS = {
  // --- pistolas ---
  glock: { name: "Glock-18", cat: "pistol", price: 200, dmg: 28, rof: 150, mag: 20, reserve: 120, reload: 1500, auto: false, range: 60, headMult: 2.6, accStand: .0018, accMove: .035, accAir: .12, moveSpd: 1.0, pat: mkPat(8, .011, .006) },
  usp: { name: "USP-S", cat: "pistol", price: 200, dmg: 35, rof: 170, mag: 12, reserve: 24, reload: 1500, auto: false, range: 65, headMult: 3.2, accStand: .0012, accMove: .03, accAir: .11, moveSpd: 1.0, silencer: true, pat: mkPat(8, .010, .005) },
  cz: { name: "CZ75", cat: "pistol", price: 500, dmg: 31, rof: 90, mag: 12, reserve: 12, reload: 1600, auto: true, range: 55, headMult: 2.6, accStand: .003, accMove: .05, accAir: .14, moveSpd: 1.0, pat: mkPat(12, .013, .009) },
  deagle: { name: "Desert Eagle", cat: "pistol", price: 700, dmg: 63, rof: 280, mag: 7, reserve: 35, reload: 2200, auto: false, range: 80, headMult: 4.0, accStand: .0014, accMove: .07, accAir: .16, moveSpd: .98, pat: mkPat(7, .03, .01) },
  // --- SMG ---
  mp5: { name: "MP5", cat: "smg", price: 1500, dmg: 27, rof: 80, mag: 30, reserve: 120, reload: 2300, auto: true, range: 70, headMult: 2.6, accStand: .0016, accMove: .03, accAir: .12, moveSpd: 1.04, pat: mkPat(30, .013, .009) },
  ump: { name: "UMP-45", cat: "smg", price: 1200, dmg: 35, rof: 110, mag: 25, reserve: 100, reload: 2500, auto: true, range: 65, headMult: 2.8, accStand: .0017, accMove: .032, accAir: .12, moveSpd: 1.02, pat: mkPat(25, .014, .010) },
  mp7: { name: "MP7", cat: "smg", price: 1500, dmg: 29, rof: 75, mag: 30, reserve: 120, reload: 2300, auto: true, range: 70, headMult: 2.4, accStand: .0016, accMove: .03, accAir: .12, moveSpd: 1.05, pat: mkPat(30, .012, .009) },
  p90: { name: "P90", cat: "smg", price: 2350, dmg: 26, rof: 70, mag: 50, reserve: 100, reload: 3300, auto: true, range: 70, headMult: 2.2, accStand: .0018, accMove: .03, accAir: .13, moveSpd: 1.06, pat: mkPat(50, .011, .011) },
  // --- fusiles ---
  ak47: { name: "AK-47", cat: "rifle", price: 2700, dmg: 36, rof: 100, mag: 30, reserve: 90, reload: 2400, auto: true, range: 120, headMult: 4.2, accStand: .0008, accMove: .05, accAir: .14, moveSpd: .92,
    pat: [[0, .018], [.003, .02], [-.003, .022], [.001, .022], [.006, .02], [-.01, .017], [.016, .015], [.022, .013], [.028, .011], [.02, .01], [-.018, .009], [-.03, .009], [-.036, .008], [-.03, .008], [-.02, .008], [.024, .008], [.032, .007], [.03, .007], [.022, .007], [.014, .007], [-.016, .007], [.016, .007], [-.012, .007], [.01, .007], [-.01, .007]] },
  m4: { name: "M4A4", cat: "rifle", price: 3100, dmg: 33, rof: 90, mag: 30, reserve: 90, reload: 2700, auto: true, range: 120, headMult: 3.8, accStand: .0008, accMove: .045, accAir: .13, moveSpd: .92, silencer: true, pat: mkPat(30, .016, .010) },
  galil: { name: "Galil AR", cat: "rifle", price: 1800, dmg: 30, rof: 90, mag: 35, reserve: 90, reload: 2900, auto: true, range: 110, headMult: 3.4, accStand: .0012, accMove: .055, accAir: .15, moveSpd: .92, pat: mkPat(35, .018, .013) },
  famas: { name: "FAMAS", cat: "rifle", price: 2050, dmg: 30, rof: 90, mag: 25, reserve: 90, reload: 2600, auto: true, range: 110, headMult: 3.4, accStand: .0011, accMove: .05, accAir: .14, moveSpd: .92, pat: mkPat(25, .016, .012) },
  xm8: { name: "XM8", cat: "rifle", price: 2400, dmg: 32, rof: 85, mag: 30, reserve: 90, reload: 2600, auto: true, range: 120, headMult: 3.6, accStand: .0009, accMove: .045, accAir: .13, moveSpd: .92, pat: mkPat(30, .015, .010) },
  // --- sniper ---
  awp: { name: "AWP", cat: "sniper", price: 4750, dmg: 115, rof: 1500, mag: 5, reserve: 30, reload: 3700, auto: false, range: 200, headMult: 2.0, accStand: .0006, accMove: .14, accAir: .25, moveSpd: .84, scope: true, scopeFov: 22, hipAcc: .09, pat: [[0, .05]] },
  scout: { name: "Scout", cat: "sniper", price: 1700, dmg: 75, rof: 1250, mag: 10, reserve: 90, reload: 2000, auto: false, range: 180, headMult: 3.0, accStand: .0006, accMove: .07, accAir: .2, moveSpd: .96, scope: true, scopeFov: 40, hipAcc: .07, pat: [[0, .035]] },
  // --- escopeta / MG ---
  mag7: { name: "MAG-7", cat: "shotgun", price: 1300, dmg: 22, rof: 700, mag: 5, reserve: 32, reload: 2600, auto: false, range: 28, headMult: 1.6, pellets: 8, accStand: .03, accMove: .06, accAir: .12, moveSpd: .95, pat: [[0, .03]] },
  negev: { name: "Negev (MG)", cat: "mg", price: 1700, dmg: 30, rof: 60, mag: 100, reserve: 200, reload: 5700, auto: true, range: 110, headMult: 2.4, accStand: .006, accMove: .09, accAir: .2, moveSpd: .78, pat: mkPat(60, .02, .02) },
  knife: { name: "Cuchillo", cat: "knife", price: 0, dmg: 55, rof: 420, mag: Infinity, reserve: Infinity, reload: 0, auto: false, range: 2.6, headMult: 1.5, accStand: 0, accMove: 0, accAir: 0, moveSpd: 1.1, pat: [[0, 0]] },
};
// orden en el menú de compra por categoría
const SHOP = {
  Pistolas: ["glock", "usp", "cz", "deagle"],
  SMG: ["mp5", "mp7", "ump", "p90"],
  Fusiles: ["famas", "galil", "ak47", "m4", "xm8"],
  Sniper: ["scout", "awp"],
  "Escopeta / MG": ["mag7", "negev"],
};

// ---------------- three ----------------
let renderer, scene, camera, controls, raf = null, lastT = 0;
let player, enemies = [], enemyMeshes = [], gstate = "menu", keys = {};
let velY = 0, onGround = true, crouch = false, scoped = false, adsT = 0;
const recoil = { p: 0, y: 0, ap: 0, ay: 0 };
let fx = [], tracers = [];
const ray = new THREE.Raycaster();
const BASE_FOV = 90;
// economía / loadout
let money = 16000;                       // arranque sandbox: compra lo que quieras
let slots = {}, curSlot = "1", cur = null;
let nextFire = 0, reloadUntil = 0, sprayIdx = 0, lastShot = 0, fireFlash = 0, reloadingTimer = null;

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(cv.width, cv.height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xd9c79a, 40, 150);
  camera = new THREE.PerspectiveCamera(BASE_FOV, cv.width / cv.height, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x6b5836, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d0, 1.4); sun.position.set(40, 90, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); const d = 90; sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d; sun.shadow.camera.far = 260; scene.add(sun);
  addSky(); buildMap();
  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  controls.addEventListener("lock", () => $("lockHint").classList.add("hide"));
  controls.addEventListener("unlock", () => $("lockHint").classList.remove("hide"));
}
function addSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(0x3a78c0) }, bot: { value: new THREE.Color(0xe8d6a8) } },
    vertexShader: "varying vec3 v; void main(){v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 v; uniform vec3 top; uniform vec3 bot; void main(){float t=clamp(normalize(v).y*.5+.5,0.,1.); gl_FragColor=vec4(mix(bot,top,pow(t,.7)),1.);}" }));
  scene.add(m);
}
function buildMap() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), new THREE.MeshStandardMaterial({ map: texFloor, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(WORLD_X / 2, 0, WORLD_Z / 2); floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ map: texWall, roughness: .95 });
  for (let z = 0; z < M; z++) { let run = 0;
    for (let x = 0; x <= N; x++) {
      const wall = x < N && grid[z][x] === 1;
      if (wall) run++;
      else if (run > 0) { const x0 = x - run, w = run * CS; const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, CS), wallMat); m.position.set(x0 * CS + w / 2, WH / 2, z * CS + CS / 2); m.castShadow = m.receiveShadow = true; scene.add(m); run = 0; }
    }
  }
  [[SITE_A, 0xff4b4b], [SITE_B, 0x4b8cff]].forEach(([p, c]) => { const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.0, 28), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: .5 })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .05, p.z); scene.add(ring); });
}

// ---------------- enemigos (dummies Lego/Roblox) ----------------
function buildDummy(color) {
  const g = new THREE.Group();
  const mk = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
  mk(new THREE.BoxGeometry(.7, .9, .5), new THREE.MeshStandardMaterial({ color: 0x2c3240 }), .45);
  mk(new THREE.BoxGeometry(.85, .9, .55), new THREE.MeshStandardMaterial({ color }), 1.35);
  mk(new THREE.BoxGeometry(1.25, .3, .45), new THREE.MeshStandardMaterial({ color }), 1.55);
  const head = mk(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial({ color: 0xe8c69a }), 2.05);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.head = head; return g;
}
function spawnEnemies() {
  enemies.forEach(e => { scene.remove(e.mesh); scene.remove(e.hit); }); enemies = []; enemyMeshes = [];
  const spots = [SITE_A, SITE_B, MID, cellCenter(36, 20), cellCenter(8, 25), cellCenter(24, 10)];
  spots.forEach(p => {
    const e = { x: p.x + (Math.random() - .5), z: p.z + (Math.random() - .5), hp: 100, alive: true };
    e.mesh = buildDummy(0xc23b3b); e.mesh.position.set(e.x, 0, e.z); scene.add(e.mesh);
    e.hit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, .7), new THREE.MeshBasicMaterial({ visible: false }));
    e.hit.position.set(e.x, 1.2, e.z); e.hit.userData.enemy = e; scene.add(e.hit); enemyMeshes.push(e.hit); enemies.push(e);
  });
}

// ---------------- audio ----------------
function actx() { try { NovaAudio.resume(); } catch (e) {} return window._sfA || (window._sfA = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }
function noise(d, v, lp) { try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * d, A.sampleRate); const da = b.getChannelData(0); for (let i = 0; i < da.length; i++) da[i] = (Math.random() * 2 - 1) * (1 - i / da.length); n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * v; const f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 2400; n.connect(f); f.connect(g); g.connect(A.destination); n.start(); } catch (e) {} }
function sndShot(w) {
  if (w.silencer && cur.sil) { noise(.05, .12, 1200); tone(500, .04, "sine", .12, 300); return; }
  switch (w.cat) {
    case "pistol": noise(.05, .35); tone(520, .06, "square", .3, 200); break;
    case "smg": noise(.05, .35, 3000); tone(620, .04, "square", .28, 260); break;
    case "rifle": noise(.07, .45); tone(w.name === "AK-47" ? 360 : 440, .07, "sawtooth", .42, 150); break;
    case "sniper": noise(.18, .55); tone(220, .2, "sawtooth", .55, 70); break;
    case "shotgun": noise(.2, .55, 1800); tone(120, .18, "sawtooth", .5, 50); break;
    case "mg": noise(.06, .5); tone(300, .06, "sawtooth", .45, 130); break;
    case "knife": noise(.05, .25, 4000); tone(900, .04, "square", .25); break;
  }
}
const sndStep = () => noise(.05, .12);
const sndReload = () => { tone(300, .05, "square", .3); setTimeout(() => tone(220, .06, "square", .3), 250); setTimeout(() => tone(420, .05, "square", .3), 600); };

// ---------------- loadout ----------------
function inst(id) { const def = WEAPONS[id]; return { def, mag: def.mag, reserve: def.reserve, sil: !!def.silencer && false }; }
function setLoadout(primaryId, secondaryId) {
  slots = { "1": inst(primaryId), "2": inst(secondaryId), "3": inst("knife") };
  curSlot = "1"; cur = slots["1"]; sprayIdx = 0; scoped = false; updateHUD();
}
function switchTo(s) { if (!slots[s] || curSlot === s) return; if (reloadingTimer) { clearTimeout(reloadingTimer); reloadingTimer = null; reloadUntil = 0; } curSlot = s; cur = slots[s]; sprayIdx = 0; scoped = false; recoil.p = recoil.y = 0; tone(500, .05, "sine", .3); updateHUD(); }

// ---------------- disparo ----------------
function currentInacc() {
  const w = cur.def, spd = Math.hypot(player.vx || 0, player.vz || 0);
  let base = (w.scope && !scoped) ? (w.hipAcc || .08) : w.accStand;
  let a = base + w.accMove * (spd / 4.9);
  if (!onGround) a += w.accAir;
  if (crouch && onGround) a *= .6;
  if (w.scope && scoped && spd < 0.6) a *= .12;     // scopeado y quieto = letal
  return a;
}
function fire() {
  if (gstate !== "play") return; const w = cur.def, now = performance.now();
  if (now < nextFire || now < reloadUntil) return;
  if (w.cat === "knife") return knifeHit(now);
  if (cur.mag <= 0) { doReload(); return; }
  nextFire = now + w.rof; cur.mag--; updateHUD(); fireFlash = .07;
  const pp = w.pat[Math.min(sprayIdx, w.pat.length - 1)]; const km = onGround ? 1 : 1.5;
  recoil.p += pp[1] * km; recoil.y += pp[0] * km; sprayIdx++; lastShot = now; sndShot(w);
  const muzzle = camera.getWorldPosition(new THREE.Vector3());
  const inacc = currentInacc(), pellets = w.pellets || 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p++) {
    const ang = Math.random() * 6.283, r = inacc * Math.sqrt(Math.random());
    ray.setFromCamera(new THREE.Vector2(Math.cos(ang) * r * 30, Math.sin(ang) * r * 30), camera); ray.far = w.range;
    const hits = ray.intersectObjects(enemyMeshes, false), wallD = rayWall(muzzle, ray.ray.direction, w.range);
    let end;
    if (hits.length && (wallD == null || hits[0].distance < wallD)) {
      const e = hits[0].object.userData.enemy; end = hits[0].point;
      if (e && e.alive) { const head = end.y - e.hit.position.y > 0.62; hurtEnemy(e, w.dmg * (head ? w.headMult : 1), head); spawnFx(end, head ? 0xffffff : 0xff2b3b, head ? 8 : 5); hitAny = true; if (head) tone(1500, .04, "square", .35); }
    } else if (wallD != null) { end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(wallD)); spawnFx(end, 0xd8c070, 4); }
    else end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(w.range));
    tracer(muzzle, end);
  }
  if (hitAny) showHit();
}
function knifeHit(now) {
  nextFire = now + cur.def.rof; lastShot = now; sndShot(cur.def); fireFlash = .05;
  const muzzle = camera.getWorldPosition(new THREE.Vector3()); ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = cur.def.range;
  const hits = ray.intersectObjects(enemyMeshes, false);
  if (hits.length && hits[0].distance < cur.def.range) { const e = hits[0].object.userData.enemy; if (e && e.alive) { hurtEnemy(e, cur.def.dmg, false); spawnFx(hits[0].point, 0xff2b3b, 6); showHit(); } }
}
function rayWall(o, d, maxD) { let x = o.x, z = o.z; const s = .3, dx = d.x * s, dz = d.z * s; for (let t = 0; t < maxD; t += s) { x += dx; z += dz; if (solidW(x, z)) return t; } return null; }
function hurtEnemy(e, dmg, head) { e.hp -= dmg; const h = e.mesh.userData.head; h.material.emissive = new THREE.Color(head ? 0xffffff : 0x550000); h.material.emissiveIntensity = .6; setTimeout(() => { try { h.material.emissiveIntensity = 0; } catch (x) {} }, 80); if (e.hp <= 0) killEnemy(e); }
function killEnemy(e) { e.alive = false; e.mesh.rotation.z = Math.PI / 2.2; e.mesh.position.y = 0; enemyMeshes = enemyMeshes.filter(m => m !== e.hit); money += 300; updateHUD(); tone(140, .2, "sawtooth", .4, 70); feed(); if (enemies.every(x => !x.alive)) win(); }
function doReload() { const w = cur.def; if (cur.mag >= w.mag || cur.reserve <= 0 || performance.now() < reloadUntil || w.cat === "knife") return; reloadUntil = performance.now() + w.reload; sndReload(); reloadingTimer = setTimeout(() => { reloadingTimer = null; const need = w.mag - cur.mag, t = Math.min(need, cur.reserve === Infinity ? need : cur.reserve); cur.mag += t; if (cur.reserve !== Infinity) cur.reserve -= t; updateHUD(); }, w.reload); }
function feed() { const f = $("feed"); if (!f) return; const d = document.createElement("div"); d.textContent = "✔ enemigo abatido (+$300)"; d.style.color = "#9bd17a"; f.appendChild(d); setTimeout(() => d.remove(), 2500); }
function win() { gstate = "over"; document.exitPointerLock && document.exitPointerLock(); ovTitle.textContent = "✔ Zona despejada"; ovTitle.className = "win"; ovMsg.textContent = "Abatiste a todos. Pulsa B en partida para abrir la tienda y probar todo el arsenal."; ovBtn.textContent = "↻ Reiniciar"; ov.classList.add("show"); }

function spawnFx(p, c, n) { const geo = new THREE.SphereGeometry(.05, 4, 4); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c })); m.position.copy(p); scene.add(m); fx.push({ m, vx: (Math.random() - .5) * 4, vy: Math.random() * 4, vz: (Math.random() - .5) * 4, life: .4 }); } }
function tracer(a, b) { const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: .8 })); scene.add(l); tracers.push({ l, life: .05 }); }
function showHit() { const e = $("hitmark"); if (!e) return; e.classList.remove("on"); void e.offsetWidth; e.classList.add("on"); tone(1200, .03, "square", .3); }

// ---------------- tienda / compra ----------------
let buyOpen = false;
function openBuy() {
  if (gstate !== "play") return; buyOpen = true; document.exitPointerLock && document.exitPointerLock();
  buyEl.innerHTML = `<h3 style="margin:0 0 6px;font-family:var(--font-display);color:var(--accent)">TIENDA — 💰$${money} <span style="font-size:12px;color:var(--text-dim)">(B/Esc cerrar)</span></h3>`;
  for (const [grp, ids] of Object.entries(SHOP)) {
    const sec = document.createElement("div"); sec.style.margin = "6px 0";
    sec.innerHTML = `<div style="font-size:11px;letter-spacing:1px;color:var(--text-dim);text-transform:uppercase">${grp}</div>`;
    const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:4px";
    ids.forEach(id => {
      const w = WEAPONS[id], can = money >= w.price; const btn = document.createElement("button");
      btn.className = "btn" + (can ? "" : "");
      btn.style.cssText = "font-size:12px;padding:6px 10px;opacity:" + (can ? "1" : ".45");
      btn.innerHTML = `${w.name}<br><span style="color:#ffd24d;font-size:11px">$${w.price}</span>` + (w.silencer ? " 🔇" : "");
      btn.onclick = () => buyWeapon(id);
      row.appendChild(btn);
    });
    sec.appendChild(row); buyEl.appendChild(sec);
  }
  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:var(--text-dim);margin-top:6px"; hint.textContent = "Pistola→ranura 2, demás→ranura 1. Cambia con 1/2/3. Silenciador: tecla V.";
  buyEl.appendChild(hint);
  buyEl.classList.add("show"); ov.classList.add("show");
  ovTitle.textContent = "COMPRA"; ovTitle.className = ""; ovMsg.textContent = ""; ovBtn.style.display = "none";
}
function closeBuy() { buyOpen = false; buyEl.classList.remove("show"); ov.classList.remove("show"); ovBtn.style.display = ""; if (gstate === "play") controls.lock(); }
function buyWeapon(id) {
  const w = WEAPONS[id]; if (money < w.price) { tone(180, .12, "sawtooth", .3); return; }
  money -= w.price; const slot = w.cat === "pistol" ? "2" : "1"; slots[slot] = inst(id); switchTo(slot);
  tone(880, .07, "triangle", .4); setTimeout(() => tone(1180, .08, "triangle", .4), 70); openBuy();   // refresca con dinero nuevo
}

// ---------------- HUD ----------------
function updateHUD() {
  if (!cur) return;
  $("hp").textContent = Math.max(0, Math.round(player ? player.hp : 100));
  $("wname").textContent = cur.def.name.toUpperCase() + (cur.sil ? " 🔇" : "");
  $("ammo").textContent = cur.mag === Infinity ? "∞" : cur.mag;
  const rv = $("reserve"); if (rv) rv.textContent = cur.reserve === Infinity ? "∞" : cur.reserve;
  const mo = $("money"); if (mo) mo.textContent = money; const ar = $("armor"); if (ar) ar.textContent = 0;
}
function drawMini() {
  const s = Math.min(mini.width / WORLD_X, mini.height / WORLD_Z); mctx.clearRect(0, 0, mini.width, mini.height);
  for (let z = 0; z < M; z++) for (let x = 0; x < N; x++) if (grid[z][x] === 0) { mctx.fillStyle = "rgba(202,164,108,.5)"; mctx.fillRect(x * CS * s, z * CS * s, CS * s + .6, CS * s + .6); }
  enemies.forEach(e => { if (!e.alive) return; mctx.fillStyle = "#ff4b4b"; mctx.fillRect(e.x * s - 2, e.z * s - 2, 4, 4); });
  if (player) { const o = controls.getObject(); mctx.fillStyle = "#fff"; mctx.fillRect(o.position.x * s - 2, o.position.z * s - 2, 4, 4); mctx.strokeStyle = "#fff"; mctx.beginPath(); mctx.moveTo(o.position.x * s, o.position.z * s); mctx.lineTo((o.position.x + Math.sin(camera.rotation.y) * -3) * s, (o.position.z + Math.cos(camera.rotation.y) * -3) * s); mctx.stroke(); }
}
function updateCrosshair() {
  let sp = 3; if (gstate === "play") { sp += currentInacc() * 900; if (fireFlash > 0) sp += 6; }
  crosshairEl.style.setProperty("--spread", Math.max(1.5, Math.min(40, sp)) + "px"); crosshairEl.style.setProperty("--cc", "#39ff88");
  crosshairEl.style.opacity = (scoped && adsT > .6) ? 0 : 1;
  if (fireFlash > 0) fireFlash -= .016;
}

// ---------------- input ----------------
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if ([" ", "control", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  keys[k] = true; if (k === "control") crouch = true;
  if (k === "b") { buyOpen ? closeBuy() : openBuy(); return; }
  if (k === "escape" && buyOpen) { closeBuy(); return; }
  if (gstate !== "play" || buyOpen) return;
  if (k === "1" || k === "2" || k === "3") switchTo(k);
  if (k === "r") doReload();
  if (k === "v" && cur.def.silencer) { cur.sil = !cur.sil; tone(cur.sil ? 600 : 400, .06, "square", .3); updateHUD(); }
  if (k === " " && onGround) { velY = 5.2; onGround = false; }
});
document.addEventListener("keyup", e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === "control") crouch = false; });
cv.addEventListener("click", () => { actx(); if (gstate === "play" && !buyOpen && !controls.isLocked) controls.lock(); });
cv.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("mousedown", e => { if (gstate !== "play" || buyOpen || !controls.isLocked) return; if (e.button === 2) { if (cur.def.scope) scoped = !scoped; return; } if (e.button === 0) { keys._m = true; fire(); } });
document.addEventListener("mouseup", e => { if (e.button === 0) keys._m = false; });
$("restart").onclick = () => { document.exitPointerLock && document.exitPointerLock(); start(); };

function collide(px, pz) { const r = .32; if (solidW(px + r, pz) || solidW(px - r, pz) || solidW(px, pz + r) || solidW(px, pz - r)) return false; return true; }

// ---------------- bucle ----------------
function start() {
  gstate = "play"; buyOpen = false; buyEl.classList.remove("show"); buyEl.innerHTML = ""; ov.classList.remove("show"); ovBtn.style.display = "";
  spawnEnemies(); player = { hp: 100, vx: 0, vz: 0 }; money = 16000; setLoadout("ak47", "glock"); velY = 0; crouch = false; scoped = false; adsT = 0;
  const o = controls.getObject(); o.position.set(T_SPAWN.x, 1.6, T_SPAWN.z); camera.rotation.set(0, 0, 0);
  updateHUD(); lastT = performance.now(); controls.lock(); if (raf == null) loop(lastT);
}
function loop(t) {
  raf = requestAnimationFrame(loop); let dt = (t - lastT) / 1000; if (dt > .05) dt = .05; lastT = t;
  if (gstate === "play" && !buyOpen) updatePlayer(dt);
  // scope fov
  const sf = (cur && cur.def.scope) ? cur.def.scopeFov : BASE_FOV;
  adsT += ((scoped ? 1 : 0) - adsT) * Math.min(1, dt * 16);
  const sens = NovaSettings.loadCfg("fps").sens ? +NovaSettings.loadCfg("fps").sens : 1;
  camera.fov = BASE_FOV + (sf - BASE_FOV) * adsT; camera.updateProjectionMatrix();
  adsVig.classList.toggle("on", adsT > .5);
  controls.pointerSpeed = sens * (scoped ? (cur.def.scopeFov / BASE_FOV) : 1);
  // recoil
  const dp = recoil.p - recoil.ap, dy = recoil.y - recoil.ay; camera.rotation.x += dp; camera.rotation.y += dy; recoil.ap = recoil.p; recoil.ay = recoil.y;
  if (performance.now() - lastShot > 180) { recoil.p *= Math.pow(.02, dt); recoil.y *= Math.pow(.02, dt); if (Math.abs(recoil.p) < 6e-4 && Math.abs(recoil.y) < 6e-4) { recoil.p = recoil.y = 0; sprayIdx = 0; } }
  fx.forEach(p => { p.vy -= 9 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.life -= dt; });
  fx = fx.filter(p => { if (p.life <= 0) { scene.remove(p.m); return false; } return true; });
  tracers.forEach(tr => { tr.life -= dt; tr.l.material.opacity = Math.max(0, tr.life / .05) * .8; });
  tracers = tracers.filter(tr => { if (tr.life <= 0) { scene.remove(tr.l); tr.l.geometry.dispose(); return false; } return true; });
  updateCrosshair(); renderer.render(scene, camera); drawMini();
}
let stepT = 0;
function updatePlayer(dt) {
  const obj = controls.getObject();
  let f = 0, r = 0;
  if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1; if (keys.d || keys.arrowright) r += 1; if (keys.a || keys.arrowleft) r -= 1;
  const yaw = obj.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
  let wx = (-sy) * f + (cy) * r, wz = (-cy) * f + (-sy) * r; const ml = Math.hypot(wx, wz); if (ml > 1) { wx /= ml; wz /= ml; }
  let maxS = 4.9 * (cur ? cur.def.moveSpd : 1); if (keys.shift) maxS *= .52; if (crouch && onGround) maxS *= .5; if (scoped) maxS *= .55;
  const tx = wx * maxS, tz = wz * maxS, ax = tx - player.vx, az = tz - player.vz, am = Math.hypot(ax, az);
  const ACCEL = onGround ? 75 : 16, FRIC = onGround ? 90 : 2, rate = (ml > 0 ? ACCEL : FRIC) * dt;
  if (am > 0) { const k = Math.min(1, rate / am); player.vx += ax * k; player.vz += az * k; }
  const nx = obj.position.x + player.vx * dt, nz = obj.position.z + player.vz * dt;
  if (collide(nx, obj.position.z)) obj.position.x = nx; else player.vx = 0;
  if (collide(obj.position.x, nz)) obj.position.z = nz; else player.vz = 0;
  const spd = Math.hypot(player.vx, player.vz);
  if (onGround && spd > 1.6 && !keys.shift && !crouch) { stepT -= dt; if (stepT <= 0) { sndStep(); stepT = .34 / Math.max(.7, spd / 4.9); } }
  velY -= 16 * dt; obj.position.y += velY * dt; const gY = crouch ? 1.05 : 1.6;
  if (obj.position.y <= gY) { obj.position.y = gY; velY = 0; onGround = true; }
  player.x = obj.position.x; player.z = obj.position.z;
  if (keys._m && cur.def.auto) fire();
}

// ---------------- settings + arranque ----------------
try { NovaSettings.mount({ gameId: "fps", extra: [{ title: "Juego", rows: [
  { type: "range", key: "sens", label: "Sensibilidad", default: 1, min: .3, max: 2.5, step: .1, fmt: v => (+v).toFixed(1) + "×" },
  { type: "keys", label: "Mover · Andar", value: "WASD · Shift" },
  { type: "keys", label: "Agacharse · Saltar", value: "Ctrl · Espacio" },
  { type: "keys", label: "Disparar · Mira", value: "Clic izq · Clic der" },
  { type: "keys", label: "Armas · Recargar", value: "1/2/3 · R" },
  { type: "keys", label: "Tienda · Silenciador", value: "B · V" },
] }] }); } catch (e) {}
ovTitle.textContent = "STRIKE FORCE"; ovTitle.className = "";
ovMsg.innerHTML = "Mapa estilo dust2 (original) — arsenal completo. <b>B</b> abre la tienda ($16000 sandbox). 1/2/3 cambia arma, R recarga, clic-der mira (sniper), V silenciador.<br>Párate para disparar preciso; en ráfaga controla el <b>recoil</b> tirando ↓. Abate los dummies.";
ovBtn.textContent = "▶ Jugar";
initScene(); ovBtn.onclick = () => start();
lastT = performance.now(); loop(lastT);
