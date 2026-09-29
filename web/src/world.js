// ============================================================
// Boo Who? · 3D world (horror version)
// Environment, monsters built from CC0 Quaternius models, 3D weapons.
// Globals from the build: THREE, GLTFLoader, MeshoptDecoder, SkeletonUtils, MODEL_DATA
// ============================================================

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
const WORLD_SCALE = 1.5;                     // characters are drawn 1.5x life size, as in version 1

// ---------- models (inlined as base64 by web/build.py) ----------
let MODELS = {};
async function loadModels(onProgress) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(MODEL_DATA); let done = 0;
  await Promise.all(names.map(async (name) => {
    const bin = atob(MODEL_DATA[name]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const gltf = await loader.parseAsync(bytes.buffer, '');
    MODELS[name] = gltf.scene; done++; if (onProgress) onProgress(done / names.length);
  }));
  return MODELS;
}

// ---------- shared textures ----------
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function skyTexture(top, mid, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); g.addColorStop(0.6, mid); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function noiseTexture(size = 256, scale = 6, alpha = true) {        // soft fractal noise, tiles seamlessly
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size);
  const grid = (n) => { const g = []; for (let i = 0; i < n * n; i++) g.push(Math.random()); return g; };
  const octaves = [scale, scale * 2, scale * 4].map((n) => ({ n, g: grid(n) }));
  const sample = ({ n, g }, u, v) => {
    const fx = u * n, fy = v * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size;
    const n = sample(octaves[0], u, v) * 0.55 + sample(octaves[1], u, v) * 0.3 + sample(octaves[2], u, v) * 0.15;
    const k = (j * size + i) * 4, a = Math.max(0, Math.min(1, (n - 0.35) * 1.9));
    img.data[k] = img.data[k + 1] = img.data[k + 2] = alpha ? 255 : Math.round(n * 255);
    img.data[k + 3] = alpha ? Math.round(a * 255) : 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const GLOW = glowTexture();

// ---------- the winding path from the gate (u=0) into the forest (u=1) ----------
const PATH = new THREE.CatmullRomCurve3([
  [0, -1], [1.5, -9], [-2.5, -18], [2.5, -29], [-2, -41], [3.5, -53], [-1, -66], [2, -80], [0, -96],
].map(([x, z]) => new THREE.Vector3(x, 0, z)));
const PATH_SAMPLES = PATH.getSpacedPoints(300);
function pathDistance(x, z) {
  let best = Infinity;
  for (const p of PATH_SAMPLES) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

// landmarks along the path
const RIVER_Z = (x) => -40.5 + 2.6 * Math.sin(x * 0.045 + 0.6);
const SWAMP = { x: 15, z: -58, r: 12 };
const CRYPT = { x: -12, z: -71 };
const CHAPEL = { x: -16, z: -24 };
let BRIDGE_U = 0.42;                                                  // found exactly in buildWorld
function riverDepth(x, z) { const dz = z - RIVER_Z(x); return 1.5 * Math.exp(-(dz * dz) / (2 * 2.3 * 2.3)); }
function groundHeight(x, z, d = pathDistance(x, z)) {
  const hills = 1.3 * Math.sin(x * 0.08) * Math.cos(z * 0.06) + 0.7 * Math.sin(x * 0.21 + z * 0.13) + 0.35 * Math.sin(z * 0.37);
  let h = hills * smooth(4, 16, d) * (1 - smooth(-2, 6, z)) - 0.02;
  const sw = Math.exp(-((x - SWAMP.x) ** 2 + (z - SWAMP.z) ** 2) / (2 * SWAMP.r * SWAMP.r));
  h = h * (1 - sw) - 0.12 * sw;
  return h - riverDepth(x, z);
}
// how high the path is lifted where it crosses the stone bridge (u = path position)
function pathLift(u) { const du = Math.abs(u - BRIDGE_U) / 0.052; return du >= 1 ? 0 : 0.55 * Math.cos(du * Math.PI / 2) ** 0.6; }

function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o }); }
function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; return m; }

// darken and desaturate every material of a model (for the gloomy look)
function gloom(obj, amount = 0.35, desat = 0.5, tint = new THREE.Color('#8894b0')) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone(); if (c.color) {
        const l = c.color.r * 0.3 + c.color.g * 0.59 + c.color.b * 0.11;
        c.color.lerp(new THREE.Color(l, l, l), desat).multiply(tint).multiplyScalar(amount);
      }
      c.roughness = 1; c.metalness = 0; return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = o.receiveShadow = true;
  });
  return obj;
}
// turn every mesh of a model into instanced copies (for trees and rocks)
function instanced(scene, model, placements, opts = {}) {
  model.updateMatrixWorld(true);
  const parts = []; model.traverse((o) => { if (o.isMesh) parts.push(o); });
  const m4 = new THREE.Matrix4(), dummy = new THREE.Object3D();
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      m4.multiplyMatrices(dummy.matrix, part.matrixWorld); im.setMatrixAt(i, m4);
    });
    im.castShadow = opts.shadow !== false; im.receiveShadow = true; scene.add(im);
  }
}

// ============================================================
// World
// ============================================================
function buildWorld(scene) {
  const world = { lanterns: [], sky: {}, moodName: 'normal' };
  const dummy = new THREE.Object3D();

  // find where the path crosses the river, so the bridge sits exactly there
  let bestErr = Infinity;
  for (let u = 0.3; u < 0.55; u += 0.001) { const p = PATH.getPointAt(u), e = Math.abs(p.z - RIVER_Z(p.x)); if (e < bestErr) { bestErr = e; BRIDGE_U = u; } }

  // ---------- sky, fog, stars, moon ----------
  world.sky.normal = skyTexture('#03040a', '#0b1020', '#1b2232');
  world.sky.fog = skyTexture('#0a0c10', '#1b1f28', '#2a303b');
  world.sky.blood = skyTexture('#050103', '#1a080c', '#2e1418');
  world.sky.halloween = skyTexture('#040208', '#140c20', '#24182f');
  scene.background = world.sky.normal;
  scene.fog = new THREE.FogExp2('#1b2232', 0.027);

  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 700; i++) {
    const th = Math.random() * TAU, ph = Math.acos(rand(0.15, 1)), r = 380;
    sp.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.1, map: GLOW, color: '#8f98b0', transparent: true, opacity: 0.6, depthWrite: false, fog: false })));

  world.moon = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16), new THREE.MeshBasicMaterial({ color: '#d9dde6', fog: false }));
  world.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#9fb0d0', transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
  world.moonHalo.scale.set(70, 70, 1);
  scene.add(world.moon, world.moonHalo);
  world.setMoonSide = (side) => {                                  // the moon hangs over whatever the camera looks at
    world.moon.position.set(-45, 62, side * 200); world.moonHalo.position.copy(world.moon.position);
  };
  world.setMoonSide(-1);

  // ---------- lights: dim cold moonlight, almost nothing else ----------
  world.hemi = new THREE.HemisphereLight('#7c8db4', '#1c1f1c', 1.7); scene.add(world.hemi);
  const moonLight = new THREE.DirectionalLight('#b3c6e8', 2.3);
  moonLight.position.set(-30, 45, -35); moonLight.target.position.set(0, 0, -15);
  moonLight.castShadow = true; moonLight.shadow.mapSize.set(1024, 1024);
  Object.assign(moonLight.shadow.camera, { left: -26, right: 26, top: 34, bottom: -34, near: 5, far: 130 });
  scene.add(moonLight, moonLight.target); world.moonLight = moonLight;

  // ---------- ground ----------
  const gGeo = new THREE.PlaneGeometry(190, 240, 140, 176);
  gGeo.rotateX(-Math.PI / 2); gGeo.translate(0, 0, -60);
  const gp = gGeo.attributes.position, gc = [];
  const earth = new THREE.Color('#2a2e27'), moss = new THREE.Color('#27331f'), mud = new THREE.Color('#1f1b16'), bank = new THREE.Color('#121310'), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), d = pathDistance(x, z), h = groundHeight(x, z, d);
    gp.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.3 + Math.sin(z * 0.2) * 2) * Math.cos(z * 0.25);
    tmp.copy(earth).lerp(moss, n * 0.8).lerp(mud, Math.random() * 0.35);
    if (h < -0.3) tmp.lerp(bank, smooth(-0.3, -1, h));
    gc.push(tmp.r, tmp.g, tmp.b);
  }
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true; scene.add(ground);

  // ---------- the mud path (rises over the bridge) ----------
  const N = 280, pv = [], pc = [], idx = [];
  const dirt = new THREE.Color('#4a4032'), dirt2 = new THREE.Color('#342c22');
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = PATH.getPointAt(u), t = PATH.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize(), w = 1.35 + 0.25 * Math.sin(u * 40), y = 0.03 + pathLift(u) + (pathLift(u) > 0 ? 0.05 : 0);
    for (const s of [-1, 1]) { pv.push(p.x + side.x * w * s, y, p.z + side.z * w * s); tmp.copy(dirt).lerp(dirt2, Math.random() * 0.7); pc.push(tmp.r, tmp.g, tmp.b); }
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3)); pathGeo.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
  pathGeo.setIndex(idx); pathGeo.computeVertexNormals();
  const pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  pathMesh.receiveShadow = true; scene.add(pathMesh);

  // path-side stones
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.25, 0), mat('#2c2d31'), 160);
  for (let i = 0; i < 160; i++) {
    const u = Math.random(); if (Math.abs(u - BRIDGE_U) < 0.06) { dummy.scale.setScalar(0); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix); continue; }
    const p = PATH.getPointAt(u), t = PATH.getTangentAt(u), s = Math.random() < 0.5 ? -1 : 1;
    dummy.position.set(p.x - t.z * 1.7 * s, 0.06, p.z + t.x * 1.7 * s); dummy.rotation.set(rand(0, 3), rand(0, 3), 0); dummy.scale.setScalar(rand(0.5, 1.4)); dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.castShadow = stones.receiveShadow = true; scene.add(stones);

  // ---------- spots for trees, avoiding the path, the landmarks and the title stage ----------
  const keepClear = [[CHAPEL.x, CHAPEL.z, 11], [CRYPT.x, CRYPT.z, 8], [SWAMP.x, SWAMP.z, 10]];
  function freeSpot(minPath, zMin = -130, zMax = -3, xr = 80) {
    for (let k = 0; k < 50; k++) {
      const x = rand(-xr, xr), z = rand(zMin, zMax), d = pathDistance(x, z);
      if (d < minPath || (Math.abs(x) < 11 && z > -16) || riverDepth(x, z) > 0.4) continue;
      if (keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r)) continue;
      return { x, z, d };
    }
    return null;
  }

  // ---------- dead forest (CC0 Quaternius dead trees) ----------
  const treeKinds = ['CommonTree_Dead_1', 'CommonTree_Dead_3', 'BirchTree_Dead_2', 'Willow_Dead_1'];
  treeKinds.forEach((kind, k) => {
    const model = gloom(MODELS[kind].clone(), 0.55, 0.7, new THREE.Color('#7a7f8c'));
    const pl = [];
    for (let i = 0; i < 70; i++) {
      const s = freeSpot(k === 3 ? 6 : 7); if (!s) continue;
      pl.push({ x: s.x, y: groundHeight(s.x, s.z, s.d) - 0.1, z: s.z, s: rand(3.2, 5.2), ry: rand(0, TAU), rx: rand(-0.08, 0.08), rz: rand(-0.08, 0.08) });
    }
    instanced(scene, model, pl);
  });
  // dark conifers far back, for a dense black tree line
  const pineN = 160, pineMat = mat('#0b120d'), pineGeo = new THREE.ConeGeometry(1.6, 7, 6);
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, pineN);
  for (let i = 0; i < pineN; i++) {
    const s = freeSpot(18, -140, -20, 90); if (!s) continue;
    dummy.position.set(s.x, groundHeight(s.x, s.z, s.d) + 3.2, s.z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(rand(0.9, 1.6), rand(1, 2), rand(0.9, 1.6)); dummy.updateMatrix();
    pines.setMatrixAt(i, dummy.matrix);
  }
  scene.add(pines);
  // dead shrubs and thorns
  const shrub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), mat('#171b14'), 110);
  for (let i = 0; i < 110; i++) {
    const s = freeSpot(2.3, -110, -2, 40); if (!s) continue;
    dummy.position.set(s.x, groundHeight(s.x, s.z, s.d) + 0.2, s.z); dummy.scale.set(rand(0.6, 1.5), rand(0.4, 0.8), rand(0.6, 1.3)); dummy.rotation.set(0, rand(0, TAU), 0); dummy.updateMatrix();
    shrub.setMatrixAt(i, dummy.matrix);
  }
  shrub.castShadow = true; scene.add(shrub);
  const rocks = [];
  for (let i = 0; i < 40; i++) { const s = freeSpot(3, -120, -4, 50); if (s) rocks.push({ x: s.x, y: groundHeight(s.x, s.z, s.d), z: s.z, s: rand(3, 7), ry: rand(0, TAU) }); }
  instanced(scene, gloom(MODELS.Rock_Moss_2.clone(), 0.5, 0.6), rocks);

  // ---------- the cemetery (where zombies come from) ----------
  const stoneMat = mat('#4a4c52'), stoneDark = mat('#2f3136'), ironMat = mat('#16161a', { metalness: 0.6, roughness: 0.6, flatShading: false });
  const headstone = new THREE.BufferGeometry().copy(new THREE.BoxGeometry(0.7, 1, 0.16)).translate(0, 0.5, 0);
  const roundTop = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1, 0);
  const crossV = new THREE.BoxGeometry(0.14, 1.4, 0.14).translate(0, 0.7, 0), crossH = new THREE.BoxGeometry(0.7, 0.14, 0.14).translate(0, 1.05, 0);
  const graves = [];
  function graveSpot(cx, cz, w, d) {
    for (let k = 0; k < 30; k++) { const x = cx + rand(-w, w), z = cz + rand(-d, d); if (pathDistance(x, z) > 3.2) return { x, z }; }
    return null;
  }
  for (let i = 0; i < 46; i++) { const g = graveSpot(-12, -21, 8, 9) || graveSpot(9, -20, 4, 6); if (g) graves.push(g); }
  for (let i = 0; i < 12; i++) { const g = graveSpot(9, -21, 4, 6); if (g) graves.push(g); }
  const hsA = new THREE.InstancedMesh(headstone, stoneMat, graves.length), hsB = new THREE.InstancedMesh(roundTop, stoneMat, graves.length);
  const crA = new THREE.InstancedMesh(crossV, stoneDark, graves.length), crB = new THREE.InstancedMesh(crossH, stoneDark, graves.length);
  graves.forEach((g, i) => {
    const y = groundHeight(g.x, g.z) - 0.05, cross = i % 4 === 0, s = rand(0.8, 1.3);
    dummy.position.set(g.x, y, g.z); dummy.rotation.set(rand(-0.22, 0.22), rand(-0.4, 0.4) + (g.x < 0 ? 1.2 : -1.2) * 0, rand(-0.2, 0.2)); dummy.scale.setScalar(cross ? 0 : s); dummy.updateMatrix();
    hsA.setMatrixAt(i, dummy.matrix); hsB.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(cross ? s : 0); dummy.updateMatrix(); crA.setMatrixAt(i, dummy.matrix); crB.setMatrixAt(i, dummy.matrix);
  });
  [hsA, hsB, crA, crB].forEach((m) => { m.castShadow = m.receiveShadow = true; scene.add(m); });
  // open graves with dirt mounds
  for (let i = 0; i < 5; i++) {
    const g = graveSpot(-10, -18, 6, 6); if (!g) continue; const y = groundHeight(g.x, g.z), ry = rand(-0.3, 0.3);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.9), new THREE.MeshBasicMaterial({ color: '#000000' })); hole.position.set(g.x, y + 0.02, g.z); hole.rotation.y = ry; scene.add(hole);
    const mound = mesh(new THREE.SphereGeometry(0.8, 8, 6), mat('#1b1611'), g.x + 1.1 * Math.cos(ry), y, g.z - 1.1 * Math.sin(ry)); mound.scale.set(0.8, 0.35, 1.3); mound.rotation.y = ry; scene.add(mound);
  }
  // rusted iron fence along the cemetery edge
  const bars = [], fenceLine = (x0, z0, x1, z1) => { const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 0.35); for (let i = 0; i <= n; i++) if (Math.random() > 0.12) bars.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, rand(-0.18, 0.18)]); };
  fenceLine(-4.5, -12, -4.5, -29.5); fenceLine(-4.5, -12, -21, -12); fenceLine(-21, -12, -21, -31);
  const barMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5).translate(0, 0.85, 0), ironMat, bars.length);
  const spikeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.18, 4).translate(0, 1.78, 0), ironMat, bars.length);
  bars.forEach(([x, z, tilt], i) => { dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(tilt, 0, tilt * 0.7); dummy.scale.setScalar(1); dummy.updateMatrix(); barMesh.setMatrixAt(i, dummy.matrix); spikeMesh.setMatrixAt(i, dummy.matrix); });
  scene.add(barMesh, spikeMesh);

  // ---------- the ruined chapel in the cemetery ----------
  const chapel = gloom(MODELS.Bell_Tower.clone(), 0.42, 0.6);
  chapel.scale.setScalar(2.6); chapel.position.set(CHAPEL.x, groundHeight(CHAPEL.x, CHAPEL.z) - 0.1, CHAPEL.z); chapel.rotation.set(0, 0.9, 0.035); scene.add(chapel);
  for (let i = 0; i < 9; i++) {                                    // broken walls with jagged tops
    const a = 0.9 + (i / 9) * Math.PI * 1.2, r = 6.2, h = rand(0.6, 3.2), wx = CHAPEL.x + Math.cos(a) * r, wz = CHAPEL.z + Math.sin(a) * r;
    const w = mesh(new THREE.BoxGeometry(1.8, h, 0.5), stoneDark, wx, groundHeight(wx, wz) + h / 2 - 0.1, wz); w.rotation.y = -a + Math.PI / 2; w.receiveShadow = true; scene.add(w);
  }

  // ---------- the dark river and the old stone bridge ----------
  const rv = [], ri = [];
  for (let i = 0; i <= 120; i++) { const x = -95 + i * 1.6, z = RIVER_Z(x); rv.push(x, -0.62, z - 3.2, x, -0.62, z + 3.2); if (i < 120) { const a = i * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const riverGeo = new THREE.BufferGeometry(); riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); riverGeo.setIndex(ri); riverGeo.computeVertexNormals();
  world.water = new THREE.Mesh(riverGeo, new THREE.MeshStandardMaterial({ color: '#04070a', roughness: 0.12, metalness: 0.85 }));
  world.water.receiveShadow = true; scene.add(world.water);
  {
    const bp = PATH.getPointAt(BRIDGE_U), bt = PATH.getTangentAt(BRIDGE_U), L = 11, half = L / 2, H = 0.58, base = -1.4;
    const shape = new THREE.Shape(); shape.moveTo(-half, base); shape.lineTo(-half, H); shape.lineTo(half, H); shape.lineTo(half, base);
    shape.lineTo(3.3, base); shape.absarc(0, base, 3.3, 0, Math.PI, false); shape.lineTo(-half, base);
    const bridgeGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false }); bridgeGeo.translate(0, 0, -1.7);
    const bridge = new THREE.Group(), bstone = mat('#3d3f45');
    const body = new THREE.Mesh(bridgeGeo, bstone); body.castShadow = body.receiveShadow = true; bridge.add(body);
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {                  // parapets, some stones missing
      if (Math.random() < 0.18) continue;
      const blk = mesh(new THREE.BoxGeometry(1.45, rand(0.45, 0.7), 0.3), mat('#34363b'), -half + 0.8 + k * 1.58, H + 0.3, s * 1.55); blk.rotation.z = rand(-0.05, 0.05); bridge.add(blk);
    }
    bridge.position.set(bp.x, 0, bp.z); bridge.rotation.y = Math.atan2(-bt.z, bt.x); scene.add(bridge);
  }

  // ---------- the swamp (where witches come from) ----------
  const swampWater = new THREE.MeshStandardMaterial({ color: '#061008', roughness: 0.2, metalness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const a = rand(0, TAU), r = rand(0, SWAMP.r * 0.7), x = SWAMP.x + Math.cos(a) * r, z = SWAMP.z + Math.sin(a) * r;
    if (pathDistance(x, z) < 3.5) continue;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(rand(1.8, 4), 14).rotateX(-Math.PI / 2), swampWater);
    pool.scale.set(rand(1, 1.8), 1, rand(0.7, 1.2)); pool.position.set(x, -0.08, z); pool.receiveShadow = true; scene.add(pool);
  }
  const reedN = 220, reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 1.4, 3).translate(0, 0.7, 0), mat('#1d2415'), reedN);
  for (let i = 0; i < reedN; i++) {
    const a = rand(0, TAU), r = rand(2, SWAMP.r), x = SWAMP.x + Math.cos(a) * r, z = SWAMP.z + Math.sin(a) * r;
    dummy.position.set(x, groundHeight(x, z), z); dummy.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)); dummy.scale.set(1, rand(0.6, 1.4), 1); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
  }
  scene.add(reeds);
  const willows = []; for (let i = 0; i < 6; i++) { const a = rand(0, TAU), r = rand(5, SWAMP.r), x = SWAMP.x + Math.cos(a) * r, z = SWAMP.z + Math.sin(a) * r; if (pathDistance(x, z) > 4) willows.push({ x, y: groundHeight(x, z) - 0.1, z, s: rand(3.5, 5), ry: rand(0, TAU) }); }
  instanced(scene, gloom(MODELS.Willow_Dead_1.clone(), 0.5, 0.5, new THREE.Color('#7f8a78')), willows);
  world.swampLight = new THREE.PointLight('#6f9a55', 5, 18, 1.6); world.swampLight.position.set(SWAMP.x, 1.2, SWAMP.z); scene.add(world.swampLight);

  // ---------- the crypt (where mummies come from) ----------
  {
    const c = new THREE.Group(), cs = mat('#3a3a3f'), cd = mat('#26262a'), y = groundHeight(CRYPT.x, CRYPT.z);
    c.add(mesh(new THREE.BoxGeometry(6, 0.5, 5.2), cd, 0, 0.25, 0));
    c.add(mesh(new THREE.BoxGeometry(5, 3.4, 4), cs, 0, 2.2, -0.2));
    const roof = mesh(new THREE.CylinderGeometry(0.01, 3.4, 1.6, 4, 1), cd, 0, 4.7, -0.2); roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.85); c.add(roof);
    for (const s of [-1, 1]) { c.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 8), cs, s * 1.9, 2.2, 2.1)); c.add(mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), cd, s * 1.9, 0.6, 2.1)); }
    c.add(mesh(new THREE.BoxGeometry(4.6, 0.45, 0.8), cd, 0, 4.1, 2.1));
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ color: '#050403' })); door.position.set(0, 1.7, 1.81); c.add(door);
    const glow = new THREE.PointLight('#b8813a', 3, 7, 2); glow.position.set(0, 1.4, 2.6); c.add(glow); world.cryptGlow = glow;
    const face = Math.atan2(PATH.getPointAt(0.75).x - CRYPT.x, PATH.getPointAt(0.75).z - CRYPT.z);
    c.position.set(CRYPT.x, y, CRYPT.z); c.rotation.y = face; scene.add(c);
  }

  // ---------- mountains on the horizon (both directions) ----------
  const mountain = gloom(MODELS.Mountain_Group_1.clone(), 0.28, 0.6, new THREE.Color('#9aa6c0'));
  mountain.traverse((o) => { if (o.isMesh) { o.material.fog = false; o.castShadow = false; } });
  [[-120, -260, 34, 0.3], [30, -280, 42, 2.2], [150, -240, 30, 4], [-60, 250, 36, 1], [110, 270, 40, 3]].forEach(([x, z, s, ry]) => {
    const m = mountain.clone(); m.position.set(x, -6, z); m.scale.setScalar(s); m.rotation.y = ry; scene.add(m);
  });

  // ---------- the abandoned village behind the gate ----------
  const houses = [['House_3', -9, 12, 0.5], ['House_4', 9, 10, -0.4], ['House_3', 17, 20, -0.9], ['House_4', -18, 22, 0.8], ['House_3', 2, 26, 0.1], ['House_4', -27, 12, 1.2], ['House_3', 26, 9, -1.3]];
  houses.forEach(([kind, x, z, ry], i) => {
    const h = gloom(MODELS[kind].clone(), 0.38, 0.6); h.scale.setScalar(2.4); h.position.set(x, 0, z); h.rotation.set(0, Math.PI + ry, i % 3 === 1 ? 0.03 : 0); scene.add(h);
    // boarded, broken windows: black holes on the front
    for (let k = 0; k < 2; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.65), new THREE.MeshBasicMaterial({ color: '#000000' }));
      win.position.set((k ? 0.9 : -0.9), 2.3, 0); win.visible = false; h.add(win);
    }
  });
  const village = new THREE.Group(); scene.add(village);
  // the one window still lit
  const litWin = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), new THREE.MeshBasicMaterial({ color: '#ffb35c' }));
  litWin.position.set(9.2, 2.2, 7.3); litWin.rotation.y = Math.PI * 0.87; scene.add(litWin);
  world.litWindow = new THREE.PointLight('#ff9a3c', 6, 12, 1.8); world.litWindow.position.set(9.4, 2.2, 7.9); scene.add(world.litWindow);
  world.litWinMesh = litWin;

  // ---------- the village gate ----------
  const stone = mat('#3d3c44'), wood = mat('#2e2118'), woodDark = mat('#1d1510');
  for (const s of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(1, 3.4, 1), stone, s * 2.6, 1.7, 0));
    scene.add(mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), stone, s * 2.6, 3.5, 0));
    const lamp = mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), mat('#6a3a12', { emissive: '#d9822a', emissiveIntensity: 0.8 }), s * 2.6, 3.9, 0);
    scene.add(lamp, mesh(new THREE.ConeGeometry(0.38, 0.35, 4), woodDark, s * 2.6, 4.34, 0));
    const light = new THREE.PointLight('#ff9a42', 7, 15, 1.7); light.position.set(s * 2.6, 3.9, 0.6); scene.add(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ff9a42', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(2.4, 2.4, 1); halo.position.set(s * 2.6, 3.9, 0); scene.add(halo);
    world.lanterns.push({ light, halo, lamp, base: 7 });
    const door = new THREE.Group(); door.position.set(s * 2.1, 0, 0.1);
    for (let k = 0; k < 4; k++) { const plank = mesh(new THREE.BoxGeometry(0.42, rand(2.1, 2.45), 0.12), k % 2 ? wood : woodDark, -s * (0.25 + k * 0.44), 1.2, 0); plank.rotation.z = rand(-0.03, 0.03); door.add(plank); }
    door.add(mesh(new THREE.BoxGeometry(1.8, 0.14, 0.16), woodDark, -s * 0.9, 1.9, 0.02), mesh(new THREE.BoxGeometry(1.8, 0.14, 0.16), woodDark, -s * 0.9, 0.55, 0.02));
    door.rotation.y = s * 1.25; scene.add(door);
    for (let k = 0; k < 28; k++) {
      const x = s * (3.35 + k * 0.62), h = rand(1.8, 2.5), tilt = rand(-0.06, 0.06);
      if (k > 3 && Math.random() < 0.07) continue;                  // a few stakes missing
      const stake = mesh(new THREE.CylinderGeometry(0.24, 0.27, h, 6), k % 3 ? wood : woodDark, x, h / 2, rand(0.1, 0.4)); stake.rotation.z = tilt; scene.add(stake);
      const tip = mesh(new THREE.ConeGeometry(0.24, 0.5, 6), woodDark, x + tilt * -h * 0.5, h + 0.22, stake.position.z); tip.rotation.z = tilt; scene.add(tip);
    }
  }
  scene.add(mesh(new THREE.TorusGeometry(2.6, 0.18, 6, 18, Math.PI), wood, 0, 3.55, 0));
  // two old jack-o'-lanterns, candles almost out
  const pumpkinMat = mat('#5a2c10'), faceMat = new THREE.MeshBasicMaterial({ color: '#d98a2a' });
  world.pumpkins = [];
  [[-3.6, -1.2], [4.1, -0.9]].forEach(([x, z], i) => {
    const g = new THREE.Group(), sc = [0.9, 0.7][i];
    const body = mesh(new THREE.SphereGeometry(0.5, 10, 8), pumpkinMat); body.scale.set(1, 0.72, 1); g.add(body);
    for (const ex of [-0.17, 0.17]) { const eye = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 3), faceMat); eye.position.set(ex, 0.08, -0.47); eye.rotation.x = -Math.PI / 2; g.add(eye); }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.05), faceMat); mouth.position.set(0, -0.12, -0.47); g.add(mouth);
    const pl = new THREE.PointLight('#ff8a2a', 1.4, 3.5, 2); pl.position.set(0, 0.2, -0.7); g.add(pl); world.pumpkins.push({ pl, faceMat });
    g.position.set(x, 0.35 * sc, z); g.scale.setScalar(sc); g.rotation.y = rand(-0.4, 0.4); scene.add(g);
  });

  // ---------- low ground fog: three drifting noise layers ----------
  const fogTex = noiseTexture(256, 5, true);
  world.fogLayers = [0.35, 0.8, 1.35].map((y, i) => {
    const tex = fogTex.clone(); tex.needsUpdate = true; tex.repeat.set(5 + i, 6 + i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(190, 240).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: '#4e5668', transparent: true, opacity: [0.13, 0.09, 0.06][i], depthWrite: false }));
    m.position.set(0, y, -60); m.renderOrder = 2; scene.add(m); return { m, tex, speed: [0.004, -0.006, 0.003][i] };
  });

  // ---------- slowly drifting ash in the air ----------
  const AS = 260, aGeo = new THREE.BufferGeometry(), aPos = new Float32Array(AS * 3), aBase = [];
  for (let i = 0; i < AS; i++) { const u = rand(0, 0.9), p = PATH.getPointAt(u); aBase.push({ x: p.x + rand(-12, 12), y: rand(0.3, 6), z: p.z + rand(-8, 8), ph: rand(0, TAU), sp: rand(0.1, 0.35) }); }
  aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  scene.add(new THREE.Points(aGeo, new THREE.PointsMaterial({ size: 0.09, color: '#9aa0aa', transparent: true, opacity: 0.55, depthWrite: false })));

  // cold moonlight on the title stage, and a light that catches a monster when it is revealed
  world.stageLight = new THREE.SpotLight('#b7c6e6', 0, 32, 0.78, 0.7, 1.2);
  world.stageLight.position.set(0, 7, -19); world.stageLight.target.position.set(0, 1.4, -10); scene.add(world.stageLight, world.stageLight.target);
  world.revealLight = new THREE.PointLight('#ffcf9a', 0, 11, 1.4); scene.add(world.revealLight);

  world.update = (t, dt) => {
    for (let i = 0; i < AS; i++) {
      const b = aBase[i];
      aPos[i * 3] = b.x + Math.sin(t * b.sp + b.ph) * 1.5;
      aPos[i * 3 + 1] = ((b.y - t * b.sp * 0.4) % 6 + 6) % 6 + 0.2;
      aPos[i * 3 + 2] = b.z + Math.cos(t * b.sp * 0.7 + b.ph) * 1.5;
    }
    aGeo.attributes.position.needsUpdate = true;
    world.fogLayers.forEach((f, i) => { f.tex.offset.x = t * f.speed; f.tex.offset.y = t * f.speed * 0.6 + i * 0.3; });
    // lanterns and candles gutter and flicker; every so often one nearly dies
    world.lanterns.forEach((l, i) => {
      const dip = Math.sin(t * 0.7 + i * 3) > 0.96 ? 0.35 : 1;
      const f = (0.72 + 0.14 * Math.sin(t * 11 + i * 2) + 0.1 * Math.sin(t * 29 + i * 5) + 0.06 * Math.random()) * dip;
      l.light.intensity = l.base * f; l.halo.material.opacity = 0.42 * f; l.lamp.material.emissiveIntensity = 0.8 * f;
    });
    world.pumpkins.forEach((p, i) => { p.pl.intensity = 1.2 + 0.5 * Math.sin(t * 13 + i) + 0.3 * Math.random(); });
    world.litWindow.intensity = 5.5 + 0.8 * Math.sin(t * 7) + (Math.random() < 0.01 ? -4 : 0);
    world.swampLight.intensity = 4 + 1.5 * Math.sin(t * 0.9);
  };

  world.setMood = (mood) => {
    world.moodName = mood;
    scene.background = world.sky[mood] || world.sky.normal;
    const fog = { normal: ['#1f2738', 0.011], fog: ['#2c3240', 0.02], blood: ['#2c1519', 0.014], halloween: ['#231a2e', 0.014] }[mood] || ['#1f2738', 0.011];
    scene.fog.color.set(fog[0]); scene.fog.density = fog[1];
    const moonC = mood === 'blood' ? '#c8402e' : mood === 'halloween' ? '#d49a52' : '#d9dde6';
    world.moon.material.color.set(moonC); world.moonHalo.material.color.set(mood === 'blood' ? '#8a2a20' : mood === 'halloween' ? '#8a5a2a' : '#9fb0d0');
    world.moonLight.color.set(mood === 'blood' ? '#c07a70' : '#a9bde0');
    world.fogLayers.forEach((f, i) => { f.m.material.opacity = (mood === 'fog' ? [0.26, 0.2, 0.15] : [0.13, 0.09, 0.06])[i]; f.m.material.color.set(mood === 'blood' ? '#5a4447' : '#4e5668'); });
  };
  return world;
}

// ============================================================
// Materials for the monsters
// ============================================================
const NOISE_GLSL = `
  float nwHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float nwNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(nwHash(i), nwHash(i + vec3(1,0,0)), f.x), mix(nwHash(i + vec3(0,1,0)), nwHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(nwHash(i + vec3(0,0,1)), nwHash(i + vec3(1,0,1)), f.x), mix(nwHash(i + vec3(0,1,1)), nwHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float nwFbm(vec3 p) { return nwNoise(p) * 0.55 + nwNoise(p * 2.1) * 0.3 + nwNoise(p * 4.3) * 0.15; }`;

// grime, rot and blood stains painted over a material, in the model's own space
function stained(m, { grime = 0.6, blood = 0, rot = 0, seed = 0 } = {}) {
  m.userData.patternScale = m.userData.patternScale || { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = { value: grime }; sh.uniforms.uBlood = { value: blood }; sh.uniforms.uRot = { value: rot }; sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uScale = m.userData.patternScale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStainPos;')
      .replace('#include <common>\nvarying vec3 vStainPos;', '#include <common>\nvarying vec3 vStainPos;\nuniform float uScale;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvStainPos = transformed * uScale;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vStainPos;\nuniform float uGrime, uBlood, uRot, uSeed;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sp = vStainPos * 7.0 + uSeed;
        float g = nwFbm(sp);
        diffuseColor.rgb *= mix(1.0, 0.35, smoothstep(0.45, 0.75, g) * uGrime);
        float r = nwFbm(sp * 0.8 + 21.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.16, 0.07), smoothstep(0.5, 0.66, r) * uRot);
        float b = nwFbm(sp * 1.3 + 57.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.005, 0.01), smoothstep(0.56, 0.7, b) * uBlood);`);
  };
  m.customProgramCacheKey = () => 'stained';
  return m;
}
// dirty wrapped bandages for the mummy
function strangerSkinMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#6e675d', roughness: 0.9 });
  m.userData.u = { uRot: { value: 0 }, uBlood: { value: 0 } };
  m.userData.patternScale = { value: 1 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u); sh.uniforms.uScale = m.userData.patternScale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP;\nuniform float uScale;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvSP = transformed * uScale;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vSP;\nuniform float uRot, uBlood;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sp = vSP * 9.0;
        float r = nwFbm(sp + 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.47, 0.33), clamp(uRot * 1.4, 0.0, 1.0) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.13, 0.05), smoothstep(0.62 - uRot * 0.3, 0.72 - uRot * 0.3, r) * min(1.0, uRot * 2.0));
        float b = nwFbm(sp * 1.2 + 40.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.01, 0.015), smoothstep(0.66 - uBlood * 0.45, 0.74 - uBlood * 0.45, b) * min(1.0, uBlood * 3.0));`);
  };
  m.customProgramCacheKey = () => 'stranger-skin';
  return m;
}

function bandageMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#b9ad8c', roughness: 1, flatShading: false });
  m.userData.patternScale = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = m.userData.patternScale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWrapPos;\nuniform float uScale;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvWrapPos = transformed * uScale;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWrapPos;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = vWrapPos;
        float wob = nwNoise(p * 9.0) * 0.8;
        float band = sin((p.y * 95.0 + p.x * 14.0 - p.z * 9.0) + wob * 4.0);
        float seam = smoothstep(0.82, 0.98, abs(band));
        vec3 c = mix(vec3(0.58, 0.53, 0.41), vec3(0.36, 0.32, 0.23), smoothstep(-0.4, 0.8, band));
        c = mix(c, vec3(0.16, 0.13, 0.08), seam * 0.8);
        c *= mix(1.0, 0.45, smoothstep(0.5, 0.78, nwFbm(p * 6.0)));
        diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'bandage';
  return m;
}
// see-through, glowing, fading out below the waist
function ghostMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#cfdcf5', emissive: '#6d8fc4', emissiveIntensity: 0.9, transparent: true, opacity: 0.5, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
  m.userData.fade = { value: new THREE.Vector2(0, 1) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFadeY = m.userData.fade;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGhostY;').replace('#include <project_vertex>', '#include <project_vertex>\nvGhostY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGhostY;\nuniform vec2 uFadeY;')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.a *= smoothstep(uFadeY.x, uFadeY.y, vGhostY);');
  };
  m.customProgramCacheKey = () => 'ghost';
  return m;
}

// ============================================================
// Monsters: CC0 Quaternius characters turned into horror monsters,
// animated by turning their skeleton bones in code.
// ============================================================
const MONSTER_SPEC = {
  Zombie: { base: 'Casual2', height: 1.66, arms: 'forward', lean: 0.32, limp: 0.35, speed: 0.75 },
  Witch: { base: 'Witch', height: 1.8, arms: 'claw', lean: 0.12, limp: 0, speed: 0.9 },
  Ghost: { base: 'Medieval', height: 1.58, arms: 'reach', lean: 0.05, limp: 0, speed: 0.6, float: 0.45 },
  Vampire: { base: 'Suit', height: 1.95, arms: 'down', lean: -0.04, limp: 0, speed: 1 },
  Mummy: { base: 'Farmer', height: 1.84, arms: 'forward', lean: 0.1, limp: 0.55, speed: 0.55 },
  Stranger: { base: 'Casual2', height: 1.8, arms: 'down', lean: 0.16, limp: 0.12, speed: 0.7 },
};
const ARM_TARGETS = {
  down: [0.18, -1, 0.06], forward: [0.2, -0.12, 1], claw: [0.45, -0.55, 0.55], reach: [0.35, -0.5, 0.8], attack: [0.3, 0.35, 1],
};

function recolor(model, fn) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name; o.material = o.material.clone(); o.material.name = name;
    o.castShadow = true; o.frustumCulled = false;
    const r = fn(o, name); if (r) o.material = r;
  });
}
function eyeGlow(parent, color, x, y, z, r = 0.022) {
  const m = new THREE.MeshBasicMaterial({ color, fog: false });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); e.position.set(s * x, y, z); parent.add(e); }
  return m;
}

function makeCharacter(cls) {
  const spec = MONSTER_SPEC[cls];
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const model = SkeletonUtils.clone(MODELS[spec.base]); body.add(model);

  // ----- look -----
  if (cls === 'Zombie') {
    recolor(model, (o, n) => {
      const m = o.material;
      if (/Skin/.test(n)) m.color.set('#5b6a4b');
      else if (n === 'White') m.color.set('#5e574c');
      else if (n === 'LightBlue') m.color.set('#1a2230');
      else if (n === 'LightBrown') m.color.set('#2e2a22');
      else if (n === 'Hair') m.color.set('#141210');
      else if (n === 'Eye') { m.color.set('#d8e89a'); m.emissive = new THREE.Color('#9fbf40'); m.emissiveIntensity = 1.2; return null; }
      else if (n === 'Red_Dark') m.color.set('#3a0a0a');
      return stained(m, { grime: 0.8, blood: /Skin/.test(n) ? 0.5 : 0.85, rot: /Skin/.test(n) ? 0.9 : 0.3, seed: 3 });
    });
  } else if (cls === 'Witch') {
    recolor(model, (o, n) => {
      const m = o.material;
      if (n === 'Skin') m.color.set('#6e8660');
      else if (n === 'Purple') m.color.set('#140b1c');
      else if (n === 'Gold') m.color.set('#3b3222');
      else if (n === 'Hair_Black') m.color.set('#1a1714');
      return stained(m, { grime: 0.7, rot: n === 'Skin' ? 0.35 : 0, seed: 11 });
    });
  } else if (cls === 'Ghost') {
    const gm = ghostMaterial(); g.userData.ghostMat = gm;
    recolor(model, () => gm);
  } else if (cls === 'Vampire') {
    recolor(model, (o, n) => {
      const m = o.material;
      if (n === 'Skin') m.color.set('#c9c1cc');
      else if (n === 'Hair' || n === 'Eyebrows') m.color.set('#050407');
      else if (n === 'Tie') m.color.set('#4a0710');
      else if (n === 'White') m.color.set('#8d878f');
      else if (n === 'Suit') m.color.set('#17161d');
      else if (n === 'Eye') { m.color.set('#ff2020'); m.emissive = new THREE.Color('#ff1010'); m.emissiveIntensity = 2.5; return null; }
      return stained(m, { grime: 0.35, blood: n === 'White' || n === 'Skin' ? 0.55 : 0, seed: 7 });
    });
  } else if (cls === 'Stranger') {
    // a plain traveller in dark rags: skin and eyes are shared materials the clues change later
    const skin = strangerSkinMaterial(), eye = new THREE.MeshBasicMaterial({ color: '#1c1a17' });
    g.userData.skin = skin; g.userData.eye = eye;
    const rags = {};
    recolor(model, (o, n) => {
      if (n === 'Hair') { o.visible = false; return null; }
      if (/Skin/.test(n)) return skin;
      if (n === 'Eye') return eye;
      if (n === 'Eyebrows') { o.material.color.set('#0e0c0a'); return null; }
      const base = { LightBrown: '#2b2620', White: '#35322d', Red_Dark: '#221c19', LightBlue: '#1d1f24' }[n] || '#26231f';
      rags[n] = rags[n] || stained(mat(base, { roughness: 1 }), { grime: 0.8, seed: 13 });
      return rags[n];
    });
  } else if (cls === 'Mummy') {
    const bm = bandageMaterial();
    recolor(model, (o, n) => {
      if (n === 'Beige' && /Head/.test(o.name)) o.visible = false;
      if (n === 'Eye') { const m = o.material; m.color.set('#ffd24a'); m.emissive = new THREE.Color('#ffb000'); m.emissiveIntensity = 2.2; return null; }
      return bm;
    });
  }

  // ----- size: normalise the model to its class height (tallest vampire, shortest ghost) -----
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true), h0 = box.max.y - box.min.y;
  const k = (cls === 'Witch' ? spec.height * 1.08 : spec.height) / h0;   // the witch's hat adds height
  model.scale.setScalar(k * WORLD_SCALE); model.position.y = -box.min.y * k * WORLD_SCALE;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh || !o.material.userData.patternScale) return;
    o.material.userData.patternScale.value = o.getWorldScale(new THREE.Vector3()).x / (k * WORLD_SCALE) * (1.86 / spec.height);
  });

  // ----- bones: remember the rest pose in character space -----
  const bone = (n) => model.getObjectByName(n);
  const names = ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'HandL', 'HandR'];
  const rig = {}, rootInv = new THREE.Quaternion().copy(model.getWorldQuaternion(new THREE.Quaternion())).invert();
  for (const n of names) {
    const b = bone(n); if (!b) continue;
    const restChar = rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    rig[n] = { b, restLocal: b.quaternion.clone(), restChar, restCharInv: restChar.clone().invert() };
  }
  // T-pose arm direction, to swing the arms down or forward from
  const armDir = {};
  for (const s of ['L', 'R']) {
    const a = rig['UpperArm' + s], l = rig['LowerArm' + s];
    if (a && l) armDir[s] = l.b.getWorldPosition(new THREE.Vector3()).sub(a.b.getWorldPosition(new THREE.Vector3())).applyQuaternion(rootInv).normalize();
  }
  const qTmp = new THREE.Quaternion(), qDelta = new THREE.Quaternion(), eTmp = new THREE.Euler(), vTmp = new THREE.Vector3();
  function pose(n, delta) {                                         // rotate a bone by `delta`, given in character space
    const r = rig[n]; if (!r) return;
    qTmp.copy(r.restCharInv).multiply(delta).multiply(r.restChar);
    r.b.quaternion.copy(r.restLocal).multiply(qTmp);
  }
  function euler(x, y, z) { return qDelta.setFromEuler(eTmp.set(x, y, z, 'YXZ')); }
  function armTo(s, target, swing) {
    const d = armDir[s]; if (!d) return;
    vTmp.set(...target); if (s === 'R') vTmp.x = -vTmp.x; vTmp.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(d, vTmp);
    if (swing) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swing));
    pose('UpperArm' + s, q);
  }

  // ----- extras parented to bones, so they move with the body -----
  // a holder cancels the bone's own rotation and scale, so children are placed in plain metres,
  // facing the same way as the character
  const SW = WORLD_SCALE * spec.height / 1.86;
  function attach(name, obj) {
    const r = rig[name]; if (!r) return null;
    const holder = new THREE.Group(); holder.quaternion.copy(r.restCharInv);
    holder.scale.setScalar(SW / r.b.getWorldScale(new THREE.Vector3()).x); r.b.add(holder); holder.add(obj); return holder;
  }
  if (cls === 'Vampire') {
    const cape = new THREE.PlaneGeometry(1.2, 1.5, 10, 10), cp = cape.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i); cp.setZ(i, -0.26 * (x / 0.6) ** 2 - 0.05 * Math.sin(y * 4 + x * 5)); cp.setX(i, x * (1 + (0.75 - y) * 0.35)); }
    cape.translate(0, -0.62, -0.16); cape.computeVertexNormals();
    const capeMesh = new THREE.Mesh(cape, stained(mat('#1a0206', { side: THREE.DoubleSide, flatShading: false }), { grime: 0.5, seed: 2 })); capeMesh.castShadow = true;
    const set = new THREE.Group(); set.add(capeMesh);
    // a tall Dracula collar: open at the front, flaring out behind the head
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.12, 0.32, 16, 1, true, Math.PI * 0.4, Math.PI * 1.2), mat('#2a0409', { side: THREE.DoubleSide }));
    collar.position.set(0, 0.22, -0.05); set.add(collar);
    attach('Chest', set); g.userData.cape = capeMesh;
  }
  if (cls === 'Witch') { const eyes = new THREE.Group(); eyeGlow(eyes, '#d7ff5a', 0.045, 0.09, 0.115, 0.016); attach('Head', eyes); }
  if (cls === 'Ghost') {
    const face = new THREE.Group(), hollow = new THREE.MeshBasicMaterial({ color: '#000000', fog: false });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), hollow); e.scale.set(1, 1.5, 0.5); e.position.set(s * 0.045, 0.09, 0.12); face.add(e); }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), hollow); mouth.scale.set(1, 1.8, 0.5); mouth.position.set(0, 0.01, 0.125); face.add(mouth);
    attach('Head', face);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#7f9fd0', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(3.2, 4.2, 1); halo.position.y = 1.5; body.add(halo);
  }

  const materials = []; g.traverse((o) => { if (o.material && !materials.includes(o.material)) { materials.push(o.material); o.material.userData.baseOpacity = o.material.opacity; o.material.userData.baseTransparent = o.material.transparent; } });

  const c = {
    cls, group: g, height: spec.height * WORLD_SCALE, fade: 1, attach, rig, materials,
    setFade(f) { c.fade = f; for (const m of materials) { m.transparent = true; m.opacity = (m.userData.baseOpacity ?? 1) * f; m.depthWrite = f > 0.95 && !m.userData.baseTransparent; } },
    reset() {
      c.setFade(1); g.scale.setScalar(1); g.rotation.set(0, 0, 0); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
      for (const m of materials) { m.transparent = m.userData.baseTransparent; m.depthWrite = !m.userData.baseTransparent; }
    },
    animate(t, mode = 'idle', speed = 1) {
      const walk = mode === 'walk' ? 1 : mode === 'attack' ? 1.3 : 0.12;
      const w = t * 5.2 * speed * spec.speed, sw = Math.sin(w);
      // legs: swing from the hip, bend at the knee, drag one leg if the monster limps
      if (!spec.float) {
        const drag = 1 - spec.limp * (sw > 0 ? 1 : 0);
        pose('UpperLegL', euler(-0.5 * sw * walk * drag, 0, 0)); pose('LowerLegL', euler(Math.max(0, Math.sin(w + 0.9)) * 0.75 * walk, 0, 0));
        pose('UpperLegR', euler(0.5 * sw * walk, 0, 0)); pose('LowerLegR', euler(Math.max(0, Math.sin(w + 0.9 + Math.PI)) * 0.75 * walk * (1 - spec.limp * 0.6), 0, 0));
      } else {
        pose('UpperLegL', euler(-0.15 + 0.08 * Math.sin(t * 1.3), 0, 0)); pose('LowerLegL', euler(0.35, 0, 0));
        pose('UpperLegR', euler(-0.05 + 0.08 * Math.sin(t * 1.3 + 1), 0, 0)); pose('LowerLegR', euler(0.45, 0, 0));
      }
      // arms
      const armsMode = mode === 'attack' ? 'attack' : spec.arms;
      const armSwing = spec.arms === 'down' ? 0.35 * sw * walk : 0.08 * Math.sin(w * 0.5);
      armTo('L', ARM_TARGETS[armsMode], -armSwing + (mode === 'attack' ? -0.25 * Math.sin(t * 14) : 0));
      armTo('R', ARM_TARGETS[armsMode], armSwing + (mode === 'attack' ? -0.25 * Math.sin(t * 14 + 1.5) : 0));
      pose('LowerArmL', euler(spec.arms === 'down' && mode !== 'attack' ? -0.25 : -0.12, 0, 0)); pose('LowerArmR', euler(spec.arms === 'down' && mode !== 'attack' ? -0.25 : -0.12, 0, 0));
      // spine and head: hunched zombies, a mummy that sways, a vampire that stands tall
      const lean = spec.lean + (mode === 'attack' ? 0.25 : 0);
      pose('Torso', euler(lean * 0.6, 0.05 * Math.sin(w * 0.5) * walk, spec.limp * 0.12 * Math.sin(w)));
      pose('Chest', euler(lean * 0.4, 0, 0));
      const tilt = cls === 'Zombie' ? 0.35 + 0.1 * Math.sin(t * 0.8) : cls === 'Mummy' ? 0.1 * Math.sin(t * 0.6) : 0;
      pose('Head', euler(cls === 'Zombie' ? -0.2 : mode === 'attack' ? -0.25 : 0.04 * Math.sin(t * 0.7), 0.25 * Math.sin(t * 0.37) * (mode === 'idle' ? 1 : 0.3), tilt));
      body.position.y = (spec.float ? spec.float + Math.sin(t * 2.1) * 0.14 : Math.abs(Math.cos(w)) * 0.05 * walk * WORLD_SCALE);
      if (g.userData.ghostMat) {                                     // fade the ghost out towards the ground
        const y0 = g.getWorldPosition(vTmp).y + body.position.y;
        g.userData.ghostMat.userData.fade.value.set(y0 + 0.2 * WORLD_SCALE, y0 + 1.0 * WORLD_SCALE);
        body.rotation.z = Math.sin(t * 1.1) * 0.05;
      }
      if (g.userData.cape) g.userData.cape.rotation.x = -0.12 - 0.12 * walk + 0.04 * Math.sin(t * 3);
    },
  };
  c.reset(); c.animate(0, 'idle');
  return c;
}

const GLOW_COLORS = { green: '#6cff7a', grey: '#c3cad4', purple: '#c77dff', white: '#ffffff' };

// ============================================================
// The stranger: the hooded shape a monster wears until it is revealed.
// Each body part hides one clue. Until the lantern reveals a clue that part
// looks neutral; after, it shows the monster's real value from the data.
// ============================================================
function makeStranger() {
  // a real walking figure (a CC0 character in dark rags, hood and cloak). Each body part hides one clue:
  // until the lantern finds it the part looks neutral, afterwards it shows the monster's real value.
  const ch = makeCharacter('Stranger'), g = ch.group, skin = g.userData.skin, eyeMat = g.userData.eye;
  const body = g.children[0];
  const cloakMat = stained(mat('#23232b', { roughness: 1, side: THREE.DoubleSide, flatShading: false }), { grime: 0.7, seed: 5 });
  cloakMat.userData.patternScale.value = 1 / WORLD_SCALE;
  // moonlight from behind (outline) and a weak cold fill from the front, so the figure never vanishes
  const rimLight = new THREE.SpotLight('#9fb8ff', 30, 12, 0.7, 0.6, 1.2); rimLight.position.set(-1.5, 5.5, -3.5); rimLight.target.position.set(0, 1.6, 0); g.add(rimLight, rimLight.target);
  const fill = new THREE.PointLight('#8595bd', 4, 8, 1.4); fill.position.set(1, 3, 3.2); g.add(fill);

  // hood: a shell around the head, open at the face
  const hoodGeo = new THREE.SphereGeometry(0.19, 20, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.62);
  const hood = new THREE.Mesh(hoodGeo, cloakMat); hood.scale.set(1, 1.15, 1.12); hood.position.set(0, 0.1, -0.015); hood.castShadow = true;
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.2, 18, 1, true, Math.PI * 0.8, Math.PI * 1.4), cloakMat); cowl.position.set(0, -0.06, -0.01);
  const headSet = new THREE.Group(); headSet.add(hood, cowl);
  // hair: strands under the hood that grow to the real length
  const hair = new THREE.Group(); headSet.add(hair);
  const hairMat = mat('#17130f', { roughness: 0.9 });
  for (let k = 0; k < 18; k++) {
    const a = Math.PI * 0.18 + (k / 17) * Math.PI * 0.64, side = k % 2 ? 1 : -1;
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.028, 1, 0.02).translate(0, -0.5, 0), hairMat);
    strand.position.set(Math.cos(a) * 0.13 * side, 0.1, -Math.sin(a) * 0.1 + 0.02); strand.rotation.z = side * 0.12; strand.scale.y = 0.04; hair.add(strand);
  }
  // eyes glow in the monster's colour once found
  const eyeLight = new THREE.PointLight('#ffffff', 0, 4, 1.6); eyeLight.position.set(0, 0.1, 0.5); headSet.add(eyeLight);
  ch.attach('Head', headSet);
  // cloak over the shoulders, down to the knees
  const cl = new THREE.LatheGeometry([[0.16, 0], [0.26, -0.08], [0.3, -0.35], [0.36, -0.8], [0.42, -1.12]].map(([x, y]) => new THREE.Vector2(x, y)), 20, Math.PI * 0.62, Math.PI * 1.76);
  const cloakMesh = new THREE.Mesh(cl, cloakMat); cloakMesh.position.set(0, 0.22, -0.02); cloakMesh.castShadow = true;
  ch.attach('Chest', cloakMesh);
  // blood soaks into the rags on the chest
  const bloodMat = new THREE.MeshStandardMaterial({ color: '#3a0306', roughness: 0.35, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14), bloodMat); stain.position.set(0.03, -0.05, 0.155); stain.scale.set(1, 1.5, 1);
  ch.attach('Chest', stain);
  // the shadow it throws on the path, which shows its height
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2), shadowMat); shadow.position.set(0, 0.03, 0.3); g.add(shadow);
  // aura: only visible when the lantern is off
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.set(3.6, 4.8, 1); aura.position.y = 1.5; g.add(aura);

  // invisible zones the lantern can find, riding on the bones
  const zoneMat = new THREE.MeshBasicMaterial({ visible: false });
  const zones = [];
  const zoneOn = (name, bone, geo, x, y, z) => { const m = new THREE.Mesh(geo, zoneMat); m.position.set(x, y, z); m.userData.zone = name; const h = ch.attach(bone, m); zones.push(m); return m; };
  zoneOn('color', 'Head', new THREE.SphereGeometry(0.09, 8, 6), 0, 0.1, 0.13);
  zoneOn('rot', 'Head', new THREE.SphereGeometry(0.16, 8, 6), 0, 0.03, 0.1);
  zoneOn('hair', 'Head', new THREE.SphereGeometry(0.22, 8, 6), 0, 0.14, -0.08);
  zoneOn('blood', 'HandL', new THREE.SphereGeometry(0.16, 8, 6), 0, 0, 0);
  zoneOn('blood', 'HandR', new THREE.SphereGeometry(0.16, 8, 6), 0, 0, 0);
  zoneOn('blood', 'Chest', new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), 0, -0.05, 0.08);
  const hz = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 3.5), zoneMat); hz.position.set(0, 0.05, 1.9); hz.userData.zone = 'height'; g.add(hz); zones.push(hz);
  const anchors = { color: ['Head', [0, 0.26, 0.2]], rot: ['Head', [0.2, 0.05, 0.15]], hair: ['Head', [0, 0.36, 0]], blood: ['HandR', [0, 0, 0.08]] };
  const anchorObj = {};
  for (const [k, [bone, p]] of Object.entries(anchors)) { const o = new THREE.Object3D(); o.position.set(...p); ch.attach(bone, o); anchorObj[k] = o; }

  const target = { hair: 0.04, shadow: 1.6, height: 1, blood: 0, rot: 0 };
  const cur = { ...target };
  const fadeMats = [cloakMat, hairMat, ...ch.materials];
  const s = {
    group: g, zones, fade: 1, auraLevel: 0,
    reset() {
      g.visible = true; g.scale.setScalar(1); ch.reset(); Object.assign(target, { hair: 0.04, shadow: 1.6, height: 1, blood: 0, rot: 0 }); Object.assign(cur, target);
      eyeMat.color.set('#1c1a17'); eyeLight.intensity = 0; aura.material.opacity = 0; skin.color.set('#6e675d');
      skin.userData.u.uRot.value = 0; skin.userData.u.uBlood.value = 0; bloodMat.opacity = 0; s.setFade(1); s.auraLevel = 0;
    },
    reveal(clue, m, pct) {
      if (clue === 'hair') target.hair = 0.06 + pct * 0.75;
      if (clue === 'color') { colorOn = true; const c = GLOW_COLORS[m.color]; eyeMat.color.set(c); eyeLight.color.set(c); eyeLight.intensity = 3; }
      if (clue === 'rot') target.rot = pct;
      if (clue === 'blood') target.blood = pct;
      if (clue === 'height') { target.height = 0.82 + pct * 0.36; target.shadow = 0.8 + pct * 3.2; }
      if (clue === 'aura') s.auraLevel = 0.12 + pct * 0.7;
    },
    setAuraColor(c) { aura.material.color.set(c); },
    setFade(f) {
      s.fade = f;
      fadeMats.forEach((m) => { m.transparent = f < 1; m.opacity = f; m.depthWrite = f >= 1; });
      shadowMat.opacity = 0.5 * f;
    },
    zonePosition(name, out) {
      if (name === 'height') return g.localToWorld(out.set(0, 0.2, 2.2));
      if (name === 'aura') return g.localToWorld(out.set(0, 1.6, 0.3));
      const o = anchorObj[name]; return o ? o.getWorldPosition(out) : g.localToWorld(out.set(0, 1.8, 0));
    },
    animate(t, dt, lanternOff) {
      const k = Math.min(1, dt * 3);
      for (const key of Object.keys(target)) cur[key] += (target[key] - cur[key]) * k;
      hair.children.forEach((st, i) => { st.scale.y = cur.hair * (0.8 + 0.4 * ((i * 37) % 10) / 10); st.rotation.x = 0.06 * Math.sin(t * 1.5 + i); });
      skin.userData.u.uRot.value = cur.rot; skin.userData.u.uBlood.value = cur.blood;
      bloodMat.opacity = Math.max(0, cur.blood - 0.15) * 1.2 * s.fade; stain.scale.set(0.6 + cur.blood, (0.6 + cur.blood) * 1.5, 1);
      g.scale.setScalar(cur.height); shadow.scale.z = cur.shadow / cur.height;
      const want = lanternOff ? Math.max(0.06, s.auraLevel || 0.35) : 0;
      aura.material.opacity += (want * s.fade - aura.material.opacity) * Math.min(1, dt * 4);
      ch.animate(t, 'walk', 0.9);
    },
  };
  s.reset();
  return s;
}

// a small portrait of each monster for its card
function renderMonsterPortraits(classes) {
  // painted-style trading card portraits: a coloured backdrop, the monster lit from both sides, a dark vignette
  const w = 300, h = 400, r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
  const THEME = {
    Zombie: ['#56702c', '#101607', '#b6ff6a'], Witch: ['#5b2d7a', '#12071a', '#d59bff'], Ghost: ['#3f5d86', '#070c16', '#cfe4ff'],
    Vampire: ['#7a1414', '#150303', '#ff6b5a'], Mummy: ['#7a5a26', '#161005', '#ffcf7a'],
  };
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, w / h, 0.05, 50);
  const hemi = new THREE.HemisphereLight('#c9d4ea', '#1a1410', 1.1); sc.add(hemi);
  const key = new THREE.DirectionalLight('#ffe6c8', 2.6); key.position.set(1.6, 2.2, 2.4); sc.add(key);
  const rim = new THREE.DirectionalLight('#ffffff', 3.2); rim.position.set(-2.2, 1.8, -1.6); sc.add(rim);
  const rim2 = new THREE.DirectionalLight('#ffffff', 2.0); rim2.position.set(2.4, 1.2, -1.8); sc.add(rim2);
  const out = {}, canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const x = canvas.getContext('2d');
  for (const cls of classes) {
    const [mid, dark, glow] = THEME[cls];
    const c = makeCharacter(cls); c.animate(1.3, 'idle'); sc.add(c.group); c.group.rotation.y = 0.28;
    c.group.updateMatrixWorld(true);
    let head = null; c.group.traverse((o) => { if (!head && o.isBone && o.name === 'Head') head = o; });
    const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, c.height * 0.9, 0);
    const lookY = hp.y - 0.1;                                        // head in the upper third, shoulders and chest below
    cam.position.set(0.35, lookY + 0.1, 2.75); cam.lookAt(0, lookY + 0.02, 0);
    rim.color.set(glow); rim2.color.set(glow);
    r.toneMappingExposure = cls === 'Ghost' ? 0.95 : 1.35;
    r.render(sc, cam);
    // backdrop
    const g = x.createRadialGradient(w * 0.5, h * 0.36, 10, w * 0.5, h * 0.45, h * 0.75);
    g.addColorStop(0, mid); g.addColorStop(0.55, dark); g.addColorStop(1, '#030303');
    x.globalCompositeOperation = 'source-over'; x.fillStyle = g; x.fillRect(0, 0, w, h);
    // mist streaks
    x.globalAlpha = 0.12; x.fillStyle = glow;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(w * (0.2 + 0.15 * i), h * (0.75 + 0.04 * (i % 2)), w * 0.4, 12, 0.08 * (i - 2), 0, TAU); x.fill(); }
    x.globalAlpha = 1;
    x.drawImage(r.domElement, 0, 0, w, h);
    // vignette and a darker bottom for the name
    const v = x.createRadialGradient(w / 2, h * 0.42, h * 0.3, w / 2, h * 0.5, h * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
    const bot = x.createLinearGradient(0, h * 0.62, 0, h); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,0.92)');
    x.fillStyle = bot; x.fillRect(0, 0, w, h);
    out[cls] = canvas.toDataURL('image/jpeg', 0.9); sc.remove(c.group);
  }
  r.dispose(); r.forceContextLoss?.();
  return out;
}

// embers for a monster that burns away
function makeSparkles(scene) {
  const N = 110, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), vel = [];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: 0.22, map: GLOW, color: '#ff8a3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(geo, m));
  let life = 0;
  return {
    burst(at, color) {
      m.color.set(color); life = 1.6; vel.length = 0;
      for (let i = 0; i < N; i++) { pos[i * 3] = at.x + rand(-0.4, 0.4); pos[i * 3 + 1] = at.y + rand(0.3, 2.6); pos[i * 3 + 2] = at.z + rand(-0.4, 0.4); vel.push([rand(-1.2, 1.2), rand(1, 3.5), rand(-1.2, 1.2)]); }
    },
    update(dt) {
      if (life <= 0) { m.opacity = 0; return; }
      life -= dt; m.opacity = Math.max(0, life / 1.6);
      for (let i = 0; i < N; i++) { pos[i * 3] += vel[i][0] * dt; pos[i * 3 + 1] += vel[i][1] * dt; pos[i * 3 + 2] += vel[i][2] * dt; vel[i][0] *= 0.98; }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ============================================================
// Weapons: 3D models (CC0 Quaternius) plus a hand-built garlic stake
// ============================================================
function makeWeapon(cls) {
  const g = new THREE.Group();
  if (cls === 'Zombie') {
    const m = MODELS.Shovel.clone(); recolor(m, (o, n) => { if (n === 'Red') o.material.color.set('#3a2616'); if (n === 'Grey') { o.material.color.set('#5b5f66'); o.material.metalness = 0.6; o.material.roughness = 0.5; } return stained(o.material, { grime: 0.8, seed: 1 }); });
    m.scale.setScalar(0.42); m.position.y = 0.87; g.add(m);
  } else if (cls === 'Witch') {
    const m = MODELS.Potion1_Filled.clone(); recolor(m, (o, n) => {
      if (/Liquid/.test(n)) { o.material.color.set('#bfe6ff'); o.material.emissive = new THREE.Color('#5fb4ff'); o.material.emissiveIntensity = 1.4; }
      if (n === 'Glass') { o.material.transparent = true; o.material.opacity = 0.45; o.material.roughness = 0.1; }
      return null;
    });
    m.scale.setScalar(0.9); g.add(m);
    const cross = new THREE.Group(), cm = mat('#c8c2b0', { metalness: 0.5, roughness: 0.4 });
    cross.add(mesh(new THREE.BoxGeometry(0.05, 0.26, 0.03), cm), mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), cm, 0, 0.05, 0)); cross.position.set(0, 0.42, 0.31); g.add(cross);
    g.userData.glow = '#6fc0ff';
  } else if (cls === 'Ghost') {
    const m = MODELS.Bag.clone(); recolor(m, (o) => { o.material.color.set('#8d8166'); return stained(o.material, { grime: 0.5, seed: 4 }); });
    m.scale.setScalar(5.5); g.add(m);
    const heap = mesh(new THREE.ConeGeometry(0.28, 0.22, 16), mat('#e8e4da', { flatShading: false }), 0, 0.36, 0); g.add(heap);
    const grains = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat('#f2efe8'), 40), d = new THREE.Object3D();
    for (let i = 0; i < 40; i++) { d.position.set(rand(-0.5, 0.5), rand(0, 0.08), rand(-0.3, 0.5)); d.rotation.set(rand(0, 3), rand(0, 3), 0); d.updateMatrix(); grains.setMatrixAt(i, d.matrix); }
    g.add(grains); g.userData.glow = '#e8e4da';
  } else if (cls === 'Vampire') {
    const woodM = stained(mat('#4a3320', { flatShading: false }), { grime: 0.6, seed: 9 });
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.085, 1.1, 8), woodM, 0, 0.75, 0));
    g.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 8).rotateX(Math.PI), woodM, 0, 0.05, 0));
    const garlic = mat('#e6dfcf', { flatShading: false }), prof = [[0, 0], [0.09, 0.02], [0.13, 0.1], [0.12, 0.18], [0.05, 0.26], [0.015, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
    const bulbGeo = new THREE.LatheGeometry(prof, 12);
    [[0, 0.1], [0.14, -0.05], [-0.13, -0.06]].forEach(([dx, dz], i) => { const b = mesh(bulbGeo, garlic, dx, 1.22 + (i ? -0.06 : 0), dz * 0.6 + 0.08); b.rotation.z = dx * 1.5; g.add(b); });
    g.add(mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16).rotateX(Math.PI / 2), mat('#6b5a3a'), 0, 1.2, 0));
  } else if (cls === 'Mummy') {
    const m = MODELS.WoodenTorch_Fire.clone(); recolor(m, (o, n) => { if (n === 'Fire') { o.material.color.set('#ffb04a'); o.material.emissive = new THREE.Color('#ff6a10'); o.material.emissiveIntensity = 2.6; } if (n === 'Yellow') { o.material.emissive = new THREE.Color('#ffaa30'); o.material.emissiveIntensity = 1.4; } return null; });
    m.scale.setScalar(0.4); m.position.y = 0.23; g.add(m);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ff8a2a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.scale.set(0.9, 1.2, 1); flame.position.y = 1.55; g.add(flame);
    g.userData.glow = '#ff8a2a';
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  return g;
}

// render each weapon once into a small picture, for the weapon buttons and the journal
function renderWeaponIcons(classes) {
  const size = 160, r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  sc.add(new THREE.HemisphereLight('#c7d2e8', '#1a140e', 1.4));
  const key = new THREE.DirectionalLight('#ffd9a8', 2.6); key.position.set(2, 3, 3); sc.add(key);
  const rim = new THREE.DirectionalLight('#8fb0ff', 1.6); rim.position.set(-3, 1, -2); sc.add(rim);
  const icons = {};
  for (const cls of classes) {
    const w = makeWeapon(cls); sc.add(w);
    w.rotation.set(0.15, 0.7, cls === 'Zombie' || cls === 'Mummy' || cls === 'Vampire' ? -0.55 : 0);
    const b = new THREE.Box3().setFromObject(w), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x, c.y + s * 0.15, c.z + s * 1.75); cam.lookAt(c);
    r.render(sc, cam); icons[cls] = r.domElement.toDataURL('image/png'); sc.remove(w);
  }
  r.dispose(); r.forceContextLoss?.();
  return icons;
}

// ---------- the Owl: perched on the gate arch, it reads the clues for you ----------
function makeOwl() {
  const g = new THREE.Group(), head = new THREE.Group();
  const brown = mat('#3a2a1c'), light = mat('#7a6650'), dark = mat('#1e160f');
  const bodyM = mesh(new THREE.SphereGeometry(0.42, 12, 10), brown, 0, 0.45, 0); bodyM.scale.set(1, 1.2, 0.9); g.add(bodyM);
  const belly = mesh(new THREE.SphereGeometry(0.3, 12, 10), light, 0, 0.4, 0.2); belly.scale.set(1, 1.3, 0.6); g.add(belly);
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.SphereGeometry(0.22, 8, 8), dark, s * 0.38, 0.45, -0.02); w.scale.set(0.5, 1.4, 0.9); g.add(w);
    const f = mesh(new THREE.ConeGeometry(0.06, 0.14, 5), mat('#6a4a1a'), s * 0.12, 0.03, 0.2); f.rotation.x = Math.PI; g.add(f);
  }
  head.position.set(0, 1.0, 0); g.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.36, 14, 12), brown); skull.scale.set(1.1, 0.95, 1); head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), light, 0, -0.02, 0.14));
  const eyeGlowM = new THREE.MeshBasicMaterial({ color: '#e0a030', fog: false });
  for (const s of [-1, 1]) {
    const tuft = mesh(new THREE.ConeGeometry(0.08, 0.26, 5), dark, s * 0.24, 0.32, 0); tuft.rotation.z = -s * 0.35; head.add(tuft);
    head.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), eyeGlowM, s * 0.13, 0.03, 0.33));
    head.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: '#050505', fog: false }), s * 0.13, 0.03, 0.43));
  }
  const beak = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), mat('#6a4a1a'), 0, -0.1, 0.42); beak.rotation.x = Math.PI / 2 + 0.4; head.add(beak);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#5fe0c8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(3, 3, 1); halo.position.y = 0.8; g.add(halo);
  g.scale.setScalar(1.1);
  let glow = 0;
  return {
    group: g,
    ask() { glow = 1.6; },
    update(t, dt, watching, facing = 0) {
      glow = Math.max(0, glow - dt);
      const k = Math.min(1, glow);
      halo.material.opacity = 0.75 * k;
      eyeGlowM.color.set(k > 0 ? '#9ff5e4' : '#e0a030');
      g.rotation.y += (facing - g.rotation.y) * Math.min(1, dt * 4);
      const want = watching ? Math.max(-0.6, Math.min(0.6, watching.x * 0.15)) : Math.sin(t * 0.4) * 0.5;
      head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 3);
      head.rotation.z = Math.sin(t * 0.9) * 0.08;
      g.position.y = (g.userData.baseY ?? 6.3) + Math.abs(Math.sin(t * 0.7)) * 0.03;
    },
  };
}

// ============================================================
// The disguised monster: the real monster model under dark rags and a hood.
// Every body part is shrouded until its question is answered, then the real part shows:
// face (rot) = head, hands (blood) = arms and body, shadow (size) = legs and true size, eyes (glow) = eye colour.
// ============================================================
function boneRegion(name) {
  if (/Head|Neck/.test(name)) return 0;
  if (/Arm|Hand|Shoulder|Index|Middle|Ring|Pinky|Thumb/.test(name)) return 1;
  if (/Leg|Foot|Toe/.test(name)) return 2;
  return 3;
}
function tagRegions(mesh) {
  const geo = mesh.geometry;
  if (geo.getAttribute('aRegion')) return;
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight'), n = geo.getAttribute('position').count;
  const reg = new Float32Array(n), bones = mesh.skeleton.bones.map((b) => boneRegion(b.name));
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    reg[i] = bones[best] ?? 3;
  }
  geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
}
const SHARP = { value: 0 };                                         // 1 while drawing only the uncovered, sharp parts
function disguise(m, reveal) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uReveal = reveal; sh.uniforms.uSharp = SHARP;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vRegion;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uReveal;\nuniform float uSharp;\nvarying float vRegion;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rv = vRegion < 0.5 ? uReveal.x : vRegion < 1.5 ? uReveal.y : vRegion < 2.5 ? uReveal.z : uReveal.w;
        if (uSharp > 0.5 && rv < 0.5) discard;
        float rag = 0.25 + 0.07 * fract(sin(dot(floor(vViewPosition.xy * 18.0), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb = mix(vec3(rag * 1.02, rag * 0.97, rag * 0.9), diffuseColor.rgb, rv);
        diffuseColor.a = mix(1.0, diffuseColor.a, rv);
        totalEmissiveRadiance = mix(vec3(0.025, 0.027, 0.032), totalEmissiveRadiance, rv);`);
  };
  m.customProgramCacheKey = () => prevKey + '|disguise';
  m.needsUpdate = true;
}
function makeDisguised(cls) {
  const ch = makeCharacter(cls), g = ch.group, spec = MONSTER_SPEC[cls];
  const reveal = { value: new THREE.Vector4(0, 0, 0, 0) }, want = new THREE.Vector4();
  // everything the character carries besides its own body (cape, witch eyes, ghost face and glow) waits for its reveal
  const extras = [], wrapped = new Set();
  g.traverse((o) => {
    if (o.isSkinnedMesh) { tagRegions(o); if (!wrapped.has(o.material)) { wrapped.add(o.material); disguise(o.material, reveal); } return; }
    if ((o.isMesh || o.isSprite) && !o.isSkinnedMesh) {
      let p = o.parent, region = 0;
      while (p && p !== g) { if (p.isBone) { region = boneRegion(p.name); break; } p = p.parent; }
      extras.push({ o, region: region === 0 ? 0 : 3 });
    }
  });
  // hats and anything on the head that would give the monster away hide with the head
  const hats = []; g.traverse((o) => { if (o.isSkinnedMesh && /Head/.test(o.parent?.name || o.name) && /Purple|Gold/.test(o.material.name) && cls === 'Witch') hats.push(o); });

  const S = spec.height / 1.86;                                   // bone holders are in metres for a 1.86 m character
  const ragMat = mat('#6b665e', { roughness: 1, side: THREE.DoubleSide, flatShading: false, emissive: '#15161a' });
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.62), ragMat);
  hood.scale.set(1.08, 1.25, 1.18); hood.position.set(0, 0.1, -0.015); hood.castShadow = true;
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.32, 0.22, 18, 1, true, Math.PI * 0.8, Math.PI * 1.4), ragMat); cowl.position.set(0, -0.06, -0.01);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: '#000000' })); cavity.scale.set(1, 1.1, 0.5); cavity.position.set(0, 0.08, 0.1);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2a2622', fog: false });
  const eyes = new THREE.Group();
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat); e.position.set(sx * 0.045, 0.1, 0.16); eyes.add(e); }
  const eyeLight = new THREE.PointLight('#ffffff', 0, 4, 1.6); eyeLight.position.set(0, 0.1, 0.5);
  const headSet = new THREE.Group(); headSet.add(hood, cowl, cavity, eyes, eyeLight);
  ch.attach('Head', headSet);
  // the shadow on the path (height clue) and the aura glow (appears with the eye colour)
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2), shadowMat); shadow.position.set(0, 0.03, 0.3); g.add(shadow);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.set(3.4, 4.6, 1); aura.position.y = 1.5 * S * WORLD_SCALE / 1.5; g.add(aura);
  // moonlight from behind and a cold fill from the front so it reads in the dark
  const rimLight = new THREE.SpotLight('#9fb8ff', 45, 12, 0.7, 0.6, 1.2); rimLight.position.set(-1.5, 5.5, -3.5); rimLight.target.position.set(0, 1.6, 0); g.add(rimLight, rimLight.target);
  const fill = new THREE.PointLight('#a0acc8', 9, 9, 1.3); fill.position.set(1, 3, 3.2); g.add(fill);

  // invisible zones on the bones: click a body part to ask about it
  const zoneMat = new THREE.MeshBasicMaterial({ visible: false }), zones = [];
  const zoneOn = (name, bone, geo, x, y, z) => { const m = new THREE.Mesh(geo, zoneMat); m.position.set(x, y, z); m.userData.zone = name; ch.attach(bone, m); zones.push(m); };
  zoneOn('color', 'Head', new THREE.SphereGeometry(0.09, 8, 6), 0, 0.1, 0.13);
  zoneOn('rot', 'Head', new THREE.SphereGeometry(0.17, 8, 6), 0, 0.03, 0.1);
  zoneOn('blood', 'HandL', new THREE.SphereGeometry(0.16, 8, 6), 0, 0, 0);
  zoneOn('blood', 'HandR', new THREE.SphereGeometry(0.16, 8, 6), 0, 0, 0);
  zoneOn('blood', 'Chest', new THREE.CylinderGeometry(0.22, 0.22, 0.36, 8), 0, -0.05, 0.08);
  const hz = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 3.5), zoneMat); hz.position.set(0, 0.05, 1.9); hz.userData.zone = 'height'; g.add(hz); zones.push(hz);
  const anchors = { color: ['Head', [0, 0.12, 0.2]], rot: ['Head', [0, 0.05, 0.16]], blood: ['HandR', [0, 0, 0.05]], chest: ['Chest', [0, 0, 0.2]] }, anchorObj = {};
  for (const [k, [bone, pos]] of Object.entries(anchors)) { const o = new THREE.Object3D(); o.position.set(...pos); ch.attach(bone, o); anchorObj[k] = o; }

  const baseScale = 1 / S;                                         // every disguised monster starts the same size
  const cur = { scale: baseScale, shadow: 1.6, hood: 1 }, tgt = { scale: baseScale, shadow: 1.6, hood: 1 };
  let bossMul = 1, colorOn = false;
  const bossGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ff2a1a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  bossGlow.scale.set(5, 6.5, 1); bossGlow.position.y = 1.6; g.add(bossGlow);
  const d = {
    group: g, zones, fade: 1, auraLevel: 0, cls,
    reset() {
      ch.reset(); g.visible = false; reveal.value.set(0, 0, 0, 0); want.set(0, 0, 0, 0);
      Object.assign(tgt, { scale: baseScale, shadow: 1.6, hood: 1 }); Object.assign(cur, tgt);
      eyeMat.color.set('#2a2622'); eyeLight.intensity = 0; aura.material.opacity = 0; d.auraLevel = 0; colorOn = false;
      extras.forEach((e) => { e.o.visible = false; }); hats.forEach((h) => { h.visible = false; });
      headSet.visible = true; hood.material.opacity = 1; hood.material.transparent = false;
    },
    reveal(clue, m, pct) {
      if (clue === 'rot-shadow') { tgt.hood = 0.55; want.x = 0.12; }                       // a glimpse only
      if (clue === 'rot') { want.x = 1; tgt.hood = 0; extras.forEach((e) => { if (e.region === 0) e.o.visible = true; }); }
      if (clue === 'blood') { want.y = 1; }
      if (clue === 'height') { want.z = 1; tgt.scale = (0.84 + pct * 0.32) * baseScale; tgt.shadow = 0.8 + pct * 3.2; }
      if (clue === 'color') { const c = GLOW_COLORS[m.color]; eyeMat.color.set(c); eyeLight.color.set(c); eyeLight.intensity = 3; d.auraLevel = 0.45; }
    },
    setAuraColor(c) { aura.material.color.set(c); },
    // the sharp pass draws only what has been uncovered: no rags, no hood, the eyes once their colour is known
    sharpPass(on) {
      hood.visible = on ? false : cur.hood > 0.02; cowl.visible = cavity.visible = on ? false : cur.hood > 0.4;
      eyes.visible = on ? colorOn : true; aura.visible = bossGlow.visible = !on;
    },
    setBoss(on) { bossMul = on ? 1.35 : 1; bossGlow.material.opacity = on ? 0.5 : 0; rimLight.color.set(on ? '#ff5a4a' : '#9fb8ff'); },
    setFade(f) { d.fade = f; ch.setFade(f); },
    zonePosition(name, out) {
      if (name === 'height') return g.localToWorld(out.set(0, 0.2, 2.2));
      const o = anchorObj[name] || anchorObj.chest; return o.getWorldPosition(out);
    },
    animate(t, dt) {
      const k = Math.min(1, dt * 2.5);
      reveal.value.lerp(want, k);
      cur.scale += (tgt.scale - cur.scale) * k; cur.shadow += (tgt.shadow - cur.shadow) * k; cur.hood += (tgt.hood - cur.hood) * k;
      g.scale.setScalar(cur.scale * bossMul); shadow.scale.z = cur.shadow;
      if (bossMul > 1) bossGlow.material.opacity = 0.4 + 0.15 * Math.sin(t * 3);
      if (cur.hood < 0.99) { hood.material.transparent = true; hood.material.opacity = cur.hood; cowl.visible = cavity.visible = cur.hood > 0.4; }
      hood.visible = cur.hood > 0.02;
      aura.material.opacity += (d.auraLevel * 0.35 - aura.material.opacity) * k;
      ch.animate(t, 'walk', 0.9);
    },
  };
  g.traverse((o) => o.layers.set(1)); shadow.layers.set(0);
  d.reset();
  return d;
}
