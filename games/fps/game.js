/* NOVA ARCADE — Strike Force (v2)
   FPS 3D táctico con Three.js. Retroceso/aim-punch, mira dinámica, ADS (zoom),
   trazadoras + chispas + sangre, granadas, economía con menú de compra entre rondas,
   pasos, IA mejorada y objetivo de bomba C4. 5v5 al mejor de 3 rondas. */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const $ = id => document.getElementById(id);
const cv = $("cv"), mini = $("mini"), mctx = mini.getContext("2d");
const ov = $("ov"), ovTitle = $("ov-title"), ovMsg = $("ov-msg"), ovBtn = $("ov-btn");
const crosshairEl = $("crosshair"), adsVig = $("adsVig"), buyEl = $("buy");

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
const isWall = c => c === "#", isCover = c => c === "C";
function cellSolid(gx, gz) { if (gx < 0 || gz < 0 || gx >= N || gz >= N) return 2; const c = MAP[gz][gx]; return isWall(c) ? 2 : isCover(c) ? 1 : 0; }
function worldSolid(x, z) { return cellSolid(Math.floor(x / CS), Math.floor(z / CS)); }
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
  for (let x = 0; x <= S; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
});
const texFloor = makeTex((g, S) => {
  g.fillStyle = "#3b3a34"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { const v = Math.random() * .12; g.fillStyle = `rgba(200,190,150,${v})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,.15)"; for (let y = 0; y <= S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
}, 24);
const texCrate = makeTex((g, S) => {
  g.fillStyle = "#9c6b32"; g.fillRect(0, 0, S, S); g.fillStyle = "#7c5325"; g.fillRect(6, 6, S - 12, S - 12);
  g.strokeStyle = "#5e3e1a"; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
  g.beginPath(); g.moveTo(6, 6); g.lineTo(S - 6, S - 6); g.moveTo(S - 6, 6); g.lineTo(6, S - 6); g.stroke();
});

// ---------------- three básicos ----------------
let renderer, scene, camera, controls;
let raf = null;
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
const BASE_FOV = 75, ADS_FOV = 50;

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(cv.width, cv.height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6d7e90);
  scene.fog = new THREE.Fog(0x5d6c7e, 26, 78);
  camera = new THREE.PerspectiveCamera(BASE_FOV, cv.width / cv.height, 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xbcd0e8, 0x2c2820, 0.5); scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(20, 34, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  const d = 40; sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ map: texFloor, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(WORLD / 2, 0, WORLD / 2); floor.receiveShadow = true; scene.add(floor);
  buildMap();
  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  controls.addEventListener("lock", () => $("lockHint").classList.add("hide"));
  controls.addEventListener("unlock", () => $("lockHint").classList.remove("hide"));
}

const wallAABBs = [];
function buildMap() {
  const wallMat = new THREE.MeshStandardMaterial({ map: texWall, roughness: .95 });
  const crateMat = new THREE.MeshStandardMaterial({ map: texCrate, roughness: .9 });
  const wallGeo = new THREE.BoxGeometry(CS, WH, CS), crateGeo = new THREE.BoxGeometry(CS * .82, CS * .82, CS * .82);
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
  bombSites.forEach(p => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.6, 1.0, 24), new THREE.MeshBasicMaterial({ color: 0xffcc33, side: THREE.DoubleSide, transparent: true, opacity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z); scene.add(ring); p._ring = ring;
  });
}

// ---------------- datos ----------------
const DIFF = { facil: { acc: .55, react: .55, dmg: .7, rof: 1.3 }, normal: { acc: .78, react: .32, dmg: 1, rof: 1 }, dificil: { acc: .92, react: .16, dmg: 1.3, rof: .8 } };
// Arsenal estilo CS (nombres ORIGINALES). accStand=imprecisión parado (1er disparo),
// accMove=por velocidad, accAir=saltando; headMult=multiplicador a la cabeza; moveSpd=mult. de velocidad.
const WEAPONS = {
  pistol: { name: "Pistola", dmg: 24, rof: 340, mag: 12, reserve: 60, reload: 900, auto: false, pellets: 1, range: 70, accStand: .0010, accMove: .010, accAir: .10, moveSpd: 1.0, headMult: 3.6 },
  rifle:  { name: "Rifle",   dmg: 31, rof: 100, mag: 30, reserve: 90, reload: 1500, auto: true, pellets: 1, range: 90, accStand: .0009, accMove: .013, accAir: .13, moveSpd: 0.92, headMult: 4.0 },
  sniper: { name: "Sniper",  dmg: 115, rof: 1100, mag: 5, reserve: 25, reload: 2200, auto: false, pellets: 1, range: 140, accStand: .0006, accMove: .090, accAir: .18, moveSpd: 0.82, headMult: 2.4, scope: true, hipAcc: .055 },
};
// patrones de retroceso DETERMINISTAS (deltas en radianes por disparo: [yaw, pitch↑]).
// Se aprenden y se contrarrestan tirando del ratón en sentido contrario, como en CS.
const PAT = {
  rifle: [[0, .016], [.002, .017], [-.002, .018], [.001, .018], [.004, .016], [-.006, .014], [.010, .012], [.014, .011], [.018, .009], [.012, .008], [-.012, .007], [-.020, .007], [-.024, .006], [-.020, .006], [-.014, .006], [.016, .006], [.022, .005], [.020, .005], [.014, .005], [.008, .005], [-.010, .005], [.010, .005], [-.008, .005], [.006, .005], [-.006, .005]],
  pistol: [[0, .012], [.003, .011], [-.003, .010], [.004, .009], [-.004, .008], [.005, .008], [-.005, .007], [.004, .007]],
  sniper: [[0, .03], [.012, .03], [-.012, .03]],
};
const BUYS = [
  { id: "armor", label: "🛡️ Kevlar (100)", price: 650, owned: () => me.armor >= 100 },
  { id: "rifle", label: "🔫 Rifle", price: 2700, owned: () => me.weapon === "rifle" },
  { id: "sniper", label: "🎯 Sniper", price: 4750, owned: () => me.weapon === "sniper" },
  { id: "pistol", label: "🔫 Pistola", price: 0, owned: () => me.weapon === "pistol" },
  { id: "nade", label: "💣 Granada", price: 300, owned: () => false },
];

let agents = [], player, enemyMeshes = [];
let bomb, round, score, gstate = "menu", lastTime, keys = {}, msg = "", msgT = 0;
let cfg = { sens: 1, diff: "normal", run: true, fov: 75, cc: "#ffffff" };
let me = { money: 800, nades: 0, weapon: "pistol", armor: 0 };
let velY = 0, onGround = true, ads = false, adsT = 0;
const recoil = { pitch: 0, yaw: 0, ap: 0, ay: 0 };
let fx = [], tracers = [], grenades = [];
let stepTimer = 0, fireFlash = 0;

// ---------------- mallas de bots ----------------
function mk(geo, mat, px, py, pz, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px || 0, py || 0, pz || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); return m;
}
function buildBotMesh(team) {
  const g = new THREE.Group();
  const col = team === "red" ? 0xd6394f : 0x3f7be0, dark = 0x2a2d36;
  const matBody = new THREE.MeshStandardMaterial({ color: col, roughness: .7 });
  const matDark = new THREE.MeshStandardMaterial({ color: dark, roughness: .8 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xe2b48c, roughness: .8 });
  const torso = mk(new THREE.CapsuleGeometry(.34, .55, 4, 10), matBody, 0, 1.15, 0); g.add(torso);
  g.add(mk(new THREE.BoxGeometry(.62, .5, .42), matDark, 0, 1.18, 0));
  const head = mk(new THREE.SphereGeometry(.21, 14, 12), matSkin, 0, 1.74, 0); g.add(head);
  g.add(mk(new THREE.SphereGeometry(.23, 14, 8, 0, 6.3, 0, 1.4), matDark, 0, 1.8, 0));
  const legGeo = new THREE.CapsuleGeometry(.13, .55, 4, 8);
  const legL = mk(legGeo, matDark.clone(), -.16, .5, 0); g.add(legL);
  const legR = mk(legGeo, matDark.clone(), .16, .5, 0); g.add(legR);
  const armGeo = new THREE.CapsuleGeometry(.1, .45, 4, 8);
  g.add(mk(armGeo, matBody, -.45, 1.18, .05, 0, 0, .3));
  g.add(mk(armGeo, matBody, .42, 1.15, .18, -1, 0, 0));
  g.add(mk(new THREE.BoxGeometry(.1, .12, .7), new THREE.MeshStandardMaterial({ color: 0x14161c }), .4, 1.12, .42));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.parts = { legL, legR, head, torso };
  return g;
}

function makeAgent(team, isPlayer, idx) {
  const sp = team === "red" ? spawnsA : spawnsB;
  const base = sp[idx % sp.length] || cellCenter(team === "red" ? 2 : N - 3, team === "red" ? 2 : N - 3);
  const a = {
    team, isPlayer: !!isPlayer, alive: true, hp: 100,
    armor: isPlayer ? me.armor : 35, x: base.x + (Math.random() - .5), z: base.z + (Math.random() - .5),
    dir: team === "red" ? 0 : Math.PI, weapon: isPlayer ? me.weapon : (Math.random() < .68 ? "rifle" : (Math.random() < .5 ? "sniper" : "pistol")),
    mag: 0, reserve: 0, nextFire: 0, reloadUntil: 0, target: null, seeT: 0, name: (team === "red" ? "R" : "B") + idx, walk: 0,
  };
  giveAmmo(a);
  if (!isPlayer) {
    a.mesh = buildBotMesh(team); a.mesh.position.set(a.x, 0, a.z); scene.add(a.mesh);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.9, .6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(a.x, .95, a.z); hit.userData.agent = a; scene.add(hit); a.hit = hit; enemyMeshes.push(hit);
  }
  return a;
}
function giveAmmo(a) { const w = WEAPONS[a.weapon]; a.mag = w.mag; a.reserve = w.reserve; }

// ---------------- viewmodel ----------------
let vm, vmFlash, vmRecoil = 0, vmReloadT = 0, vmBaseX = .22;
function buildViewmodel() {
  if (vm) camera.remove(vm);
  vm = new THREE.Group();
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: .5, metalness: .6 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x121419, roughness: .7 });
  const w = player.weapon;
  if (w === "pistol") {
    vm.add(mk(new THREE.BoxGeometry(.08, .1, .34), matMetal, 0, 0, -.18));
    vm.add(mk(new THREE.BoxGeometry(.07, .2, .1), matDark, 0, -.13, .02, .25, 0, 0));
  } else if (w === "rifle") {
    vm.add(mk(new THREE.BoxGeometry(.09, .12, .7), matMetal, 0, 0, -.25));
    vm.add(mk(new THREE.BoxGeometry(.06, .22, .1), matDark, 0, -.16, -.1, -.2, 0, 0));
    vm.add(mk(new THREE.BoxGeometry(.06, .1, .2), matDark, 0, -.02, .16));
    vm.add(mk(new THREE.BoxGeometry(.02, .05, .04), matDark, 0, .09, -.3));
  } else {   // sniper: cuerpo largo + cañón fino + mira
    vm.add(mk(new THREE.BoxGeometry(.08, .11, .95), matMetal, 0, 0, -.35));
    vm.add(mk(new THREE.CylinderGeometry(.022, .022, .5, 10), matDark, 0, .02, -.78, Math.PI / 2, 0, 0));
    vm.add(mk(new THREE.BoxGeometry(.06, .2, .1), matDark, 0, -.15, -.1, -.2, 0, 0));
    vm.add(mk(new THREE.CylinderGeometry(.05, .05, .26, 12), matDark, 0, .12, -.34, Math.PI / 2, 0, 0)); // tubo de mira
    vm.add(mk(new THREE.BoxGeometry(.06, .09, .22), matDark, 0, -.02, .2));
  }
  vmFlash = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ color: 0xffdd77, transparent: true, opacity: 0, depthTest: false }));
  vmFlash.position.set(0, .01, w === "rifle" ? -.62 : w === "sniper" ? -1.05 : -.36); vm.add(vmFlash);
  vm.position.set(vmBaseX, -.2, -.45); camera.add(vm);
  if (!camera.parent) scene.add(camera);
}

// ---------------- efectos ----------------
function spawnFx(point, color, n, spd) {
  const geo = new THREE.SphereGeometry(.03, 4, 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(point); scene.add(m);
    fx.push({ m, vx: (Math.random() - .5) * spd, vy: Math.random() * spd, vz: (Math.random() - .5) * spd, life: .4 + Math.random() * .3 });
  }
}
function tracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: .8 }));
  scene.add(line); tracers.push({ line, life: .06 });
}

// ---------------- disparo ----------------
const ray = new THREE.Raycaster();
// imprecisión angular actual del jugador (radianes). 0 = puntería perfecta.
function currentInacc(w) {
  const moveSpd = Math.hypot(player.vx || 0, player.vz || 0);
  let inacc = w.accStand + w.accMove * (moveSpd / 4.6);     // 4.6 ≈ velocidad de carrera
  if (!onGround) inacc += w.accAir;
  if (w.scope && !ads) inacc += w.hipAcc;                   // sniper sin mira = muy impreciso
  return inacc;
}
function playerFire() {
  if (gstate !== "play" || !player.alive) return;
  const w = WEAPONS[player.weapon], now = performance.now();
  if (now < player.nextFire || now < player.reloadUntil) return;
  if (player.mag <= 0) { reload(player); return; }
  player.nextFire = now + w.rof; player.mag--; updateHUD();
  vmRecoil = 1; vmFlash.material.opacity = 1; vmFlash.rotation.z = Math.random() * 6; fireFlash = .07;
  // RETROCESO determinista: kickea la vista según el patrón (tú lo compensas tirando del ratón)
  const pat = PAT[player.weapon] || PAT.pistol; const pp = pat[Math.min(player.sprayIdx, pat.length - 1)];
  const km = (player.weapon === "sniper" ? 1 : 1) * (onGround ? 1 : 1.5);
  recoil.pitch += pp[1] * km; recoil.yaw += pp[0] * km; player.sprayIdx++; player.lastShot = now;
  sndShot(player.weapon);
  // imprecisión: cono aleatorio que depende del movimiento (parado = 1er disparo perfecto)
  const inacc = currentInacc(w);
  const muzzle = camera.getWorldPosition(new THREE.Vector3());
  let hitAny = false;
  for (let p = 0; p < w.pellets; p++) {
    // desviación gaussiana-ish dentro del cono de imprecisión
    const a = Math.random() * 6.283, r = inacc * Math.sqrt(Math.random());
    const sx = Math.cos(a) * r, sy = Math.sin(a) * r;
    ray.setFromCamera(new THREE.Vector2(sx * 30, sy * 30), camera); ray.far = w.range;
    const hits = ray.intersectObjects(enemyMeshes, false);
    const wallD = rayWall(muzzle, ray.ray.direction, w.range);
    let end;
    if (hits.length && (wallD == null || hits[0].distance < wallD)) {
      const ag = hits[0].object.userData.agent; end = hits[0].point;
      if (ag && ag.alive) {
        // hitbox: cabeza / pecho / piernas (altura del impacto sobre el cuerpo)
        const rel = end.y - ag.hit.position.y;        // centro del hitbox ≈ 0.95
        const head = rel > 0.58, legs = rel < -0.45;
        const mult = head ? w.headMult : legs ? 0.75 : 1.0;
        hurt(ag, w.dmg * mult, player, head); hitAny = true; spawnFx(end, head ? 0xffffff : 0xff2b3b, head ? 8 : 5, 3);
        if (head) tone(1500, .04, "square", .35);
      }
    } else if (wallD != null) { end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(wallD)); spawnFx(end, 0xffd24a, 4, 2); }
    else end = muzzle.clone().add(ray.ray.direction.clone().multiplyScalar(w.range));
    tracer(muzzle, end);
  }
  if (hitAny) showHit();
}
function rayWall(origin, dir, maxD) {
  let x = origin.x, z = origin.z; const step = .25, dx = dir.x * step, dz = dir.z * step;
  for (let d = 0; d < maxD; d += step) { x += dx; z += dz; if (worldSolid(x, z) === 2 || (worldSolid(x, z) === 1 && origin.y < 1.3)) return d; }
  return null;
}
function botFire(a, target) {
  const w = WEAPONS[a.weapon], now = performance.now();
  if (now < a.nextFire || now < a.reloadUntil) return;
  if (a.mag <= 0) { reload(a); return; }
  a.nextFire = now + w.rof * DIFF[cfg.diff].rof; a.mag--; sndShot(a.weapon, true);
  for (let p = 0; p < w.pellets; p++) if (Math.random() < DIFF[cfg.diff].acc) hurt(target, w.dmg * DIFF[cfg.diff].dmg / (w.pellets > 1 ? 2 : 1), a);
}
function hurt(a, dmg, by, head) {
  if (!a.alive) return;
  // kevlar protege el cuerpo (mitad) pero poco la cabeza (como en CS → headshots letales con armadura)
  if (a.armor > 0) { const absorbFrac = head ? 0.18 : 0.5; const ab = Math.min(a.armor, dmg * absorbFrac); a.armor -= ab; dmg -= ab; if (a.isPlayer) me.armor = a.armor; }
  a.hp -= dmg; a._flash = 1; a.tagT = 0.25;          // tagging: ralentiza brevemente al recibir daño
  if (a.isPlayer) { flashDmg(); updateHUD(); }
  if (a.hp <= 0) kill(a, by);
}
function kill(a, by) {
  a.alive = false;
  if (a.mesh) { a.mesh.rotation.z = Math.PI / 2.2; a.mesh.position.y = 0; a.mesh.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone ? o.material.clone() : o.material; }); }
  if (a.hit) { enemyMeshes = enemyMeshes.filter(m => m !== a.hit); a.hit.userData.agent = null; }
  feed(by && by.isPlayer ? "Tú" : (by ? by.name : "?"), a.isPlayer ? "Tú" : a.name, a.team);
  sndKill();
  if (by && by.isPlayer && !a.isPlayer) { me.money += 300; updateHUD(); }
  if (a.isPlayer) updateHUD();
  checkRoundEnd();
}
function reload(a) {
  const w = WEAPONS[a.weapon]; if (a.mag >= w.mag || a.reserve <= 0) return;
  if (performance.now() < a.reloadUntil) return;
  a.reloadUntil = performance.now() + w.reload;
  if (a.isPlayer) { vmReloadT = w.reload; sndReload(); updateHUD(); }
  setTimeout(() => { if (!a.alive) return; const need = w.mag - a.mag, t = Math.min(need, a.reserve); a.mag += t; a.reserve -= t; if (a.isPlayer) updateHUD(); }, w.reload);
}
function switchWeapon(name) {
  if (player.weapon === name || performance.now() < player.reloadUntil) return;
  player.weapon = name; buildViewmodel(); updateHUD(); sndSwitch();
}

// ---------------- granadas ----------------
function throwGrenade() {
  if (gstate !== "play" || !player.alive || me.nades <= 0) return;
  me.nades--; updateHUD(); sndSwitch();
  camera.getWorldDirection(fwd);
  const pos = camera.getWorldPosition(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: .6 }));
  m.position.copy(pos); m.castShadow = true; scene.add(m);
  grenades.push({ m, v: fwd.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4, 0)), fuse: 1.7 });
}
function stepGrenade(gr, dt) {
  gr.fuse -= dt; gr.v.y -= 16 * dt;
  const p = gr.m.position;
  let nx = p.x + gr.v.x * dt, ny = p.y + gr.v.y * dt, nz = p.z + gr.v.z * dt;
  if (ny < .15) { ny = .15; gr.v.y *= -.45; gr.v.x *= .7; gr.v.z *= .7; }
  if (worldSolid(nx, p.z) === 2) gr.v.x *= -.5, nx = p.x;
  if (worldSolid(p.x, nz) === 2) gr.v.z *= -.5, nz = p.z;
  p.set(nx, ny, nz);
  if (gr.fuse <= 0) { explode(p.clone()); scene.remove(gr.m); gr._dead = true; }
}
function explode(pos) {
  spawnFx(pos, 0xffa030, 26, 9); spawnFx(pos, 0x888888, 14, 5);
  noise(.5, .7); tone(60, .5, "sawtooth", .6, 28);
  const fl = new THREE.PointLight(0xffaa44, 8, 14); fl.position.copy(pos); scene.add(fl);
  fx.push({ light: fl, life: .25, vx: 0, vy: 0, vz: 0 });
  agents.forEach(a => {
    if (!a.alive) return; const ax = a.isPlayer ? player.x : a.x, az = a.isPlayer ? player.z : a.z;
    const d = Math.hypot(ax - pos.x, az - pos.z);
    if (d < 5.5) { const dmg = 90 * (1 - d / 5.5); hurt(a, dmg, player); }
  });
}

// ---------------- audio ----------------
function actx() { try { NovaAudio.resume(); } catch (e) {} return window._fpsA || (window._fpsA = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(f, dur, type, vol, slideTo) {
  try { const A = actx(), st = NovaAudio.get(); const o = A.createOscillator(), g = A.createGain();
    o.type = type; o.frequency.setValueAtTime(f, A.currentTime); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, A.currentTime + dur);
    const v = (st.muteSfx ? 0 : st.sfx) * st.master * vol; g.gain.setValueAtTime(Math.max(.0001, v), A.currentTime); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + dur);
    o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + dur + .02);
  } catch (e) {}
}
function noise(dur, vol) {
  try { const A = actx(), st = NovaAudio.get(); const n = A.createBufferSource(), b = A.createBuffer(1, A.sampleRate * dur, A.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    n.buffer = b; const g = A.createGain(); g.gain.value = (st.muteSfx ? 0 : st.sfx) * st.master * vol; const f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
    n.connect(f); f.connect(g); g.connect(A.destination); n.start();
  } catch (e) {}
}
function sndShot(w, far) { const v = far ? .18 : .5; if (w === "sniper") { noise(.16, v); tone(220, .18, "sawtooth", v * .9, 70); } else if (w === "rifle") { noise(.07, v); tone(440, .06, "square", v * .5, 190); } else { noise(.06, v); tone(540, .07, "square", v * .5, 210); } }
function sndKill() { tone(160, .25, "sawtooth", .4, 70); noise(.12, .25); }
function sndReload() { tone(300, .05, "square", .35); setTimeout(() => tone(220, .07, "square", .35), 180); setTimeout(() => tone(420, .05, "square", .35), 420); }
function sndSwitch() { tone(500, .05, "sine", .35); }
function sndStep() { noise(.05, .12); }

// ---------------- IA ----------------
function lineClear(ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), sx = dx / d, sz = dz / d; let x = ax, z = az; for (let i = 0; i < d * 4; i++) { x += sx * .25; z += sz * .25; if (worldSolid(x, z) === 2) return false; } return true; }
function nearestEnemy(a) { let b = null, bd = 1e9; for (const e of agents) if (e.alive && e.team !== a.team) { const d = (e.x - a.x) ** 2 + (e.z - a.z) ** 2; if (d < bd) { bd = d; b = e; } } return b; }
function botMove(a, nx, nz) { const r = .35; if (worldSolid(nx + Math.sign(nx - a.x) * r, a.z) === 0) a.x = nx; if (worldSolid(a.x, nz + Math.sign(nz - a.z) * r) === 0) a.z = nz; }
function botStep(a, dt) {
  if (!a.alive || a.isPlayer) return;
  const tgt = nearestEnemy(a);
  const sees = tgt && lineClear(a.x, a.z, tgt.x, tgt.z) && Math.hypot(tgt.x - a.x, tgt.z - a.z) < 36;
  if (sees) {
    a.seeT += dt; const want = Math.atan2(tgt.x - a.x, tgt.z - a.z); a.dir = angLerp(a.dir, want, 6 * dt);
    const dist = Math.hypot(tgt.x - a.x, tgt.z - a.z), desired = a.weapon === "sniper" ? 18 : 11, fwd2 = (dist > desired ? 1 : -.7) * 3.2 * dt;
    botMove(a, a.x + Math.sin(a.dir) * fwd2, a.z + Math.cos(a.dir) * fwd2);
    const st = Math.sin(performance.now() / 500 + a.x) * 2.4 * dt;
    botMove(a, a.x + Math.sin(a.dir + 1.57) * st, a.z + Math.cos(a.dir + 1.57) * st);
    if (Math.abs(angDiff(a.dir, want)) < .18 && a.seeT > DIFF[cfg.diff].react) { if (a.mag <= 0) reload(a); else botFire(a, tgt); }
    a.walk += Math.abs(fwd2) * 6;
  } else {
    a.seeT = 0;
    if (!a.target || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 1.2) { const goals = (a.team === "blue" && bomb.planted) ? [bomb.site] : bombSites.concat(a.team === "red" ? spawnsB : spawnsA); a.target = goals[(Math.random() * goals.length) | 0] || cellCenter(10, 10); }
    const want = Math.atan2(a.target.x - a.x, a.target.z - a.z); a.dir = angLerp(a.dir, want, 4 * dt);
    botMove(a, a.x + Math.sin(a.dir) * 3 * dt, a.z + Math.cos(a.dir) * 3 * dt);
    if (a.mag < WEAPONS[a.weapon].mag) reload(a);
    if (a.team === "red" && !bomb.planted) for (const s of bombSites) if (Math.hypot(s.x - a.x, s.z - a.z) < .9) { plantBomb(a, s); break; }
    a.walk += 18 * dt;
  }
  if (a.mesh) {
    a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.dir; a.hit.position.set(a.x, .95, a.z);
    const sw = Math.sin(a.walk) * .5; a.mesh.userData.parts.legL.rotation.x = sw; a.mesh.userData.parts.legR.rotation.x = -sw;
    const t = a.mesh.userData.parts.torso;
    if (a._flash > 0) { a._flash -= dt * 3; t.material.emissive = new THREE.Color(0xff0000); t.material.emissiveIntensity = a._flash; } else t.material.emissiveIntensity = 0;
  }
}
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return d; };
const angLerp = (a, b, t) => a + Math.max(-Math.abs(angDiff(a, b)), Math.min(Math.abs(angDiff(a, b)), angDiff(a, b) * Math.min(1, t)));

// ---------------- bomba ----------------
function plantBomb(by, site) { if (bomb.planted) return; bomb.planted = true; bomb.by = by; bomb.site = site; bomb.timer = 35; bomb.defTime = 0; showMsg("¡Bomba plantada! 35s", 2); tone(660, .15, "square", .5); feed("🧨" + (by.isPlayer ? "Tú" : by.name), "plantó C4", "red"); if (site._ring) site._ring.material.color.set(0xff3333); }
function tickBomb(dt) {
  if (!bomb.planted) return; bomb.timer -= dt;
  if ((bomb.timer * 2 | 0) !== bomb._lb) { bomb._lb = bomb.timer * 2 | 0; tone(900, .04, "sine", .4); }
  if (bomb.timer <= 0) { explode(bomb.site.clone().setY(.3)); endRound("red", "💥 La bomba explotó"); return; }
  let def = null; for (const a of agents) if (a.alive && a.team === "blue" && Math.hypot(a.x - bomb.site.x, a.z - bomb.site.z) < .9) { def = a; break; }
  if (def) { bomb.defTime += dt; if (bomb.defTime > 6) endRound("blue", "🛡️ Bomba desactivada"); } else bomb.defTime = 0;
}

// ---------------- rondas + economía ----------------
function aliveN(t) { return agents.filter(a => a.alive && a.team === t).length; }
function checkRoundEnd() {
  if (gstate !== "play") return;
  if (aliveN("blue") === 0 && !bomb.planted) endRound("red", "Equipo Azul eliminado");
  else if (aliveN("red") === 0 && !bomb.planted) endRound("blue", "Equipo Rojo eliminado");
}
function clearAgents() { agents.forEach(a => { if (a.mesh) scene.remove(a.mesh); if (a.hit) scene.remove(a.hit); }); agents = []; enemyMeshes = []; grenades.forEach(g => scene.remove(g.m)); grenades = []; bombSites.forEach(p => { if (p._ring) p._ring.material.color.set(0xffcc33); }); }
function setupRound() {
  clearAgents();
  player = makeAgent("red", true, 0); agents.push(player);
  for (let i = 1; i < 5; i++) agents.push(makeAgent("red", false, i));
  for (let i = 0; i < 5; i++) agents.push(makeAgent("blue", false, i));
  bomb = { planted: false, site: null, timer: 0, defTime: 0 };
  controls.getObject().position.set(player.x, 1.6, player.z);
  const yaw = Math.atan2(WORLD / 2 - player.x, WORLD / 2 - player.z); camera.rotation.set(0, yaw, 0); player.dir = yaw;
  recoil.pitch = recoil.yaw = recoil.ap = recoil.ay = 0; velY = 0; ads = false; adsT = 0;
  player.vx = 0; player.vz = 0; player.sprayIdx = 0; player.lastShot = 0; player.tagT = 0;
  buildViewmodel(); feedClear(); updateHUD();
}
function newMatch() { me = { money: 800, nades: 0, weapon: "pistol", armor: 0 }; round = 1; score = { red: 0, blue: 0 }; setupRound(); enterBuy(); }

function enterBuy() {
  gstate = "buy"; document.exitPointerLock && document.exitPointerLock();
  ovTitle.textContent = "🛒 Compra — Ronda " + round; ovTitle.className = "";
  ovMsg.innerHTML = "Marcador — Rojo " + score.red + " · Azul " + score.blue;
  buildBuyMenu(); buyEl.classList.add("show");
  ovBtn.textContent = "▶ Combatir"; ov.classList.add("show");
  ovBtn.onclick = beginPlay;
}
function buildBuyMenu() {
  buyEl.innerHTML = `<h3>Equípate</h3><div class="money-line">Dinero: <b>$${me.money}</b> · Granadas: <b>${me.nades}</b>/3</div><div class="grid"></div>`;
  const grid = buyEl.querySelector(".grid");
  BUYS.forEach(it => {
    const owned = it.owned(), afford = me.money >= it.price, maxNade = it.id === "nade" && me.nades >= 3;
    const el = document.createElement("div"); el.className = "item" + (owned ? " owned" : "") + ((!afford || maxNade) && !owned ? " dis" : "");
    el.innerHTML = `<span>${it.label}${owned ? " ✓" : ""}</span><span class="price">${it.price ? "$" + it.price : "GRATIS"}</span>`;
    el.onclick = () => {
      if (it.id === "nade") { if (me.nades >= 3 || me.money < it.price) return; me.money -= it.price; me.nades++; }
      else { if (owned || me.money < it.price) return; me.money -= it.price; if (it.id === "armor") { me.armor = 100; player.armor = 100; } else { me.weapon = it.id; player.weapon = it.id; giveAmmo(player); buildViewmodel(); } }
      tone(880, .06, "triangle", .4); buildBuyMenu(); updateHUD();
    };
    grid.appendChild(el);
  });
}
function beginPlay() {
  gstate = "play"; buyEl.classList.remove("show"); ov.classList.remove("show");
  showMsg("¡Ronda " + round + "!", 1.4); if (!NovaAudio.isMusicOn()) NovaAudio.startMusic("chip", 124);
  lastTime = performance.now(); controls.lock();
}
function endRound(winner, why) {
  if (gstate !== "play") return; gstate = "roundend"; score[winner]++;
  NovaAudio.play(winner === "red" ? "win" : "over"); document.exitPointerLock && document.exitPointerLock();
  me.money += winner === "red" ? 3000 : 1500;   // premio/consuelo
  if (score.red >= 3 || score.blue >= 3) return endMatch(score.red >= 3);
  const meWon = winner === "red";
  buyEl.classList.remove("show");
  ovTitle.textContent = meWon ? "¡Ronda ganada!" : "Ronda perdida"; ovTitle.className = meWon ? "win" : "lose";
  ovMsg.innerHTML = why + "<br>Marcador — Rojo " + score.red + " · Azul " + score.blue + " &nbsp;|&nbsp; +$" + (meWon ? 3000 : 1500);
  ovBtn.textContent = "🛒 Siguiente ronda"; ov.classList.add("show");
  ovBtn.onclick = () => { round++; setupRound(); enterBuy(); };
}
function endMatch(won) {
  gstate = "matchend"; NovaAudio.stopMusic(); NovaAudio.play(won ? "win" : "over"); document.exitPointerLock && document.exitPointerLock();
  buyEl.classList.remove("show");
  ovTitle.textContent = won ? "🏆 ¡VICTORIA!" : "DERROTA"; ovTitle.className = won ? "win" : "lose";
  ovMsg.innerHTML = "Resultado final — Rojo " + score.red + " · Azul " + score.blue;
  ovBtn.textContent = "↻ Nueva partida"; ov.classList.add("show"); ovBtn.onclick = () => newMatch();
}

// ---------------- HUD ----------------
function updateHUD() {
  if (!player) return;
  $("hp").textContent = Math.max(0, Math.round(player.hp)); $("armor").textContent = Math.round(player.armor);
  $("money").textContent = me.money; $("nades").textContent = me.nades;
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
  if (player && player.alive) { const e = camera.rotation.y; mctx.strokeStyle = "#fff"; mctx.beginPath(); mctx.moveTo(player.x * s, player.z * s); mctx.lineTo((player.x + Math.sin(e) * 2) * s, (player.z + Math.cos(e) * 2) * s); mctx.stroke(); }
}

// ---------------- input ----------------
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  keys[k] = true;
  if (gstate !== "play") return;
  if (k === "1") switchWeapon("pistol"); if (k === "2") switchWeapon("rifle"); if (k === "3") switchWeapon("sniper");
  if (k === "r") reload(player); if (k === "e") interact(); if (k === "g") throwGrenade();
  if (k === " " && onGround) { velY = 5.0; onGround = false; }
});
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
function interact() { if (!player.alive || bomb.planted) return; for (const s of bombSites) if (Math.hypot(s.x - player.x, s.z - player.z) < .9) { plantBomb(player, s); return; } }
cv.addEventListener("click", () => { actx(); if (gstate === "play" && !controls.isLocked) controls.lock(); });
cv.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("mousedown", e => {
  if (gstate !== "play" || !controls.isLocked) return;
  if (e.button === 2) { ads = true; return; }
  keys._m = true; if (!WEAPONS[player.weapon].auto) playerFire();
});
document.addEventListener("mouseup", e => { if (e.button === 2) ads = false; else keys._m = false; });
$("restart").onclick = () => { document.exitPointerLock && document.exitPointerLock(); newMatch(); };

// ---------------- colisión jugador ----------------
function playerCollide(px, pz) {
  const r = .3;
  for (const b of wallAABBs) {
    if (b.low) continue;
    if (px + r > b.x0 && px - r < b.x1 && pz + r > b.z0 && pz - r < b.z1) {
      const oxp = Math.min(b.x1 - (px - r), (px + r) - b.x0), ozp = Math.min(b.z1 - (pz - r), (pz + r) - b.z0);
      if (oxp < ozp) px += (px < (b.x0 + b.x1) / 2 ? -oxp : oxp); else pz += (pz < (b.z0 + b.z1) / 2 ? -ozp : ozp);
    }
  }
  if (worldSolid(px, pz) === 1) return null;
  return { x: px, z: pz };
}
function isMoving() { return keys.w || keys.a || keys.s || keys.d || keys.arrowup || keys.arrowdown; }

// ---------------- bucle ----------------
function loop(t) {
  raf = requestAnimationFrame(loop);
  let dt = (t - lastTime) / 1000; if (dt > .05) dt = .05; lastTime = t;
  if (gstate === "play") {
    updatePlayer(dt);
    agents.forEach(a => botStep(a, dt));
    grenades.forEach(g => stepGrenade(g, dt)); grenades = grenades.filter(g => !g._dead);
    tickBomb(dt);
    if (msgT > 0) msgT -= dt;
    if (bomb && bomb.planted && bomb.site._ring) bomb.site._ring.material.opacity = .4 + Math.sin(t / 120) * .3;
  }
  // MIRA (scope) — exclusiva del sniper
  const scoping = ads && player && player.weapon === "sniper";
  adsT += ((scoping ? 1 : 0) - adsT) * Math.min(1, dt * 14);
  camera.fov = cfg.fov - (cfg.fov - ADS_FOV) * adsT;
  camera.updateProjectionMatrix();
  adsVig.classList.toggle("on", adsT > .5);
  // retroceso: aplica el patrón (deltas) y recupera SOLO tras dejar de disparar (el spray se mantiene)
  const dP = recoil.pitch - recoil.ap, dY = recoil.yaw - recoil.ay;
  camera.rotation.x += dP; camera.rotation.y += dY; recoil.ap = recoil.pitch; recoil.ay = recoil.yaw;
  if (player && performance.now() - (player.lastShot || 0) > 180) {
    recoil.pitch *= Math.pow(.02, dt); recoil.yaw *= Math.pow(.02, dt);
    if (Math.abs(recoil.pitch) < 0.0006 && Math.abs(recoil.yaw) < 0.0006) { recoil.pitch = recoil.yaw = 0; player.sprayIdx = 0; }
  }
  // efectos
  fx.forEach(p => { if (p.m) { p.vy -= 8 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; } p.life -= dt; });
  fx = fx.filter(p => { if (p.life <= 0) { if (p.m) scene.remove(p.m); if (p.light) scene.remove(p.light); return false; } if (p.light) p.light.intensity = 8 * (p.life / .25); return true; });
  tracers.forEach(tr => { tr.life -= dt; tr.line.material.opacity = Math.max(0, tr.life / .06) * .8; });
  tracers = tracers.filter(tr => { if (tr.life <= 0) { scene.remove(tr.line); tr.line.geometry.dispose(); return false; } return true; });
  // viewmodel
  if (vm) {
    vmRecoil *= .8; const adsX = vmBaseX * (1 - adsT) + 0 * adsT, adsY = -.2 + .03 * adsT, adsZ = -.45 - .12 * adsT;
    vm.position.x = adsX; vm.position.z = adsZ + vmRecoil * .1; vm.rotation.x = vmRecoil * .25;
    if (vmReloadT > 0) { vmReloadT -= dt * 1000; vm.position.y = adsY - .25 * Math.sin(Math.min(1, (WEAPONS[player.weapon].reload - vmReloadT) / WEAPONS[player.weapon].reload) * Math.PI); }
    else vm.position.y = adsY + Math.sin(player ? player.walk || 0 : 0) * .004;
    if (vmFlash.material.opacity > 0) vmFlash.material.opacity -= dt * 8;
  }
  updateCrosshair();
  renderer.render(scene, camera); drawMini();
  if (msgT > 0) { bannerEl.textContent = msg; bannerEl.style.opacity = 1; } else bannerEl.style.opacity = 0;
}
function updateCrosshair() {
  // refleja la imprecisión real: parado se cierra, en movimiento/aire/disparo se abre
  let spread = 3;
  if (gstate === "play" && player && player.alive) {
    const w = WEAPONS[player.weapon];
    spread += currentInacc(w) * 900;            // imprecisión → píxeles
    if (fireFlash > 0) spread += 6;
  }
  crosshairEl.style.setProperty("--spread", Math.max(1.5, Math.min(40, spread)) + "px");
  crosshairEl.style.setProperty("--cc", cfg.cc);
  crosshairEl.style.opacity = adsT > .7 ? 0 : 1;
  if (fireFlash > 0) fireFlash -= 0.016;
}
let bannerEl;
function updatePlayer(dt) {
  if (!player.alive) return;
  const w = WEAPONS[player.weapon], obj = controls.getObject();
  player.dir = camera.rotation.y;
  if (player.tagT > 0) player.tagT -= dt;
  // wishdir (dirección deseada en mundo, relativa a la cámara)
  let fx = 0, fz = 0;
  if (keys.w || keys.arrowup) fz -= 1; if (keys.s || keys.arrowdown) fz += 1; if (keys.a) fx -= 1; if (keys.d) fx += 1;
  const yaw = obj.rotation.y; const ml = Math.hypot(fx, fz);
  let wx = 0, wz = 0; if (ml > 0) { fx /= ml; fz /= ml; wx = fx * Math.cos(yaw) - fz * Math.sin(yaw); wz = fx * Math.sin(yaw) + fz * Math.cos(yaw); }
  // velocidad máxima (constante, sin mush) modulada por arma / andar / tag / mira
  let maxS = 4.9 * w.moveSpd;
  const walking = keys.shift;
  if (walking) maxS *= 0.52;
  if (player.tagT > 0) maxS *= 0.55;
  if (ads && w.scope) maxS *= 0.45;
  // counter-strafe: paso hacia la velocidad objetivo con aceleración alta, fricción aún mayor
  const tx = wx * maxS, tz = wz * maxS;
  const ax = tx - (player.vx || 0), az = tz - (player.vz || 0); const am = Math.hypot(ax, az);
  const onG = onGround; const ACCEL = onG ? 75 : 16, FRIC = onG ? 90 : 2;
  const rate = (ml > 0 ? ACCEL : FRIC) * dt;
  if (am > 0) { const k = Math.min(1, rate / am); player.vx = (player.vx || 0) + ax * k; player.vz = (player.vz || 0) + az * k; }
  // mover con colisión por ejes
  const nx = obj.position.x + player.vx * dt, nz = obj.position.z + player.vz * dt;
  const rx = playerCollide(nx, obj.position.z); if (rx) obj.position.x = rx.x; else player.vx = 0;
  const rz = playerCollide(obj.position.x, nz); if (rz) obj.position.z = rz.z; else player.vz = 0;
  const spd = Math.hypot(player.vx, player.vz); player.walk += spd * dt * 2.2;
  // pasos: solo corriendo (andar con shift es silencioso, como en CS)
  if (onG && spd > 1.6 && !walking) { stepTimer -= dt; if (stepTimer <= 0) { sndStep(); stepTimer = 0.34 / Math.max(.7, spd / 4.9); } }
  // salto / gravedad
  velY -= 16 * dt; obj.position.y += velY * dt;
  if (obj.position.y <= 1.6) { obj.position.y = 1.6; velY = 0; onGround = true; }
  player.x = obj.position.x; player.z = obj.position.z;
  if (keys._m && w.auto) playerFire();
  controls.pointerSpeed = cfg.sens * (ads && w.scope ? 0.5 : 1);
}

// ---------------- settings ----------------
NovaSettings.mount({
  gameId: "fps", extra: [{
    title: "Juego", rows: [
      { type: "select", key: "diff", label: "Dificultad IA", default: "normal", options: [{ value: "facil", label: "Fácil" }, { value: "normal", label: "Normal" }, { value: "dificil", label: "Difícil" }] },
      { type: "range", key: "sens", label: "Sensibilidad ratón", default: 1, min: .3, max: 2.5, step: .1, fmt: v => (+v).toFixed(1) + "×" },
      { type: "range", key: "fov", label: "Campo de visión", default: 75, min: 60, max: 100, step: 1, fmt: v => Math.round(v) + "°" },
      { type: "select", key: "cc", label: "Color de mira", default: "#ffffff", options: [{ value: "#ffffff", label: "Blanco" }, { value: "#3bff9e", label: "Verde" }, { value: "#ff3b6e", label: "Rojo" }, { value: "#ffd23b", label: "Ámbar" }] },
      { type: "keys", label: "Mover · Andar (sigiloso)", value: "WASD · Shift" },
      { type: "keys", label: "Disparar · Saltar", value: "Clic · Espacio" },
      { type: "keys", label: "Armas (Pist/Rifle/Sniper)", value: "1 · 2 · 3" },
      { type: "keys", label: "Mira sniper · Recargar", value: "Clic-der · R" },
      { type: "keys", label: "Granada · C4", value: "G · E" },
      { type: "info", label: "Precisión", value: "Párate para disparar fino" },
      { type: "info", label: "Spray", value: "Tira ↓ contra el patrón" },
    ]
  }],
  onChange: (k, v) => { cfg[k] = (k === "diff" || k === "cc") ? v : parseFloat(v); applyCfg(); }
});
const saved = NovaSettings.loadCfg("fps");
Object.assign(cfg, { sens: +saved.sens || 1, diff: saved.diff || "normal", fov: +saved.fov || 75, cc: saved.cc || "#ffffff", run: saved.run !== undefined ? saved.run : true });
function applyCfg() { if (controls) controls.pointerSpeed = cfg.sens; if (camera) { camera.fov = cfg.fov; camera.updateProjectionMatrix(); } crosshairEl.style.setProperty("--cc", cfg.cc); }

// ---------------- arranque ----------------
initScene(); applyCfg();
bannerEl = document.createElement("div");
bannerEl.style.cssText = "position:absolute;left:50%;top:42%;transform:translateX(-50%);z-index:6;font-family:'Bungee',sans-serif;font-size:26px;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;opacity:0;transition:opacity .2s";
document.querySelector(".fps-stage").appendChild(bannerEl);
ovBtn.onclick = () => { actx(); newMatch(); };
lastTime = performance.now(); loop(lastTime);
