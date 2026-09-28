// ============================================================
// Boo Who? · 3D world: forest, path, gate, sky and monsters
// (THREE is imported by the build step at the top of the module)
// ============================================================

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };

// ---------- shared textures ----------
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function skyTexture(top, mid, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
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
function groundHeight(x, z, d = pathDistance(x, z)) {
  const hills = 1.3 * Math.sin(x * 0.08) * Math.cos(z * 0.06) + 0.7 * Math.sin(x * 0.21 + z * 0.13) + 0.35 * Math.sin(z * 0.37);
  const behindGate = smooth(-2, 6, z);  // flatten the village side
  return hills * smooth(4, 16, d) * (1 - behindGate) - 0.02;
}

function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o }); }
function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; return m; }

// ============================================================
// World
// ============================================================
function buildWorld(scene) {
  const world = { lanterns: [], fireflies: null, moon: null, moonHalo: null, sky: {} };

  // sky, fog, stars, moon
  world.sky.normal = skyTexture('#050818', '#141d45', '#2a3a68');
  world.sky.blood = skyTexture('#0d0410', '#2a0f2a', '#4a1d2e');
  world.sky.halloween = skyTexture('#07041a', '#1f1146', '#3b2566');
  scene.background = world.sky.normal;
  scene.fog = new THREE.FogExp2('#1d2850', 0.017);

  const starGeo = new THREE.BufferGeometry(); const sp = [];
  for (let i = 0; i < 1100; i++) {
    const th = Math.random() * TAU, ph = Math.acos(rand(0.08, 1)), r = 380;
    sp.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, map: GLOW, color: '#dfe6ff', transparent: true, depthWrite: false, fog: false, sizeAttenuation: true })));

  world.moon = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff3cf', fog: false }));
  world.moon.position.set(-55, 70, -210); scene.add(world.moon);
  world.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffe7a8', transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
  world.moonHalo.scale.set(95, 95, 1); world.moonHalo.position.copy(world.moon.position); scene.add(world.moonHalo);

  // lights
  scene.add(new THREE.HemisphereLight('#6a7cc4', '#1a2a18', 0.75));
  const moonLight = new THREE.DirectionalLight('#c5d6ff', 1.25);
  moonLight.position.set(-30, 45, -35); moonLight.target.position.set(0, 0, -15);
  moonLight.castShadow = true; moonLight.shadow.mapSize.set(1024, 1024);
  Object.assign(moonLight.shadow.camera, { left: -22, right: 22, top: 30, bottom: -30, near: 5, far: 120 });
  scene.add(moonLight, moonLight.target);
  world.moonLight = moonLight;

  // ground with gentle hills and coloured patches
  const gW = 170, gD = 190, gGeo = new THREE.PlaneGeometry(gW, gD, 120, 136);
  gGeo.rotateX(-Math.PI / 2); gGeo.translate(0, 0, -70);
  const gp = gGeo.attributes.position, gc = [];
  const moss = new THREE.Color('#2f5d3a'), deep = new THREE.Color('#1c3b27'), bright = new THREE.Color('#4a7a3e'), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), d = pathDistance(x, z);
    gp.setY(i, groundHeight(x, z, d));
    const n = 0.5 + 0.5 * Math.sin(x * 0.3 + Math.sin(z * 0.2) * 2) * Math.cos(z * 0.25);
    tmp.copy(deep).lerp(moss, n).lerp(bright, Math.random() * 0.25);
    gc.push(tmp.r, tmp.g, tmp.b);
  }
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true; scene.add(ground);

  // the dirt path ribbon
  const N = 260, pv = [], pc = [], idx = [];
  const dirt = new THREE.Color('#7a5b3a'), dirt2 = new THREE.Color('#5b4128');
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = PATH.getPointAt(u), t = PATH.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize(), w = 1.35 + 0.25 * Math.sin(u * 40);
    for (const s of [-1, 1]) {
      pv.push(p.x + side.x * w * s, 0.03, p.z + side.z * w * s);
      tmp.copy(dirt).lerp(dirt2, Math.random() * 0.6); pc.push(tmp.r, tmp.g, tmp.b);
    }
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
  pathGeo.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
  pathGeo.setIndex(idx); pathGeo.computeVertexNormals();
  const pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  pathMesh.receiveShadow = true; scene.add(pathMesh);

  // path-side stones
  const stoneGeo = new THREE.DodecahedronGeometry(0.25, 0), stoneMat = mat('#8b8794');
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 140); const dummy = new THREE.Object3D();
  for (let i = 0; i < 140; i++) {
    const u = Math.random(), p = PATH.getPointAt(u), t = PATH.getTangentAt(u), s = Math.random() < 0.5 ? -1 : 1;
    dummy.position.set(p.x - t.z * 1.7 * s, 0.08, p.z + t.x * 1.7 * s);
    dummy.rotation.set(rand(0, 3), rand(0, 3), 0); dummy.scale.setScalar(rand(0.6, 1.5)); dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.castShadow = stones.receiveShadow = true; scene.add(stones);

  // forest: pines, round storybook trees, twisted dead trees
  const spots = [];
  function freeSpot(minPath, zMin = -120, zMax = -3, xr = 75) {
    for (let k = 0; k < 40; k++) {
      const x = rand(-xr, xr), z = rand(zMin, zMax), d = pathDistance(x, z);
      if (d > minPath && !(Math.abs(x) < 11 && z > -15)) return { x, z, d };   // keep the title-screen stage clear
    }
    return null;
  }
  const pineN = 260, pineTiers = [[1.7, 2.2, 1.6], [1.3, 1.9, 2.8], [0.85, 1.6, 3.9]];
  const pineMats = [mat('#1f4a33'), mat('#245a3a'), mat('#2c6a41')];
  const pineMeshes = pineTiers.map(([r, h], i) => new THREE.InstancedMesh(new THREE.ConeGeometry(r, h, 7), pineMats[i], pineN));
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), trunkMat = mat('#4a3322');
  const pineTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pineN);
  for (let i = 0; i < pineN; i++) {
    const s = freeSpot(4.5); if (!s) continue;
    const y = groundHeight(s.x, s.z, s.d), sc = rand(0.8, 1.9), ry = rand(0, TAU);
    dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(sc);
    dummy.position.set(s.x, y + 0.8 * sc, s.z); dummy.updateMatrix(); pineTrunks.setMatrixAt(i, dummy.matrix);
    pineTiers.forEach(([, , yy], k) => { dummy.position.set(s.x, y + yy * sc, s.z); dummy.updateMatrix(); pineMeshes[k].setMatrixAt(i, dummy.matrix); });
  }
  [...pineMeshes, pineTrunks].forEach((m) => { m.castShadow = true; scene.add(m); });

  const roundN = 110;
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), mat('#ffffff'), roundN);
  const roundTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.35, 2.4, 6), trunkMat, roundN);
  const leafColors = ['#3d7a3a', '#5a8f3c', '#2f6b4a', '#7a8f3a', '#a0632e', '#b8792a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < roundN; i++) {
    const s = freeSpot(4); if (!s) continue;
    const y = groundHeight(s.x, s.z, s.d), sc = rand(0.8, 1.5);
    dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.setScalar(sc);
    dummy.position.set(s.x, y + 1.2 * sc, s.z); dummy.updateMatrix(); roundTrunk.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(sc * rand(0.9, 1.2), sc * rand(0.85, 1.1), sc * rand(0.9, 1.2));
    dummy.position.set(s.x, y + 3.2 * sc, s.z); dummy.updateMatrix(); canopy.setMatrixAt(i, dummy.matrix);
    canopy.setColorAt(i, leafColors[Math.floor(Math.random() * leafColors.length)]);
  }
  [canopy, roundTrunk].forEach((m) => { m.castShadow = true; scene.add(m); });

  // twisted dead trees close to the path, for the spooky storybook edge
  const deadMat = mat('#2e2430');
  for (let i = 0; i < 14; i++) {
    const u = rand(0.16, 0.85), p = PATH.getPointAt(u), t = PATH.getTangentAt(u), s = i % 2 ? 1 : -1, off = rand(3.2, 5);
    const x = p.x - t.z * off * s, z = p.z + t.x * off * s, tree = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.32, 3.4, 6), deadMat, 0, 1.7, 0); trunk.rotation.z = rand(-0.15, 0.15); tree.add(trunk);
    for (let b = 0; b < 4; b++) {
      const br = mesh(new THREE.CylinderGeometry(0.04, 0.1, rand(1.1, 1.8), 5), deadMat, 0, rand(2, 3.1), 0);
      br.rotation.set(rand(-0.4, 0.4), 0, (b % 2 ? 1 : -1) * rand(0.6, 1.1)); br.position.x = (b % 2 ? -1 : 1) * 0.35; tree.add(br);
    }
    tree.position.set(x, groundHeight(x, z), z); tree.rotation.y = rand(0, TAU); scene.add(tree);
  }

  // glowing mushrooms along the path
  function mushrooms(color, count, emissiveIntensity) {
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 6, 0, TAU, 0, Math.PI / 2), mat(color, { emissive: color, emissiveIntensity, flatShading: false }), count);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.28, 6), mat('#efe6d2', { emissive: '#efe6d2', emissiveIntensity: 0.15 }), count);
    for (let i = 0; i < count; i++) {
      const u = rand(0.02, 0.95), p = PATH.getPointAt(u), t = PATH.getTangentAt(u), s = Math.random() < 0.5 ? -1 : 1, off = rand(1.9, 3.6);
      const x = p.x - t.z * off * s + rand(-0.3, 0.3), z = p.z + t.x * off * s + rand(-0.3, 0.3), sc = rand(0.6, 1.6);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc);
      dummy.position.set(x, 0.14 * sc, z); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.27 * sc, z); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
    }
    scene.add(caps, stems);
  }
  mushrooms('#5fe0c8', 70, 1.1); mushrooms('#e069c8', 45, 1.0); mushrooms('#e8553b', 35, 0.35);
  const glowA = new THREE.PointLight('#5fe0c8', 9, 16, 1.6); glowA.position.set(-3, 1, -16); scene.add(glowA);
  const glowB = new THREE.PointLight('#e069c8', 8, 16, 1.6); glowB.position.set(4, 1, -34); scene.add(glowB);

  // bushes and flowers
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), mat('#2c5b35'), 90);
  for (let i = 0; i < 90; i++) {
    const s = freeSpot(2.4, -100, -2, 40); if (!s) continue;
    dummy.position.set(s.x, groundHeight(s.x, s.z, s.d) + 0.25, s.z); dummy.scale.set(rand(0.7, 1.6), rand(0.5, 0.9), rand(0.7, 1.4));
    dummy.rotation.set(0, rand(0, TAU), 0); dummy.updateMatrix(); bush.setMatrixAt(i, dummy.matrix);
  }
  bush.castShadow = true; scene.add(bush);

  // ---------- the village gate ----------
  const stone = mat('#6d6878'), wood = mat('#5a3b24'), woodDark = mat('#3f2918');
  for (const s of [-1, 1]) {
    const pillar = mesh(new THREE.BoxGeometry(1, 3.4, 1), stone, s * 2.6, 1.7, 0); scene.add(pillar);
    scene.add(mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), stone, s * 2.6, 3.5, 0));
    const lamp = mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), mat('#ffcf7a', { emissive: '#f2a93b', emissiveIntensity: 2.2 }), s * 2.6, 3.9, 0);
    scene.add(lamp, mesh(new THREE.ConeGeometry(0.38, 0.35, 4), woodDark, s * 2.6, 4.34, 0));
    const light = new THREE.PointLight('#ffb454', 14, 18, 1.5); light.position.set(s * 2.6, 3.9, 0.6); scene.add(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffb454', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(3, 3, 1); halo.position.set(s * 2.6, 3.9, 0); scene.add(halo);
    world.lanterns.push({ light, halo, base: 14 });
    // open wooden door leaf
    const door = new THREE.Group(); door.position.set(s * 2.1, 0, 0.1);
    for (let k = 0; k < 4; k++) door.add(mesh(new THREE.BoxGeometry(0.42, 2.4, 0.12), k % 2 ? wood : woodDark, -s * (0.25 + k * 0.44), 1.2, 0));
    door.add(mesh(new THREE.BoxGeometry(1.8, 0.14, 0.16), woodDark, -s * 0.9, 1.9, 0.02), mesh(new THREE.BoxGeometry(1.8, 0.14, 0.16), woodDark, -s * 0.9, 0.55, 0.02));
    door.rotation.y = s * 1.25; scene.add(door);
    // palisade fence
    for (let k = 0; k < 26; k++) {
      const x = s * (3.35 + k * 0.62), h = rand(1.9, 2.4);
      scene.add(mesh(new THREE.CylinderGeometry(0.26, 0.28, h, 6), k % 3 ? wood : woodDark, x, h / 2, rand(0.1, 0.4)));
      scene.add(mesh(new THREE.ConeGeometry(0.26, 0.5, 6), woodDark, x, h + 0.24, 0.25));
    }
  }
  const arch = mesh(new THREE.TorusGeometry(2.6, 0.18, 6, 18, Math.PI), wood, 0, 3.55, 0); scene.add(arch);
  // jack-o'-lanterns by the gate
  const pumpkinMat = mat('#e0701f'), faceMat = new THREE.MeshBasicMaterial({ color: '#ffd05a' });
  [[-3.6, 1.2], [3.8, 1.0], [-4.6, 1.8], [4.9, 0.9]].forEach(([x, z], i) => {
    const g = new THREE.Group(), sc = [1, 0.8, 0.65, 0.9][i];
    const body = mesh(new THREE.SphereGeometry(0.5, 10, 8), pumpkinMat); body.scale.set(1, 0.78, 1); g.add(body);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5), mat('#3e5a22'), 0, 0.45, 0));
    for (const ex of [-0.17, 0.17]) { const eye = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 3), faceMat); eye.position.set(ex, 0.08, 0.47); eye.rotation.x = Math.PI / 2; g.add(eye); }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), faceMat); mouth.position.set(0, -0.12, 0.47); g.add(mouth);
    g.position.set(x, 0.38 * sc, z - 2.2); g.scale.setScalar(sc); g.rotation.y = rand(-0.4, 0.4); scene.add(g);
  });

  // fireflies
  const FF = 220, fGeo = new THREE.BufferGeometry(), fBase = [];
  const fPos = new Float32Array(FF * 3);
  for (let i = 0; i < FF; i++) {
    const u = rand(0, 0.9), p = PATH.getPointAt(u);
    fBase.push({ x: p.x + rand(-9, 9), y: rand(0.4, 3.5), z: p.z + rand(-6, 6), ph: rand(0, TAU), sp: rand(0.3, 0.9) });
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  world.fireflies = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.35, map: GLOW, color: '#ffe38a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.fireflyBase = fBase; scene.add(world.fireflies);

  world.update = (t) => {
    for (let i = 0; i < FF; i++) {
      const b = fBase[i];
      fPos[i * 3] = b.x + Math.sin(t * b.sp + b.ph) * 1.2;
      fPos[i * 3 + 1] = b.y + Math.sin(t * b.sp * 1.7 + b.ph) * 0.5;
      fPos[i * 3 + 2] = b.z + Math.cos(t * b.sp * 0.8 + b.ph) * 1.2;
    }
    fGeo.attributes.position.needsUpdate = true;
    world.fireflies.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
    world.lanterns.forEach((l, i) => { const f = 0.85 + 0.1 * Math.sin(t * 9 + i * 2) + 0.05 * Math.sin(t * 23 + i); l.light.intensity = l.base * f; l.halo.material.opacity = 0.5 * f; });
  };

  world.setMood = (mood) => {
    scene.background = world.sky[mood === 'blood' ? 'blood' : mood === 'halloween' ? 'halloween' : 'normal'];
    const fog = { normal: ['#1d2850', 0.017], fog: ['#46527a', 0.034], blood: ['#2e1426', 0.02], halloween: ['#26184a', 0.02] }[mood] || ['#1d2850', 0.017];
    scene.fog.color.set(fog[0]); scene.fog.density = fog[1];
    const moonC = mood === 'blood' ? '#ff6a4d' : mood === 'halloween' ? '#ffb347' : '#fff3cf';
    world.moon.material.color.set(moonC); world.moonHalo.material.color.set(moonC);
  };
  return world;
}

// ============================================================
// Characters: five monsters and the hooded silhouette
// All face +z; Object3D.lookAt points +z at the target.
// ============================================================
function makeCharacter(cls) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = [], arms = [], M = (c, o) => mat(c, o);
  const add = (parent, geo, material, x, y, z) => { const m = mesh(geo, material, x, y, z); parent.add(m); return m; };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  let float = 0, armsForward = false, height = 2;

  if (cls === 'Zombie') {
    const skin = M('#86a86b'), shirt = M('#5a4632'), pants = M('#2f3b52'), dark = M('#1b1410');
    for (const s of [-1, 1]) { const l = pivot(body, s * 0.16, 0.82, 0); add(l, new THREE.BoxGeometry(0.25, 0.82, 0.27), pants, 0, -0.41, 0); add(l, new THREE.BoxGeometry(0.27, 0.12, 0.36), dark, 0, -0.78, 0.05); legs.push(l); }
    add(body, new THREE.BoxGeometry(0.64, 0.74, 0.38), shirt, 0, 1.18, 0);
    add(body, new THREE.BoxGeometry(0.2, 0.22, 0.02), M('#3b2d20'), 0.14, 1.28, 0.2); add(body, new THREE.BoxGeometry(0.15, 0.3, 0.02), skin, -0.16, 1.0, 0.2);
    const head = pivot(body, 0.04, 1.78, 0.02); head.rotation.set(0.15, 0, 0.18);
    add(head, new THREE.BoxGeometry(0.47, 0.47, 0.43), skin, 0, 0, 0);
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.055, 8, 6), M('#f4ff9a', { emissive: '#e6ff5c', emissiveIntensity: 1.5 }), s * 0.11, 0.05, 0.22);
    add(head, new THREE.BoxGeometry(0.22, 0.06, 0.02), dark, 0, -0.13, 0.22);
    add(head, new THREE.BoxGeometry(0.5, 0.1, 0.46), M('#2a3a1c'), 0, 0.26, 0);
    for (const s of [-1, 1]) { const a = pivot(body, s * 0.42, 1.48, 0); add(a, new THREE.BoxGeometry(0.18, 0.46, 0.18), shirt, 0, -0.2, 0); add(a, new THREE.BoxGeometry(0.16, 0.34, 0.16), skin, 0, -0.58, 0); a.rotation.x = -1.35; arms.push(a); }
    armsForward = true;
  } else if (cls === 'Witch') {
    const robe = M('#4b2a6b'), skin = M('#a9cf86'), hat = M('#1d1330');
    add(body, new THREE.ConeGeometry(0.58, 1.45, 10), robe, 0, 0.72, 0);
    add(body, new THREE.CylinderGeometry(0.3, 0.36, 0.1, 10), M('#f2a93b'), 0, 1.08, 0);
    const head = pivot(body, 0, 1.6, 0);
    add(head, new THREE.SphereGeometry(0.25, 12, 10), skin, 0, 0, 0);
    const nose = add(head, new THREE.ConeGeometry(0.05, 0.2, 6), skin, 0, -0.02, 0.28); nose.rotation.x = Math.PI / 2 + 0.3;
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.045, 8, 6), M('#ffd35a', { emissive: '#ffb020', emissiveIntensity: 1.6 }), s * 0.09, 0.06, 0.22);
    for (let k = 0; k < 6; k++) { const h = add(head, new THREE.BoxGeometry(0.07, 0.5, 0.05), M('#e2702a'), -0.2 + k * 0.08, -0.22, -0.14); h.rotation.x = 0.2; }
    add(head, new THREE.CylinderGeometry(0.58, 0.58, 0.04, 20), hat, 0, 0.17, 0);
    add(head, new THREE.CylinderGeometry(0.27, 0.3, 0.1, 12), M('#f2a93b'), 0, 0.23, 0);
    const crown = add(head, new THREE.ConeGeometry(0.27, 0.9, 12), hat, 0.08, 0.66, -0.04); crown.rotation.z = -0.28;
    for (const s of [-1, 1]) { const a = pivot(body, s * 0.3, 1.3, 0); const sl = add(a, new THREE.ConeGeometry(0.13, 0.6, 8), robe, 0, -0.26, 0); sl.rotation.x = Math.PI; add(a, new THREE.SphereGeometry(0.07, 6, 5), skin, 0, -0.58, 0); a.rotation.z = s * 0.25; arms.push(a); }
    const broom = new THREE.Group(); broom.position.set(0.42, 0.9, 0.18); broom.rotation.z = 0.12; body.add(broom);
    add(broom, new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), M('#6b4a2b'), 0, 0.1, 0);
    add(broom, new THREE.ConeGeometry(0.16, 0.45, 8), M('#c9a24a'), 0, -0.95, 0);
    float = 0.08;
  } else if (cls === 'Ghost') {
    const pts = [[0.01, 2.0], [0.22, 1.97], [0.4, 1.85], [0.5, 1.6], [0.53, 1.25], [0.57, 0.8], [0.66, 0.35], [0.74, 0.12]].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(pts, 20);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0.2) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) + 0.1 * Math.sin(a * 7)); } }
    geo.computeVertexNormals();
    const sheet = M('#f4f7ff', { emissive: '#bfdcff', emissiveIntensity: 0.45, transparent: true, opacity: 0.88, side: THREE.DoubleSide, flatShading: false });
    add(body, geo, sheet, 0, 0, 0);
    const black = M('#0b0b14');
    for (const s of [-1, 1]) { const e = add(body, new THREE.SphereGeometry(0.075, 10, 8), black, s * 0.15, 1.52, 0.44); e.scale.set(1, 1.5, 0.4); }
    const mouth = add(body, new THREE.SphereGeometry(0.08, 10, 8), black, 0, 1.28, 0.48); mouth.scale.set(1, 1.3, 0.4);
    for (const s of [-1, 1]) { const a = pivot(body, s * 0.52, 1.25, 0); const arm = add(a, new THREE.ConeGeometry(0.14, 0.55, 8), sheet, 0, -0.22, 0); arm.rotation.z = s * 0.2; a.rotation.z = s * 0.5; arms.push(a); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#bfe0ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(3, 3.4, 1); halo.position.y = 1.2; body.add(halo);
    float = 0.35;
  } else if (cls === 'Vampire') {
    const suit = M('#16121d'), pale = M('#e6dde6'), red = M('#8b1020');
    for (const s of [-1, 1]) { const l = pivot(body, s * 0.16, 0.95, 0); add(l, new THREE.BoxGeometry(0.24, 0.95, 0.26), suit, 0, -0.47, 0); add(l, new THREE.BoxGeometry(0.26, 0.1, 0.38), M('#050407'), 0, -0.9, 0.05); legs.push(l); }
    add(body, new THREE.BoxGeometry(0.62, 0.82, 0.34), suit, 0, 1.36, 0);
    add(body, new THREE.BoxGeometry(0.2, 0.62, 0.02), M('#efeaf0'), 0, 1.42, 0.18);
    add(body, new THREE.BoxGeometry(0.16, 0.07, 0.03), red, 0, 1.68, 0.2);
    const head = pivot(body, 0, 2.0, 0);
    add(head, new THREE.SphereGeometry(0.25, 14, 12), pale, 0, 0, 0);
    const hair = add(head, new THREE.SphereGeometry(0.265, 14, 10, 0, TAU, 0, Math.PI / 2.1), M('#0a0810'), 0, 0.02, -0.01); hair.rotation.x = -0.25;
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.045, 8, 6), M('#ff2a2a', { emissive: '#ff1a1a', emissiveIntensity: 2 }), s * 0.09, 0.03, 0.22);
    for (const s of [-1, 1]) { const f = add(head, new THREE.ConeGeometry(0.02, 0.07, 4), M('#ffffff'), s * 0.05, -0.12, 0.22); f.rotation.x = Math.PI; }
    for (const s of [-1, 1]) { const c = add(body, new THREE.BoxGeometry(0.32, 0.5, 0.03), red, s * 0.24, 1.98, -0.1); c.rotation.set(-0.25, s * 0.5, s * 0.25); }
    const capeGeo = new THREE.PlaneGeometry(1.35, 1.9, 8, 8), cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i); cp.setZ(i, -0.45 * (x / 0.675) ** 2 + 0.05 * Math.sin(y * 5 + x * 3)); cp.setX(i, x * (1 + (0.95 - y) * 0.25)); }
    capeGeo.computeVertexNormals();
    const cape = add(body, capeGeo, M('#2a0710', { side: THREE.DoubleSide }), 0, 1.0, -0.12); cape.rotation.y = Math.PI;
    for (const s of [-1, 1]) { const a = pivot(body, s * 0.4, 1.7, 0); add(a, new THREE.BoxGeometry(0.17, 0.72, 0.17), suit, 0, -0.36, 0); add(a, new THREE.SphereGeometry(0.08, 6, 5), pale, 0, -0.76, 0); arms.push(a); }
    height = 2.3;
  } else if (cls === 'Mummy') {
    const b1 = M('#ddd2b0'), b2 = M('#bfb38f'), b3 = M('#a89c7a');
    const wraps = [b1, b2, b3];
    for (const s of [-1, 1]) {
      const l = pivot(body, s * 0.16, 0.86, 0);
      for (let k = 0; k < 5; k++) { const c = add(l, new THREE.CylinderGeometry(0.135, 0.13, 0.19, 8), wraps[(k + (s > 0)) % 3], 0, -0.1 - k * 0.17, 0); c.rotation.set(rand(-0.12, 0.12), 0, rand(-0.12, 0.12)); }
      legs.push(l);
    }
    for (let k = 0; k < 6; k++) { const c = add(body, new THREE.CylinderGeometry(0.3 - k * 0.005, 0.31, 0.16, 10), wraps[k % 3], 0, 0.92 + k * 0.14, 0); c.rotation.set(rand(-0.15, 0.15), rand(0, 1), rand(-0.15, 0.15)); }
    const head = pivot(body, 0, 1.9, 0);
    add(head, new THREE.SphereGeometry(0.24, 12, 10), b2, 0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = add(head, new THREE.TorusGeometry(0.235, 0.035, 5, 16), wraps[k % 3], 0, -0.14 + k * 0.1, 0); w.rotation.set(Math.PI / 2 + rand(-0.3, 0.3), rand(-0.2, 0.2), 0); }
    add(head, new THREE.SphereGeometry(0.05, 8, 6), M('#ffe066', { emissive: '#ffcc00', emissiveIntensity: 2.2 }), 0.09, 0.02, 0.22);
    add(head, new THREE.BoxGeometry(0.1, 0.03, 0.02), M('#1a1408'), -0.09, 0.03, 0.235);
    for (const s of [-1, 1]) {
      const a = pivot(body, s * 0.4, 1.58, 0);
      for (let k = 0; k < 4; k++) add(a, new THREE.CylinderGeometry(0.1, 0.1, 0.19, 8), wraps[(k + 1) % 3], 0, -0.1 - k * 0.17, 0);
      a.rotation.x = -1.4; arms.push(a);
    }
    const strip = add(arms[0], new THREE.PlaneGeometry(0.1, 0.7), M('#cfc4a2', { side: THREE.DoubleSide }), 0.02, -0.55, -0.12); strip.rotation.x = 1.2;
    armsForward = true; height = 2.15;
  }

  const materials = [];
  g.traverse((o) => { if (o.material && !materials.includes(o.material)) { materials.push(o.material); o.material.userData.baseOpacity = o.material.opacity; } });

  const c = {
    cls, group: g, height, fade: 1,
    setFade(f) {
      c.fade = f;
      for (const m of materials) { m.transparent = true; m.opacity = (m.userData.baseOpacity ?? 1) * f; m.depthWrite = f > 0.95; }
    },
    reset() { c.setFade(1); g.scale.setScalar(1.5); g.rotation.set(0, 0, 0); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); for (const m of materials) { m.transparent = m.userData.baseOpacity < 1; m.depthWrite = true; } },
    animate(t, mode = 'idle', speed = 1) {
      const walk = mode === 'walk' ? 1 : mode === 'attack' ? 1.6 : 0.15;
      const w = t * 6 * speed;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(w + i * Math.PI) * 0.55 * walk; });
      arms.forEach((a, i) => {
        if (armsForward) a.rotation.x = -1.35 + Math.sin(w * 0.5 + i * Math.PI) * 0.12;
        else a.rotation.x = Math.sin(w + i * Math.PI + Math.PI) * 0.4 * walk + (mode === 'attack' ? -1.2 : 0);
      });
      body.position.y = float + (float ? Math.sin(t * 2.2) * 0.12 : Math.abs(Math.sin(w)) * 0.06 * walk);
      body.rotation.z = cls === 'Zombie' ? Math.sin(w * 0.5) * 0.08 : cls === 'Ghost' ? Math.sin(t * 1.3) * 0.08 : 0;
    },
  };
  c.reset();
  return c;
}

const GLOW_COLORS = { green: '#6cff7a', grey: '#c3cad4', purple: '#c77dff', white: '#ffffff' };

function makeSilhouette() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const cloak = mat('#0a0910', { roughness: 1 });
  body.add(mesh(new THREE.ConeGeometry(0.62, 1.75, 12), cloak, 0, 0.88, 0));
  for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, t = mesh(new THREE.ConeGeometry(0.1, 0.35, 4), cloak, Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55); t.rotation.x = Math.PI; body.add(t); }
  const hood = mesh(new THREE.SphereGeometry(0.36, 12, 10), cloak, 0, 1.82, 0); hood.scale.set(1, 1.15, 1); body.add(hood);
  body.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#000000' }), 0, 1.78, 0.17));
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', fog: false });
  for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat, s * 0.1, 1.82, 0.36));
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.set(3.6, 4.2, 1); aura.position.y = 1.1; body.add(aura);
  const light = new THREE.PointLight('#ffffff', 0, 7, 1.8); light.position.set(0, 1.4, 0.8); body.add(light);
  const s = {
    group: g,
    reset() { g.visible = true; body.scale.set(1, 1, 1); eyeMat.color.set('#ffcf7a'); aura.material.opacity = 0; light.intensity = 0; g.scale.setScalar(1.7); },
    setHeight(frac) { body.scale.set(1, 0.7 + frac * 0.65, 1); },           // frac 0..1 from the height clue
    setColor(name) { const c = GLOW_COLORS[name] || '#ffffff'; eyeMat.color.set(c); aura.material.color.set(c); light.color.set(c); light.intensity = 3; },
    setAura(frac) { aura.material.opacity = 0.12 + frac * 0.6; },
    animate(t) { body.position.y = Math.abs(Math.sin(t * 5)) * 0.06; body.rotation.z = Math.sin(t * 2.5) * 0.05; },
  };
  s.reset();
  return s;
}

// ---------- sparkles for a defeated monster ----------
function makeSparkles(scene) {
  const N = 90, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), vel = [];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: 0.28, map: GLOW, color: '#ffe38a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, m); scene.add(pts);
  let life = 0;
  return {
    burst(at, color) {
      m.color.set(color); life = 1.4; vel.length = 0;
      for (let i = 0; i < N; i++) { pos[i * 3] = at.x; pos[i * 3 + 1] = at.y + rand(0.5, 2.2); pos[i * 3 + 2] = at.z; vel.push([rand(-2.5, 2.5), rand(0.5, 4), rand(-2.5, 2.5)]); }
    },
    update(dt) {
      if (life <= 0) { m.opacity = 0; return; }
      life -= dt; m.opacity = Math.max(0, life / 1.4);
      for (let i = 0; i < N; i++) { pos[i * 3] += vel[i][0] * dt; pos[i * 3 + 1] += vel[i][1] * dt; pos[i * 3 + 2] += vel[i][2] * dt; vel[i][1] -= 2.5 * dt; }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- the Owl: perched on the gate arch, it reads the clues for you ----------
function makeOwl() {
  const g = new THREE.Group(), head = new THREE.Group();
  const brown = mat('#6b4a2e'), light = mat('#c9a77a'), dark = mat('#3b2819');
  const bodyM = mesh(new THREE.SphereGeometry(0.42, 12, 10), brown, 0, 0.45, 0); bodyM.scale.set(1, 1.2, 0.9); g.add(bodyM);
  const belly = mesh(new THREE.SphereGeometry(0.3, 12, 10), light, 0, 0.4, 0.2); belly.scale.set(1, 1.3, 0.6); g.add(belly);
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.SphereGeometry(0.22, 8, 8), dark, s * 0.38, 0.45, -0.02); w.scale.set(0.5, 1.4, 0.9); g.add(w);
    const f = mesh(new THREE.ConeGeometry(0.06, 0.14, 5), mat('#e0a030'), s * 0.12, 0.03, 0.2); f.rotation.x = Math.PI; g.add(f);
  }
  head.position.set(0, 1.0, 0); g.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.36, 14, 12), brown); skull.scale.set(1.1, 0.95, 1); head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), light, 0, -0.02, 0.14));
  const eyeGlow = new THREE.MeshBasicMaterial({ color: '#ffd35a', fog: false });
  for (const s of [-1, 1]) {
    const tuft = mesh(new THREE.ConeGeometry(0.08, 0.26, 5), dark, s * 0.24, 0.32, 0); tuft.rotation.z = -s * 0.35; head.add(tuft);
    head.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), eyeGlow, s * 0.13, 0.03, 0.33));
    head.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: '#111111', fog: false }), s * 0.13, 0.03, 0.43));
  }
  const beak = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), mat('#e0a030'), 0, -0.1, 0.42); beak.rotation.x = Math.PI / 2 + 0.4; head.add(beak);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#5fe0c8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(3, 3, 1); halo.position.y = 0.8; g.add(halo);
  g.scale.setScalar(1.1);
  let glow = 0; const target = new THREE.Vector3();
  return {
    group: g,
    ask() { glow = 1.6; },
    update(t, dt, watching) {
      glow = Math.max(0, glow - dt);
      const k = Math.min(1, glow);
      halo.material.opacity = 0.75 * k;
      eyeGlow.color.set(k > 0 ? '#9ff5e4' : '#ffd35a');
      // turn the head toward the monster on the path, otherwise look around
      const want = watching ? Math.max(-0.6, Math.min(0.6, watching.x * 0.15)) : Math.sin(t * 0.4) * 0.5;   // glance toward the monster's side of the path
      target.set(0, want, 0);
      head.rotation.y += (target.y - head.rotation.y) * Math.min(1, dt * 3);
      head.rotation.z = Math.sin(t * 0.9) * 0.08;
      g.position.y = 6.3 + Math.abs(Math.sin(t * 0.7)) * 0.03;
    },
  };
}
