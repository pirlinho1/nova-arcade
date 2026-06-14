/* NOVA ARCADE — Strike Force
   FPS 3D real con Three.js (ESM por CDN, sin npm). Mapa texturizado con cobertura,
   iluminación, enemigos humanoides con IA, armas en primera persona con modelo 3D,
   disparo por raycast, objetivo de bomba C4. 5v5 al mejor de 3 rondas. */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const $ = id => document.getElementById(id);
const cv = $("cv"), mini = $("mini"), mctx = mini.getContext("2d");
const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");

// ---------------- mapa (grid 20x20, celda CS=3) ----------------
const MAP = [
  "####################",
  "#A.....#......#....B#",
  "#.AAA..#..XX..#..BB.#",
  "#.A....C......C...B.#",
  "#......C......C....##",
  "#..##....CCCC....##.#",
  "#..#.......C.....#..#",
  "#.....CC.......CC...#",
  "#.C........##......C#",
  "#.C...####.##.####..C#".slice(0, 20),
  "#.....#........#....#",
  "#..C..#...YY...#..C.#",
  "#..C..C........C..C.#",
  "#.....C........C....#",
  "#..##....CCCC....##.#",
  "#....C.......C....#.#",
  "#.B..............A..#",
  "#.BB..#......#..AAA.#",
  "#B....#......#.....A#",
  "####################",
].map(r => (r + "....................").slice(0, 20).split(""));
const N = MAP.length, CS = 3, WORLD = N * CS, WH = 3.2;
const isWall = c => c === "#";
const isCover = c => c === "C";
// grid de colisión/LOS: muros (altos) y cobertura (cajas)
function cellSolid(gx, gz) { if (gx < 0 || gz < 0 || gx >= N || gz >= N) return 2; const c = MAP[gz][gx]; return isWall(c) ? 2 : isCover(c) ? 1 : 0; }
function worldSolid(x, z) { return cellSolid(Math.floor(x / CS), Math.floor(z / CS)); }
// celdas → coordenada mundo (centro)
const cellCenter = (gx, gz) => new THREE.Vector3((gx + 0.5) * CS, 0, (gz + 0.5) * CS);
const bombSites = [], spawnsA = [], spawnsB = [];
MAP.forEach((row, z) => row.forEach((c, x) => {
  if (c === "X" || c === "Y") bombSites.push(cellCenter(x, z));
  if (c === "A") spawnsA.push(cellCenter(x, z));
  if (c === "B") spawnsB.push(cellCenter(x, z));
}));

// ---------------- texturas procedurales ----------------
function makeTex(draw, rep = 1) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); draw(g, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; return t;
}
const texWall = makeTex((g, S) => {
  g.fillStyle = "#535760"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 2;
  for (let y = 0; y <= S; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  for (let x = 0, k = 0; x <= S; x += 32, k++) { const off = (k % 2) * 0; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
});
const texFloor = makeTex((g, S) => {
  g.fillStyle = "#3b3a34"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { const v = Math.random() * .12; g.fillStyle = `rgba(${200},${190},${150},${v})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,.15)"; for (let y = 0; y <= S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
}, 24);
const texCrate = makeTex((g, S) => {
  g.fillStyle = "#9c6b32"; g.fillRect(0, 0, S, S);
  g.fillStyle = "#7c5325"; g.fillRect(6, 6, S - 12, S - 12);
  g.strokeStyle = "#5e3e1a"; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
  g.beginPath(); g.moveTo(6, 6); g.lineTo(S - 6, S - 6); g.moveTo(S - 6, 6); g.lineTo(6, S - 6); g.stroke();
});

// ---------------- three básicos ----------------
let renderer, scene, camera, controls;
let raf = null, lastT = 0;
let zUpVec = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(cv.width, cv.height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6d7e90);
  scene.fog = new THREE.Fog(0x5d6c7e, 26, 78);

  camera = new THREE.PerspectiveCamera(75, cv.width / cv.height, 0.1, 200);

  // luces (más contraste para que las texturas resalten)
  const hemi = new THREE.HemisphereLight(0xbcd0e8, 0x2c2820, 0.5); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.18); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(20, 34, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  const d = 40; sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  scene.add(sun);

  // suelo
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ map: texFloor, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(WORLD / 2, 0, WORLD / 2); floor.receiveShadow = true; scene.add(floor);

  buildMap();

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  controls.addEventListener("lock", () => $("lockHint").classList.add("hide"));
  controls.addEventListener("unlock", () => $("lockHint").classList.remove("hide"));
}

const wallAABBs = []; // {x0,z0,x1,z1} para colisión jugador
function buildMap() {
  const wallMat = new THREE.MeshStandardMaterial({ map: texWall, roughness: .95 });
  const crateMat = new THREE.MeshStandardMaterial({ map: texCrate, roughness: .9 });
  const wallGeo = new THREE.BoxGeometry(CS, WH, CS);
  const crateGeo = new THREE.BoxGeometry(CS * .82, CS * .82, CS * .82);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = MAP[z][x], p = cellCenter(x, z);
    if (isWall(c)) {
      const m = new THREE.Mesh(wallGeo, wallMat); m.position.set(p.x, WH / 2, p.z); m.castShadow = m.receiveShadow = true; scene.add(m);
      wallAABBs.push({ x0: x * CS, z0: z * CS, x1: x * CS + CS, z1: z * CS + CS });
    } else if (isCover(c)) {
      const m = new THREE.Mesh(crateGeo, crateMat); m.position.set(p.x, CS * .41, p.z); m.castShadow = m.receiveShadow = true; scene.add(m);
      const h = CS * .82, off = (CS - h) / 2;
      wallAABBs.push({ x0: x * CS + off, z0: z * CS + off, x1: x * CS + off + h, z1: z * CS + off + h, low: true });
    }
  }
  // sitios de bomba: marca en el suelo
  bombSites.forEach(p => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.6, 1.0, 24), new THREE.MeshBasicMaterial({ color: 0xffcc33, side: THREE.DoubleSide, transparent: true, opacity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z); scene.add(ring); p._ring = ring;
  });
}

// ---------------- agentes (jugador + bots) ----------------
const DIFF = { facil: { acc: .55, react: .55, dmg: .7, rof: 1.3 }, normal: { acc: .78, react: .32, dmg: 1, rof: 1 }, dificil: { acc: .92, react: .16, dmg: 1.3, rof: .8 } };
const WEAPONS = {
  pistol: { name: "Pistola", dmg: 26, rof: 320, spread: .015, mag: 12, reserve: Infinity, reload: 900, auto: false, pellets: 1, range: 60, kick: .04 },
  rifle: { name: "Rifle", dmg: 20, rof: 95, spread: .03, mag: 30, reserve: 120, reload: 1500, auto: true, pellets: 1, range: 70, kick: .06 },
  shotgun: { name: "Escopeta", dmg: 12, rof: 750, spread: .12, mag: 7, reserve: 28, reload: 1800, auto: false, pellets: 8, range: 22, kick: .12 },
};
const WLIST = ["pistol", "rifle", "shotgun"];

let agents = [], player, enemyMeshes = [];
let bomb, round, score, gstate = "menu", lastTime, keys = {}, msg = "", msgT = 0;
let cfg = { sens: 1, diff: "normal", run: true, shadows: true };
let velY = 0, onGround = true;

function buildBotMesh(team) {
  const g = new THREE.Group();
  const col = team === "red" ? 0xd6394f : 0x3f7be0;
  const skin = 0xe2b48c, dark = 0x2a2d36;
  const matBody = new THREE.MeshStandardMaterial({ color: col, roughness: .7 });
  const matDark = new THREE.MeshStandardMaterial({ color: dark, roughness: .8 });
  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: .8 });
  // torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .55, 4, 10), matBody); torso.position.y = 1.15; g.add(torso);
  // chaleco
  const vest = new THREE.Mesh(new THREE.BoxGeometry(.62, .5, .42), matDark); vest.position.y = 1.18; g.add(vest);
  // cabeza + casco
  const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 14, 12), matSkin); head.position.y = 1.74; g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.23, 14, 8, 0, 6.3, 0, 1.4), matDark); helmet.position.y = 1.8; g.add(helmet);
  // piernas
  const legGeo = new THREE.CapsuleGeometry(.13, .55, 4, 8);
  const legL = new THREE.Mesh(legGeo, matDark); legL.position.set(-.16, .5, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, matDark); legR.position.set(.16, .5, 0); g.add(legR);
  // brazos
  const armGeo = new THREE.CapsuleGeometry(.1, .45, 4, 8);
  const armL = new THREE.Mesh(armGeo, matBody); armL.position.set(-.45, 1.18, .05); armL.rotation.z = .3; g.add(armL);
  const armR = new THREE.Mesh(armGeo, matBody); armR.position.set(.42, 1.15, .18); armR.rotation.x = -1; g.add(armR);
  // rifle del bot
  const gun = new THREE.Mesh(new THREE.BoxGeometry(.1, .12, .7), new THREE.MeshStandardMaterial({ color: 0x14161c })); gun.position.set(.4, 1.12, .42); g.add(gun);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.parts = { legL, legR, head, torso };
  return g;
}

function makeAgent(team, isPlayer, idx) {
  const sp = team === "red" ? spawnsA : spawnsB;
  const base = sp[idx % sp.length] || cellCenter(team === "red" ? 2 : N - 3, team === "red" ? 2 : N - 3);
  const a = {
    team, isPlayer: !!isPlayer, alive: true, hp: 100, armor: isPlayer ? 0 : 35,
    x: base.x + (Math.random() - .5), z: base.z + (Math.random() - .5), dir: team === "red" ? 0 : Math.PI,
    weapon: isPlayer ? "rifle" : (Math.random() < .6 ? "rifle" : "shotgun"),
    mag: 0, reserve: 0, nextFire: 0, reloadUntil: 0, state: "patrol", target: null, seeT: 0,
    name: (team === "red" ? "R" : "B") + idx, walk: 0,
  };
  giveAmmo(a);
  if (!isPlayer) {
    a.mesh = buildBotMesh(team); a.mesh.position.set(a.x, 0, a.z); scene.add(a.mesh);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.9, .6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(a.x, 0.95, a.z); hit.userData.agent = a; scene.add(hit); a.hit = hit; enemyMeshes.push(hit);
  }
  return a;
}
function giveAmmo(a) { const w = WEAPONS[a.weapon]; a.mag = w.mag; a.reserve = w.reserve; }

// ---------------- arma en primera persona (viewmodel) ----------------
let vm, vmFlash, vmRecoil = 0, vmReloadT = 0;
function buildViewmodel() {
  if (vm) camera.remove(vm);
  vm = new THREE.Group();
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: .5, metalness: .6 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x121419, roughness: .7 });
  const w = player.weapon;
  if (w === "pistol") {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .34), matMetal); slide.position.set(0, 0, -.18); vm.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.07, .2, .1), matDark); grip.position.set(0, -.13, .02); grip.rotation.x = .25; vm.add(grip);
  } else if (w === "rifle") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(.09, .12, .7), matMetal); body.position.set(0, 0, -.25); vm.add(body);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(.06, .22, .1), matDark); mag.position.set(0, -.16, -.1); mag.rotation.x = -.2; vm.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .2), matDark); stock.position.set(0, -.02, .16); vm.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(.02, .05, .04), matDark); sight.position.set(0, .09, -.3); vm.add(sight);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(.1, .13, .6), matMetal); body.position.set(0, 0, -.2); vm.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .55, 10), matDark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .03, -.32); vm.add(barrel);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .16), matDark); pump.position.set(0, -.06, -.18); vm.add(pump);
  }
  // muzzle flash
  vmFlash = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ color: 0xffdd77, transparent: true, opacity: 0, depthTest: false }));
  vmFlash.position.set(0, .01, w === "rifle" ? -.62 : w === "shotgun" ? -.55 : -.36); vm.add(vmFlash);
  vm.position.set(.22, -.2, -.45); camera.add(vm);
  if (!camera.parent) scene.add(camera);
}

// ---------------- disparo ----------------
const ray = new THREE.Raycaster();
function playerFire() {
  if (gstate !== "play" || !player.alive) return;
  const w = WEAPONS[player.weapon], now = performance.now();
  if (now < player.nextFire || now < player.reloadUntil) return;
  if (player.mag <= 0) { reload(player); return; }
  player.nextFire = now + w.rof; player.mag--; updateHUD();
  vmRecoil = w.kick * 6; vmFlash.material.opacity = 1; vmFlash.rotation.z = Math.random() * 6;
  sndShot(player.weapon);
  let hitAny = false;
  for (let p = 0; p < w.pellets; p++) {
    const sx = (Math.random() - .5) * w.spread, sy = (Math.random() - .5) * w.spread;
    ray.setFromCamera(new THREE.Vector2(sx * 12, sy * 12), camera); ray.far = w.range;
    const hits = ray.intersectObjects(enemyMeshes, false);
    // comparar con muro más cercano
    const wallHit = rayWall(camera.getWorldPosition(tmp), ray.ray.direction, w.range);
    if (hits.length && (!wallHit || hits[0].distance < wallHit)) {
      const a = hits[0].object.userData.agent;
      if (a && a.alive) { hurt(a, w.dmg, player); hitAny = true; }
    }
  }
  if (hitAny) showHit();
}
// distancia al primer muro a lo largo de un rayo (grid march)
function rayWall(origin, dir, maxD) {
  let x = origin.x, z = origin.z; const step = .25; const dx = dir.x * step, dz = dir.z * step;
  for (let d = 0; d < maxD; d += step) { x += dx; z += dz; if (worldSolid(x, z) === 2 || (worldSolid(x, z) === 1 && origin.y < 1.3)) return d; }
  return null;
}
function botFire(a, target) {
  const w = WEAPONS[a.weapon], now = performance.now();
  if (now < a.nextFire || now < a.reloadUntil) return;
  if (a.mag <= 0) { reload(a); return; }
  a.nextFire = now + w.rof * DIFF[cfg.diff].rof; a.mag--;
  sndShot(a.weapon, true);
  // muzzle flash del bot
  if (a.mesh) { a._mf = 1; }
  for (let p = 0; p < w.pellets; p++) {
    if (Math.random() < DIFF[cfg.diff].acc) hurt(target, w.dmg * DIFF[cfg.diff].dmg / (w.pellets > 1 ? 2 : 1), a);
  }
}
function hurt(a, dmg, by) {
  if (!a.alive) return;
  if (a.armor > 0) { const ab = Math.min(a.armor, dmg * .5); a.armor -= ab; dmg -= ab; }
  a.hp -= dmg; a._flash = 1;
  if (a.isPlayer) { flashDmg(); updateHUD(); }
  if (a.hp <= 0) kill(a, by);
}
function kill(a, by) {
  a.alive = false;
  if (a.mesh) { a.mesh.rotation.z = Math.PI / 2.2; a.mesh.position.y = 0; }     // cae
  if (a.hit) { enemyMeshes = enemyMeshes.filter(m => m !== a.hit); a.hit.userData.agent = null; }
  feed(by && by.isPlayer ? "Tú" : (by ? by.name : "?"), a.isPlayer ? "Tú" : a.name, a.team);
  sndKill();
  if (a.isPlayer) updateHUD();
  checkRoundEnd();
}
function reload(a) {
  const w = WEAPONS[a.weapon]; if (a.mag >= w.mag || a.reserve <= 0) return;
  if (performance.now() < a.reloadUntil) return;
  a.reloadUntil = performance.now() + w.reload;
  if (a.isPlayer) { vmReloadT = w.reload; sndReload(); updateHUD(); }
  setTimeout(() => {
    if (!a.alive) return; const need = w.mag - a.mag;
    if (a.reserve === Infinity) a.mag = w.mag; else { const t = Math.min(need, a.reserve); a.mag += t; a.reserve -= t; }
    if (a.isPlayer) updateHUD();
  }, w.reload);
}
function switchWeapon(name) {
  if (player.weapon === name || performance.now() < player.reloadUntil) return;
  player.weapon = name; buildViewmodel(); updateHUD(); sndSwitch();
}

// ---------------- audio sintetizado ----------------
function actx() { try { NovaAudio.resume(); } catch (e) {} return window._fpsA || (window._fpsA = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(f, dur, type, vol, slideTo) {
  try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain();
    o.type = type; o.frequency.setValueAtTime(f, A.currentTime); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, A.currentTime + dur);
    const v = (st.muteSfx ? 0 : st.sfx) * st.master * vol;
    g.gain.setValueAtTime(Math.max(.0001, v), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + dur);
    o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + dur + .02);
  } catch (e) {}
}
function noise(dur, vol) {
  try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(); const b = A.createBuffer(1, A.sampleRate * dur, A.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * vol; const f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
    n.connect(f); f.connect(g); g.connect(A.destination); n.start();
  } catch (e) {}
}
function sndShot(w, far) { const v = far ? .18 : .5; if (w === "shotgun") { noise(.18, v); tone(120, .15, "sawtooth", v * .8, 60); } else if (w === "rifle") { noise(.08, v); tone(420, .06, "square", v * .5, 180); } else { noise(.07, v); tone(520, .07, "square", v * .5, 200); } }
function sndKill() { tone(160, .25, "sawtooth", .4, 70); noise(.12, .25); }
function sndReload() { tone(300, .05, "square", .35); setTimeout(() => tone(220, .07, "square", .35), 180); setTimeout(() => tone(420, .05, "square", .35), 420); }
function sndSwitch() { tone(500, .05, "sine", .35); }

// ---------------- IA de bots ----------------
function lineClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz); const sx = dx / d, sz = dz / d; let x = ax, z = az;
  for (let i = 0; i < d * 4; i++) { x += sx * .25; z += sz * .25; if (worldSolid(x, z) === 2) return false; }
  return true;
}
function nearestEnemy(a) { let b = null, bd = 1e9; for (const e of agents) if (e.alive && e.team !== a.team) { const d = (e.x - a.x) ** 2 + (e.z - a.z) ** 2; if (d < bd) { bd = d; b = e; } } return b; }
function botMove(a, nx, nz) {
  const r = .35;
  if (worldSolid(nx + Math.sign(nx - a.x) * r, a.z) === 0) a.x = nx;
  if (worldSolid(a.x, nz + Math.sign(nz - a.z) * r) === 0) a.z = nz;
}
function botStep(a, dt) {
  if (!a.alive || a.isPlayer) return;
  const tgt = nearestEnemy(a);
  const sees = tgt && lineClear(a.x, a.z, tgt.x, tgt.z) && Math.hypot(tgt.x - a.x, tgt.z - a.z) < 36;
  if (sees) {
    a.seeT += dt;
    const want = Math.atan2(tgt.x - a.x, tgt.z - a.z); a.dir = angLerp(a.dir, want, 6 * dt);
    const dist = Math.hypot(tgt.x - a.x, tgt.z - a.z), desired = a.weapon === "shotgun" ? 5 : 11;
    const fwd = (dist > desired ? 1 : -.7) * 3.2 * dt;
    botMove(a, a.x + Math.sin(a.dir) * fwd, a.z + Math.cos(a.dir) * fwd);
    const st = Math.sin(performance.now() / 500 + a.x) * 2.4 * dt;
    botMove(a, a.x + Math.sin(a.dir + 1.57) * st, a.z + Math.cos(a.dir + 1.57) * st);
    if (Math.abs(angDiff(a.dir, want)) < .18 && a.seeT > DIFF[cfg.diff].react) { if (a.mag <= 0) reload(a); else botFire(a, tgt); }
    a.walk += Math.abs(fwd) * 6;
  } else {
    a.seeT = 0;
    if (!a.target || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 1.2) {
      const goals = (a.team === "blue" && bomb.planted) ? [bomb.site] : bombSites.concat(a.team === "red" ? spawnsB : spawnsA);
      a.target = goals[(Math.random() * goals.length) | 0] || cellCenter(10, 10);
    }
    const want = Math.atan2(a.target.x - a.x, a.target.z - a.z); a.dir = angLerp(a.dir, want, 4 * dt);
    botMove(a, a.x + Math.sin(a.dir) * 3 * dt, a.z + Math.cos(a.dir) * 3 * dt);
    if (a.mag < WEAPONS[a.weapon].mag) reload(a);
    if (a.team === "red" && !bomb.planted) for (const s of bombSites) if (Math.hypot(s.x - a.x, s.z - a.z) < .9) { plantBomb(a, s); break; }
    a.walk += 18 * dt;
  }
  // actualizar mesh
  if (a.mesh) {
    a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.dir;
    a.hit.position.set(a.x, .95, a.z);
    const sw = Math.sin(a.walk) * .5; a.mesh.userData.parts.legL.rotation.x = sw; a.mesh.userData.parts.legR.rotation.x = -sw;
    if (a._flash > 0) { a._flash -= dt * 3; a.mesh.userData.parts.torso.material.emissive = new THREE.Color(0xff0000); a.mesh.userData.parts.torso.material.emissiveIntensity = a._flash; }
    else a.mesh.userData.parts.torso.material.emissiveIntensity = 0;
  }
}
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return d; };
const angLerp = (a, b, t) => a + Math.max(-Math.abs(angDiff(a, b)), Math.min(Math.abs(angDiff(a, b)), angDiff(a, b) * Math.min(1, t)));

// ---------------- bomba ----------------
function plantBomb(by, site) { if (bomb.planted) return; bomb.planted = true; bomb.by = by; bomb.site = site; bomb.timer = 35; bomb.defTime = 0; showMsg("¡Bomba plantada! 35s", 2); tone(660, .15, "square", .5); feed("🧨" + (by.isPlayer ? "Tú" : by.name), "plantó C4", "red"); if (site._ring) site._ring.material.color.set(0xff3333); }
function tickBomb(dt) {
  if (!bomb.planted) return; bomb.timer -= dt;
  if ((bomb.timer * 2 | 0) !== bomb._lb) { bomb._lb = bomb.timer * 2 | 0; tone(900, .04, "sine", .4); }
  if (bomb.timer <= 0) { noise(.6, .6); tone(50, .6, "sawtooth", .6, 30); endRound("red", "💥 La bomba explotó"); return; }
  let def = null; for (const a of agents) if (a.alive && a.team === "blue" && Math.hypot(a.x - bomb.site.x, a.z - bomb.site.z) < .9) { def = a; break; }
  if (def) { bomb.defTime += dt; if (bomb.defTime > 6) endRound("blue", "🛡️ Bomba desactivada"); } else bomb.defTime = 0;
}

// ---------------- rondas ----------------
function aliveN(t) { return agents.filter(a => a.alive && a.team === t).length; }
function checkRoundEnd() {
  if (gstate !== "play") return;
  if (aliveN("blue") === 0 && !bomb.planted) endRound("red", "Equipo Azul eliminado");
  else if (aliveN("red") === 0 && !bomb.planted) endRound("blue", "Equipo Rojo eliminado");
}
function clearAgents() { agents.forEach(a => { if (a.mesh) scene.remove(a.mesh); if (a.hit) scene.remove(a.hit); }); agents = []; enemyMeshes = []; bombSites.forEach(p => { if (p._ring) p._ring.material.color.set(0xffcc33); }); }
function startRound() {
  clearAgents();
  player = makeAgent("red", true, 0); agents.push(player);
  for (let i = 1; i < 5; i++) agents.push(makeAgent("red", false, i));
  for (let i = 0; i < 5; i++) agents.push(makeAgent("blue", false, i));
  bomb = { planted: false, site: null, timer: 0, defTime: 0 };
  // colocar cámara en el jugador, mirando hacia el centro del mapa
  controls.getObject().position.set(player.x, 1.6, player.z);
  const yaw = Math.atan2(WORLD / 2 - player.x, WORLD / 2 - player.z);
  camera.rotation.set(0, yaw, 0); player.dir = yaw;
  buildViewmodel();
  gstate = "play"; ov.classList.remove("show"); feedClear(); updateHUD();
  showMsg("¡Ronda " + round + "!", 1.6);
  if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("chip", 124);
  lastTime = performance.now();
}
function newMatch() { round = 1; score = { red: 0, blue: 0 }; startRound(); }
function endRound(winner, why) {
  if (gstate !== "play") return; gstate = "roundend"; score[winner]++;
  NovaAudio.play(winner === "red" ? "win" : "over"); document.exitPointerLock && document.exitPointerLock();
  if (score.red >= 3 || score.blue >= 3) return endMatch(score.red >= 3);
  const me = winner === "red";
  ovTitle.textContent = me ? "¡Ronda ganada!" : "Ronda perdida"; ovTitle.className = me ? "win" : "lose";
  ovMsg.innerHTML = why + "<br>Marcador — Rojo " + score.red + " · Azul " + score.blue;
  ovBtn.textContent = "▶ Siguiente ronda"; ov.classList.add("show"); updateHUD();
  ovBtn.onclick = () => { round++; startRound(); };
}
function endMatch(won) {
  gstate = "matchend"; NovaAudio.stopMusic(); NovaAudio.play(won ? "win" : "over"); document.exitPointerLock && document.exitPointerLock();
  ovTitle.textContent = won ? "🏆 ¡VICTORIA!" : "DERROTA"; ovTitle.className = won ? "win" : "lose";
  ovMsg.innerHTML = "Resultado final — Rojo " + score.red + " · Azul " + score.blue;
  ovBtn.textContent = "↻ Nueva partida"; ov.classList.add("show"); ovBtn.onclick = () => newMatch();
}

// ---------------- HUD ----------------
function updateHUD() {
  if (!player) return;
  $("hp").textContent = Math.max(0, Math.round(player.hp)); $("armor").textContent = Math.round(player.armor);
  $("wname").textContent = WEAPONS[player.weapon].name.toUpperCase(); $("ammo").textContent = player.mag;
  $("reserve").textContent = player.reserve === Infinity ? "∞" : player.reserve;
  $("sRed").textContent = score.red; $("sBlue").textContent = score.blue; $("sRound").textContent = "Ronda " + round;
}
const feedEl = $("feed");
function feed(k, v, vt) { const d = document.createElement("div"); d.style.color = vt === "red" ? "#ff8b97" : "#9cc0ff"; d.innerHTML = `<b>${k}</b> ✖ ${v}`; feedEl.appendChild(d); setTimeout(() => d.remove(), 3500); while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild); }
function feedClear() { feedEl.innerHTML = ""; }
function showMsg(t, d) { msg = t; msgT = d; }
function flashDmg() { const e = $("dmg"); e.classList.add("on"); clearTimeout(flashDmg._t); flashDmg._t = setTimeout(() => e.classList.remove("on"), 90); }
function showHit() { const e = $("hitmark"); e.classList.remove("on"); void e.offsetWidth; e.classList.add("on"); tone(1200, .03, "square", .3); }

// ---------------- minimapa ----------------
function drawMini() {
  const s = mini.width / WORLD; mctx.clearRect(0, 0, mini.width, mini.height);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const c = MAP[z][x]; if (isWall(c)) { mctx.fillStyle = "#3a3f4d"; mctx.fillRect(x * CS * s, z * CS * s, CS * s, CS * s); } else if (isCover(c)) { mctx.fillStyle = "#5a4632"; mctx.fillRect(x * CS * s + 1, z * CS * s + 1, CS * s - 2, CS * s - 2); } }
  bombSites.forEach(p => { mctx.fillStyle = "rgba(255,200,60,.5)"; mctx.fillRect(p.x * s - 2, p.z * s - 2, 4, 4); });
  if (bomb && bomb.planted) { mctx.fillStyle = (performance.now() % 600 < 300) ? "#ff3b3b" : "#882020"; mctx.fillRect(bomb.site.x * s - 3, bomb.site.z * s - 3, 6, 6); }
  agents.forEach(a => { if (!a.alive) return; mctx.fillStyle = a.team === "red" ? "#ff465a" : "#4f8cff"; mctx.beginPath(); mctx.arc(a.x * s, a.z * s, a.isPlayer ? 3.6 : 2.4, 0, 7); mctx.fill(); });
  // dirección del jugador
  if (player && player.alive) { const e = camera.rotation.y; mctx.strokeStyle = "#fff"; mctx.beginPath(); mctx.moveTo(player.x * s, player.z * s); mctx.lineTo((player.x + Math.sin(e) * 2) * s, (player.z + Math.cos(e) * 2) * s); mctx.stroke(); }
}

// ---------------- input ----------------
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  keys[k] = true;
  if (gstate !== "play") return;
  if (k === "1") switchWeapon("pistol"); if (k === "2") switchWeapon("rifle"); if (k === "3") switchWeapon("shotgun");
  if (k === "r") reload(player); if (k === "e") interact();
  if (k === " " && onGround) { velY = 5.0; onGround = false; }
});
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
function interact() {
  if (!player.alive || bomb.planted) return;
  for (const s of bombSites) if (Math.hypot(s.x - player.x, s.z - player.z) < .9) { plantBomb(player, s); return; }
}
cv.addEventListener("click", () => { actx(); if (gstate === "play" && !controls.isLocked) controls.lock(); });
document.addEventListener("mousedown", e => { if (gstate !== "play" || !controls.isLocked) return; keys._m = true; if (!WEAPONS[player.weapon].auto) playerFire(); });
document.addEventListener("mouseup", () => keys._m = false);
$("restart").onclick = () => { document.exitPointerLock && document.exitPointerLock(); newMatch(); };

// ---------------- colisión jugador ----------------
function playerCollide(px, pz) {
  const r = .3;
  for (const b of wallAABBs) {
    if (b.low) continue; // las cajas bajas no bloquean del todo al mirar; bloqueamos igual con grid
    if (px + r > b.x0 && px - r < b.x1 && pz + r > b.z0 && pz - r < b.z1) {
      const ox = Math.min(b.x1 - (px - r), (px + r) - b.x0), oz = Math.min(b.z1 - (pz - r), (pz + r) - b.z0);
      if (ox < oz) px += (px < (b.x0 + b.x1) / 2 ? -ox : ox); else pz += (pz < (b.z0 + b.z1) / 2 ? -oz : oz);
    }
  }
  // cajas (cobertura) vía grid sólido nivel 1
  if (worldSolid(px, pz) === 1) return null;
  return { x: px, z: pz };
}

// ---------------- bucle ----------------
function loop(t) {
  raf = requestAnimationFrame(loop);
  let dt = (t - lastTime) / 1000; if (dt > .05) dt = .05; lastTime = t;
  if (gstate === "play") {
    updatePlayer(dt);
    agents.forEach(a => botStep(a, dt));
    tickBomb(dt);
    if (msgT > 0) msgT -= dt;
    // bomba ring pulso
    if (bomb && bomb.planted && bomb.site._ring) bomb.site._ring.material.opacity = .4 + Math.sin(t / 120) * .3;
  }
  // viewmodel recoil/reload anim
  if (vm) {
    vmRecoil *= .82; vm.position.z = -.45 + vmRecoil * .12; vm.rotation.x = vmRecoil * .25;
    if (vmReloadT > 0) { vmReloadT -= dt * 1000; vm.position.y = -.2 - .25 * Math.sin(Math.min(1, (WEAPONS[player.weapon].reload - vmReloadT) / WEAPONS[player.weapon].reload) * Math.PI); }
    else vm.position.y = -.2 + Math.sin(player ? player.walk || 0 : 0) * .004;
    if (vmFlash.material.opacity > 0) vmFlash.material.opacity -= dt * 8;
  }
  renderer.render(scene, camera);
  drawMini();
  // mensaje central (sobre canvas no se puede; usamos overlay simple)
  if (msgT > 0) bannerEl.textContent = msg, bannerEl.style.opacity = 1; else bannerEl.style.opacity = 0;
}
let bannerEl;
function updatePlayer(dt) {
  if (!player.alive) { return; }
  const w = WEAPONS[player.weapon];
  const obj = controls.getObject();
  // sincronizar dir lógico con cámara
  player.dir = camera.rotation.y;
  const run = (cfg.run && keys.shift) ? 1.7 : 1;
  const sp = 4.6 * run * dt;
  let fx = 0, fz = 0;
  if (keys.w || keys.arrowup) fz -= 1; if (keys.s || keys.arrowdown) fz += 1;
  if (keys.a) fx -= 1; if (keys.d) fx += 1;
  const ml = Math.hypot(fx, fz);
  if (ml > 0) {
    fx /= ml; fz /= ml;
    // mover relativo a la cámara
    const yaw = obj.rotation.y;
    const dx = (fx * Math.cos(yaw) - fz * Math.sin(yaw));
    const dz = (fx * Math.sin(yaw) + fz * Math.cos(yaw));
    const nx = obj.position.x + dx * sp, nz = obj.position.z + dz * sp;
    const res = playerCollide(nx, obj.position.z) && playerCollide(nx, nz);
    const rx = playerCollide(nx, obj.position.z); if (rx) obj.position.x = rx.x;
    const rz = playerCollide(obj.position.x, nz); if (rz) obj.position.z = rz.z;
    player.walk += sp * 3;
  }
  // salto / gravedad
  velY -= 14 * dt; obj.position.y += velY * dt;
  if (obj.position.y <= 1.6) { obj.position.y = 1.6; velY = 0; onGround = true; }
  player.x = obj.position.x; player.z = obj.position.z;
  if (keys._m && w.auto) playerFire();
}

// ---------------- settings ----------------
NovaSettings.mount({
  gameId: "fps", extra: [{
    title: "Juego", rows: [
      { type: "select", key: "diff", label: "Dificultad IA", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
      { type: "range", key: "sens", label: "Sensibilidad ratón", default: 1, min: .3, max: 2.5, step: .1, fmt: v => v.toFixed(1) + "×" },
      { type: "toggle", key: "run", label: "Correr con Shift", default: true },
      { type: "keys", label: "Mover · Saltar", value: "WASD · Espacio" },
      { type: "keys", label: "Apuntar / disparar", value: "Ratón / Clic" },
      { type: "keys", label: "Armas · Recargar · C4", value: "1·2·3 · R · E" },
    ]
  }],
  onChange: (k, v) => { cfg[k] = (k === "diff" || k === "run") ? v : parseFloat(v); applySens(); }
});
const saved = NovaSettings.loadCfg("fps");
Object.assign(cfg, { sens: +saved.sens || 1, diff: saved.diff || "normal", run: saved.run !== undefined ? saved.run : true });
function applySens() { if (controls) controls.pointerSpeed = cfg.sens; }

// ---------------- arranque ----------------
initScene(); applySens();
// banner DOM para mensajes centrales
bannerEl = document.createElement("div");
bannerEl.style.cssText = "position:absolute;left:50%;top:42%;transform:translateX(-50%);z-index:6;font-family:'Bungee',sans-serif;font-size:26px;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;opacity:0;transition:opacity .2s";
document.querySelector(".fps-stage").appendChild(bannerEl);
ovBtn.onclick = () => { actx(); newMatch(); controls.lock(); };
lastTime = performance.now(); loop(lastTime);
