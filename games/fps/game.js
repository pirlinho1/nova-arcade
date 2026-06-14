/* STRIKE FORCE — clon táctico estilo CS (reescritura desde 0). Three.js (CDN, sin npm).
   Mapa de topología tipo dust2 (texturas y nombre ORIGINALES), movimiento CS
   (counter-strafe, agacharse), AK-47 con recoil pattern. Paso 1: mapa + movimiento + AK.
   Pendiente (próxima sesión): resto del arsenal, granadas (humo/flash/molotov), economía, bots, C4. */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const $ = id => document.getElementById(id);
const cv = $("cv"), mini = $("mini"), mctx = mini.getContext("2d");
const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");
const crosshairEl = $("crosshair"), adsVig = $("adsVig");

// ---------------- MAPA: rejilla rasterizada desde áreas tipo dust2 ----------------
const N = 46, M = 42, CS = 2.4, WH = 4.2;       // celdas x, z ; tamaño celda ; alto muro
const WORLD_X = N * CS, WORLD_Z = M * CS;
// áreas abiertas (suelo). Coordenadas de celda [x0,z0,x1,z1] inclusivas. z: arriba=CT, abajo=T.
// Topología dust2: T spawn (abajo-centro) → Largo A (der) y Túneles→B (izq) y Mid (centro). CT spawn (arriba-centro) entre A y B.
const AREAS = [
  // T spawn
  [17, 33, 30, 40], [20, 30, 27, 34],
  // Mid (corredor vertical) + mid doors
  [21, 14, 26, 31], [20, 9, 27, 15],
  // Catwalk / A short (de mid hacia A)
  [26, 9, 33, 13],
  // Largo A: desde T (derecha) subiendo
  [30, 30, 39, 38], [33, 11, 40, 31], [30, 24, 40, 31],
  // Sitio A (arriba derecha)
  [30, 3, 41, 12],
  // CT spawn (arriba centro)
  [18, 2, 30, 7],
  // Túneles a B (izquierda): lower tunnel desde T, upper tunnel
  [9, 30, 18, 35], [5, 18, 15, 31], [5, 14, 14, 22],
  // Sitio B (arriba izquierda) + B doors hacia CT
  [3, 3, 14, 14], [14, 5, 20, 11],
];
const grid = Array.from({ length: M }, () => Array(N).fill(1));   // 1=muro, 0=suelo
AREAS.forEach(([x0, z0, x1, z1]) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (z >= 0 && z < M && x >= 0 && x < N) grid[z][x] = 0; });
const solidCell = (cx, cz) => (cx < 0 || cz < 0 || cx >= N || cz >= M) ? true : grid[cz][cx] === 1;
const solidW = (x, z) => solidCell(Math.floor(x / CS), Math.floor(z / CS));
const cellCenter = (cx, cz) => new THREE.Vector3((cx + .5) * CS, 0, (cz + .5) * CS);
// puntos clave
const T_SPAWN = cellCenter(23, 37), CT_SPAWN = cellCenter(24, 4);
const SITE_A = cellCenter(35, 7), SITE_B = cellCenter(8, 8), MID = cellCenter(23, 20);

// ---------------- texturas procedurales (originales) ----------------
function tex(draw, w = 128, h = 128, rx = 1, ry = 1) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
const texWall = tex((g, w, h) => { g.fillStyle = "#b89a6a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * .18})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } g.strokeStyle = "rgba(60,45,25,.35)"; for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
const texFloor = tex((g, w, h) => { g.fillStyle = "#caa46c"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(150,120,70,${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 64, 64, 50, 50);

// ---------------- three ----------------
let renderer, scene, camera, controls, raf = null, lastT = 0;
let player, enemies = [], enemyMeshes = [], gstate = "menu", keys = {};
let velY = 0, onGround = true, crouch = false;
const recoil = { p: 0, y: 0, ap: 0, ay: 0 };
let fx = [], tracers = [];
const ray = new THREE.Raycaster(), tmp = new THREE.Vector3();

const AK = { name: "AK-47", dmg: 36, rof: 100, mag: 30, reserve: 90, reload: 2400, auto: true, range: 120, headMult: 4.2, accStand: .0008, accMove: .05, accAir: .14,
  pattern: [[0,.018],[.003,.02],[-.003,.022],[.001,.022],[.006,.02],[-.01,.017],[.016,.015],[.022,.013],[.028,.011],[.02,.01],[-.018,.009],[-.03,.009],[-.036,.008],[-.03,.008],[-.02,.008],[.024,.008],[.032,.007],[.03,.007],[.022,.007],[.014,.007],[-.016,.007],[.016,.007],[-.012,.007],[.01,.007],[-.01,.007]] };

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(cv.width, cv.height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xd9c79a, 40, 150);
  camera = new THREE.PerspectiveCamera(90, cv.width / cv.height, 0.05, 500);
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
const wallAABBs = [];
function buildMap() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), new THREE.MeshStandardMaterial({ map: texFloor, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(WORLD_X / 2, 0, WORLD_Z / 2); floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ map: texWall, roughness: .95 });
  // fusionar muros adyacentes en cajas por fila para menos draw calls
  const geo = new THREE.BoxGeometry(CS, WH, CS);
  for (let z = 0; z < M; z++) { let run = 0;
    for (let x = 0; x <= N; x++) {
      const wall = x < N && grid[z][x] === 1;
      if (wall) run++;
      else if (run > 0) {
        const x0 = x - run; const w = run * CS; const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, CS), wallMat);
        m.position.set(x0 * CS + w / 2, WH / 2, z * CS + CS / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
        wallAABBs.push({ x0: x0 * CS, z0: z * CS, x1: x * CS, z1: z * CS + CS }); run = 0;
      }
    }
  }
  // marcas de sitios A/B
  [[SITE_A, 0xff4b4b, "A"], [SITE_B, 0x4b8cff, "B"]].forEach(([p, c]) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.0, 28), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: .5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .05, p.z); scene.add(ring);
  });
}

// ---------------- enemigos (dummies bloque tipo Lego/Roblox) ----------------
function buildDummy(color) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .5), new THREE.MeshStandardMaterial({ color: 0x2c3240 })); legs.position.y = .45; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.85, .9, .55), new THREE.MeshStandardMaterial({ color })); torso.position.y = 1.35; g.add(torso);
  const arms = new THREE.Mesh(new THREE.BoxGeometry(1.25, .3, .45), new THREE.MeshStandardMaterial({ color })); arms.position.y = 1.55; g.add(arms);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial({ color: 0xe8c69a })); head.position.y = 2.05; g.add(head);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.head = head; return g;
}
function spawnEnemies() {
  enemies.forEach(e => { scene.remove(e.mesh); scene.remove(e.hit); }); enemies = []; enemyMeshes = [];
  const spots = [SITE_A, SITE_B, MID, cellCenter(36, 20), cellCenter(8, 25), cellCenter(24, 10)];
  spots.forEach((p, i) => {
    const e = { x: p.x + (Math.random() - .5), z: p.z + (Math.random() - .5), hp: 100, alive: true };
    e.mesh = buildDummy(0xc23b3b); e.mesh.position.set(e.x, 0, e.z); scene.add(e.mesh);
    e.hit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, .7), new THREE.MeshBasicMaterial({ visible: false }));
    e.hit.position.set(e.x, 1.2, e.z); e.hit.userData.enemy = e; scene.add(e.hit); enemyMeshes.push(e.hit); enemies.push(e);
  });
}

// ---------------- audio ----------------
function actx() { try { NovaAudio.resume(); } catch (e) {} return window._sfA || (window._sfA = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(f, d, t, v, s) { try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain(); o.type = t || "square"; o.frequency.setValueAtTime(f, A.currentTime); if (s) o.frequency.exponentialRampToValueAtTime(s, A.currentTime + d); const vol = (st.muteSfx ? 0 : st.sfx) * st.master * (v || .4); g.gain.setValueAtTime(Math.max(.0001, vol), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d + .02); } catch (e) {} }
function noise(d, v) { try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * d, A.sampleRate); const da = b.getChannelData(0); for (let i = 0; i < da.length; i++) da[i] = (Math.random() * 2 - 1) * (1 - i / da.length); n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * v; n.connect(g); g.connect(A.destination); n.start(); } catch (e) {} }
const sndAK = () => { noise(.07, .45); tone(380, .07, "sawtooth", .4, 150); };
const sndStep = () => noise(.05, .12);

// ---------------- disparo AK ----------------
let nextFire = 0, reloadUntil = 0, mag = AK.mag, reserve = AK.reserve, sprayIdx = 0, lastShot = 0, fireFlash = 0;
function currentInacc() {
  const spd = Math.hypot(player.vx || 0, player.vz || 0);
  let a = AK.accStand + AK.accMove * (spd / 4.9); if (!onGround) a += AK.accAir; if (crouch && onGround) a *= .6; return a;
}
function fire() {
  if (gstate !== "play") return; const now = performance.now();
  if (now < nextFire || now < reloadUntil) return;
  if (mag <= 0) { doReload(); return; }
  nextFire = now + AK.rof; mag--; updateHUD(); fireFlash = .07;
  const pp = AK.pattern[Math.min(sprayIdx, AK.pattern.length - 1)]; const km = onGround ? 1 : 1.5;
  recoil.p += pp[1] * km; recoil.y += pp[0] * km; sprayIdx++; lastShot = now; sndAK();
  const inacc = currentInacc(); const muzzle = camera.getWorldPosition(new THREE.Vector3());
  const ang = Math.random() * 6.283, r = inacc * Math.sqrt(Math.random());
  ray.setFromCamera(new THREE.Vector2(Math.cos(ang) * r * 30, Math.sin(ang) * r * 30), camera); ray.far = AK.range;
  const hits = ray.intersectObjects(enemyMeshes, false); const wallD = rayWall(muzzle, ray.ray.direction, AK.range);
  let end;
  if (hits.length && (wallD == null || hits[0].distance < wallD)) {
    const e = hits[0].object.userData.enemy; end = hits[0].point;
    if (e && e.alive) { const head = end.y - e.hit.position.y > 0.62; hurtEnemy(e, AK.dmg * (head ? AK.headMult : 1), head); spawnFx(end, head ? 0xffffff : 0xff2b3b, head ? 8 : 5); showHit(); if (head) tone(1500, .04, "square", .35); }
  } else if (wallD != null) { end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(wallD)); spawnFx(end, 0xd8c070, 4); }
  else end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(AK.range));
  tracer(muzzle, end);
}
function rayWall(o, d, maxD) { let x = o.x, z = o.z; const s = .3, dx = d.x * s, dz = d.z * s; for (let t = 0; t < maxD; t += s) { x += dx; z += dz; if (solidW(x, z)) return t; } return null; }
function hurtEnemy(e, dmg, head) { e.hp -= dmg; e.mesh.userData.head.material.emissive = new THREE.Color(head ? 0xffffff : 0x550000); e.mesh.userData.head.material.emissiveIntensity = .6; setTimeout(() => { try { e.mesh.userData.head.material.emissiveIntensity = 0; } catch (x) {} }, 80); if (e.hp <= 0) killEnemy(e); }
function killEnemy(e) { e.alive = false; e.mesh.rotation.z = Math.PI / 2.2; e.mesh.position.y = 0; enemyMeshes = enemyMeshes.filter(m => m !== e.hit); tone(140, .2, "sawtooth", .4, 70); feed(); if (enemies.every(x => !x.alive)) win(); }
function doReload() { if (mag >= AK.mag || reserve <= 0 || performance.now() < reloadUntil) return; reloadUntil = performance.now() + AK.reload; tone(300, .05, "square", .3); setTimeout(() => tone(420, .05, "square", .3), 300); setTimeout(() => { const need = AK.mag - mag, t = Math.min(need, reserve); mag += t; reserve -= t; updateHUD(); }, AK.reload); }
function feed() { const f = $("feed"); if (!f) return; const d = document.createElement("div"); d.textContent = "✔ enemigo abatido"; d.style.color = "#9bd17a"; f.appendChild(d); setTimeout(() => d.remove(), 2500); }
function win() { gstate = "over"; document.exitPointerLock && document.exitPointerLock(); ovTitle.textContent = "✔ Zona despejada"; ovTitle.className = "win"; ovMsg.textContent = "Abatiste a todos los dummies. (Build base: mapa + movimiento + AK)"; ovBtn.textContent = "↻ Reiniciar"; ov.classList.add("show"); }

function spawnFx(p, c, n) { const geo = new THREE.SphereGeometry(.05, 4, 4); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c })); m.position.copy(p); scene.add(m); fx.push({ m, vx: (Math.random() - .5) * 4, vy: Math.random() * 4, vz: (Math.random() - .5) * 4, life: .4 }); } }
function tracer(a, b) { const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: .8 })); scene.add(l); tracers.push({ l, life: .05 }); }
function showHit() { const e = $("hitmark"); if (!e) return; e.classList.remove("on"); void e.offsetWidth; e.classList.add("on"); tone(1200, .03, "square", .3); }

// ---------------- HUD ----------------
function updateHUD() { $("hp").textContent = Math.max(0, Math.round(player.hp)); $("ammo").textContent = mag; const rv = $("reserve"); if (rv) rv.textContent = reserve; $("wname").textContent = AK.name; const ar = $("armor"); if (ar) ar.textContent = 0; }
function drawMini() {
  const s = Math.min(mini.width / WORLD_X, mini.height / WORLD_Z); mctx.clearRect(0, 0, mini.width, mini.height);
  for (let z = 0; z < M; z++) for (let x = 0; x < N; x++) if (grid[z][x] === 0) { mctx.fillStyle = "rgba(202,164,108,.5)"; mctx.fillRect(x * CS * s, z * CS * s, CS * s + .6, CS * s + .6); }
  enemies.forEach(e => { if (!e.alive) return; mctx.fillStyle = "#ff4b4b"; mctx.fillRect(e.x * s - 2, e.z * s - 2, 4, 4); });
  if (player) { const o = controls.getObject(); mctx.fillStyle = "#fff"; mctx.fillRect(o.position.x * s - 2, o.position.z * s - 2, 4, 4); mctx.strokeStyle = "#fff"; mctx.beginPath(); mctx.moveTo(o.position.x * s, o.position.z * s); mctx.lineTo((o.position.x + Math.sin(camera.rotation.y) * -3) * s, (o.position.z + Math.cos(camera.rotation.y) * -3) * s); mctx.stroke(); }
}
function updateCrosshair() {
  let sp = 3; if (gstate === "play") { sp += currentInacc() * 900; if (fireFlash > 0) sp += 6; }
  crosshairEl.style.setProperty("--spread", Math.max(1.5, Math.min(40, sp)) + "px"); crosshairEl.style.setProperty("--cc", "#39ff88");
  if (fireFlash > 0) fireFlash -= .016;
}

// ---------------- input ----------------
document.addEventListener("keydown", e => { const k = e.key.toLowerCase(); if ([" ", "control", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); keys[k] = true; if (k === "control") crouch = true; if (gstate !== "play") return; if (k === "r") doReload(); if (k === " " && onGround) { velY = 5.2; onGround = false; } });
document.addEventListener("keyup", e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === "control") crouch = false; });
cv.addEventListener("click", () => { actx(); if (gstate === "play" && !controls.isLocked) controls.lock(); });
document.addEventListener("mousedown", e => { if (gstate !== "play" || !controls.isLocked) return; if (e.button === 0) { keys._m = true; fire(); } });
document.addEventListener("mouseup", e => { if (e.button === 0) keys._m = false; });
$("restart").onclick = () => { document.exitPointerLock && document.exitPointerLock(); start(); };

// ---------------- colisión jugador ----------------
function collide(px, pz) { const r = .32; if (solidW(px + r, pz) || solidW(px - r, pz) || solidW(px, pz + r) || solidW(px, pz - r)) return false; return true; }

// ---------------- bucle ----------------
function start() {
  gstate = "play"; ov.classList.remove("show"); spawnEnemies();
  player = { hp: 100, vx: 0, vz: 0 }; mag = AK.mag; reserve = AK.reserve; sprayIdx = 0; velY = 0; crouch = false;
  const o = controls.getObject(); o.position.set(T_SPAWN.x, 1.6, T_SPAWN.z);
  camera.rotation.set(0, 0, 0);                          // mirando al frente (hacia CT/mid)
  updateHUD(); lastT = performance.now(); controls.lock(); if (raf == null) loop(lastT);
}
function loop(t) {
  raf = requestAnimationFrame(loop); let dt = (t - lastT) / 1000; if (dt > .05) dt = .05; lastT = t;
  if (gstate === "play") updatePlayer(dt);
  // recoil: aplica patrón y recupera tras soltar
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
  let maxS = 4.9; if (keys.shift) maxS *= .52; if (crouch && onGround) maxS *= .5;
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
  player.x = obj.position.x; player.z = obj.position.z; player.vx = player.vx; player.vz = player.vz;
  if (keys._m && AK.auto) fire();
  controls.pointerSpeed = (NovaSettings.loadCfg("fps").sens ? +NovaSettings.loadCfg("fps").sens : 1);
}

// ---------------- settings + arranque ----------------
try { NovaSettings.mount({ gameId: "fps", extra: [{ title: "Juego", rows: [
  { type: "range", key: "sens", label: "Sensibilidad", default: 1, min: .3, max: 2.5, step: .1, fmt: v => (+v).toFixed(1) + "×" },
  { type: "keys", label: "Mover · Andar", value: "WASD · Shift" },
  { type: "keys", label: "Agacharse · Saltar", value: "Ctrl · Espacio" },
  { type: "keys", label: "Disparar · Recargar", value: "Clic · R" },
  { type: "info", label: "AK-47", value: "Párate para precisión; spray: tira ↓" },
] }] }); } catch (e) {}
ovTitle.textContent = "STRIKE FORCE"; ovTitle.className = "";
ovMsg.innerHTML = "Mapa estilo dust2 (original). WASD mover · Shift andar · Ctrl agacharse · clic disparar · R recargar.<br>Párate para disparar preciso; en ráfaga, controla el <b>recoil del AK</b> tirando ↓. Abate los dummies.";
ovBtn.textContent = "▶ Jugar";
initScene(); ovBtn.onclick = () => start();
lastT = performance.now(); loop(lastT);
