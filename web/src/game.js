// ============================================================
// Boo Who? · game logic, HUD and screens (version 2: the lantern and the monster cards)
// Globals from the build: ORACLE_MODEL, OWL_ANY, MONSTER_ROWS, JOURNAL, consult(), consultMask()
// ============================================================

const CLASSES = ORACLE_MODEL.classes;                          // Zombie, Witch, Ghost, Vampire, Mummy
const COLOR_NAMES = ORACLE_MODEL.colors;                       // green, grey, purple, white
const MONSTERS = MONSTER_ROWS.map((r) => ({
  cls: CLASSES[r[0]], height: r[1], rottingFleshPct: r[2], bloodCoverage: r[3], aura: r[4], hairLength: r[5],
  color: COLOR_NAMES[r[6]], trickster: r[7] === 1,
}));
const TRICK_POOL = MONSTERS.filter((m) => m.trickster);

const WEAPONS = {
  Zombie: { name: 'Shovel', color: '#c9a24a' },
  Witch: { name: 'Holy water', color: '#7fd4ff' },
  Ghost: { name: 'Salt', color: '#e8e4da' },
  Vampire: { name: 'Garlic stake', color: '#ff6a5a' },
  Mummy: { name: 'Fire torch', color: '#ff9a3a' },
};
const PLURAL = { Zombie: 'Zombies', Witch: 'Witches', Ghost: 'Ghosts', Vampire: 'Vampires', Mummy: 'Mummies' };

const NIGHTS = [
  { name: 'First Moon', count: 5, walk: 34, trick: 0, mood: 'normal', note: '5 slow monsters. Learn the lantern.' },
  { name: 'Night of Crows', count: 6, walk: 30, trick: 0, mood: 'normal', note: '6 monsters, walking faster.' },
  { name: 'Fog Night', count: 7, walk: 27, trick: 0.12, mood: 'fog', note: 'Thick fog. Tricksters appear: their clues point to the wrong card, but a wrong guess on one costs nothing.' },
  { name: 'Blood Moon', count: 8, walk: 24, trick: 0.18, mood: 'blood', note: 'A red moon and more tricksters.' },
  { name: 'Halloween', count: 9, walk: 21, trick: 0.25, mood: 'halloween', note: 'The last night. Survive it to win.' },
];
const PATH_METERS = 80;
const MAX_HEARTS = 5;
const OIL_START = 100, OIL_BURN = 1.2, OIL_DAWN_MIN = 50;
const HINT_COST = 5;
const DWELL = 1.0, AURA_DWELL = 1.2;                              // seconds of light (or dark) to find a clue
const CLUE_ORDER = OWL_ANY.clue_order;                           // hair, aura, color, height, rot, blood
const FLIP_THRESHOLD = OWL_ANY.flip_threshold;

// what each clue is called, where the lantern finds it, and the words used for its value
const CLUE_INFO = {
  hair: { label: 'Hair', where: 'head', field: 'hairLength', fmt: (v) => v.toFixed(1), words: ['cropped', 'short', 'shoulder-length', 'long', 'waist-long'] },
  aura: { label: 'Aura', where: 'lantern off', field: 'aura', fmt: (v) => v.toFixed(2), words: ['no glow', 'dim', 'glowing', 'bright', 'blinding'] },
  color: { label: 'Glow', where: 'eyes', field: 'color' },
  height: { label: 'Height', where: 'shadow', field: 'height', fmt: (v) => v.toFixed(0), words: ['child-sized', 'short', 'average', 'tall', 'towering'] },
  rot: { label: 'Rot', where: 'face', field: 'rottingFleshPct', fmt: (v) => `${Math.round(v)}%`, words: ['no rot', 'patches of rot', 'half rotten', 'mostly rotten', 'falling apart'] },
  blood: { label: 'Blood', where: 'hands', field: 'bloodCoverage', fmt: (v) => `${Math.round(v)}%`, words: ['spotless', 'spattered', 'bloodstained', 'soaked', 'drenched'] },
};
const OWL_WHISPER = { hair: 'Look at its head', color: 'Look into its eyes', rot: 'Look at its face', blood: 'Look at its hands', height: 'Look at its shadow', aura: 'Put out the lantern' };
const SORTED = {};
for (const k of Object.keys(CLUE_INFO)) if (k !== 'color') SORTED[k] = MONSTERS.map((m) => m[CLUE_INFO[k].field]).sort((a, b) => a - b);
function percentile(k, v) { const a = SORTED[k]; let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; } return lo / a.length; }
function clueWord(k, v) { return CLUE_INFO[k].words[Math.min(4, Math.floor(percentile(k, v) * 5))]; }
// monsters whose clues clearly point to what they are (checked with all 6 clues by the model).
// Early nights only use the clearest ones, so the cards are easy to read while you learn.
const trueOdds = (m) => consultMask(ORACLE_MODEL, OWL_ANY, m, 63)[CLASSES.indexOf(m.cls)];
const NORMAL = MONSTERS.filter((m) => !m.trickster).map((m) => ({ m, p: trueOdds(m) }));
const CLEAR_POOL = NORMAL.filter((x) => x.p >= 0.9).map((x) => x.m);
const NORMAL_POOL = NORMAL.filter((x) => x.p >= 0.75).map((x) => x.m);

// ---------- DOM helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function show(id) { $$('.screen').forEach((s) => { s.hidden = s.id !== id; }); }
function hideScreens() { $$('.screen').forEach((s) => { s.hidden = true; }); }
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: fine */ } }
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- sound: a small WebAudio horror soundscape, started by the Start button ----------
const Sound = {
  ctx: null, on: true, master: null, noise: null, ambience: false, timers: [],
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; return; }
    this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 1 : 0; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },
  setOn(on) { this.on = on; if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); },
  ready() { if (!this.ctx) return false; if (this.ctx.state === 'suspended') this.ctx.resume(); return true; },
  env(node, t, a, peak, dec) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); },
  noiseSrc(loop = false) { const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = loop; return n; },
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; },
  tone(f, d = 0.2, type = 'sine', v = 0.12, slide = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, o = this.osc(type, f), g = this.ctx.createGain();
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    this.env(g, t, 0.01, v, d); o.connect(g).connect(this.master); o.start(t); o.stop(t + d + 0.05);
  },
  startAmbience() {
    if (!this.ready() || this.ambience) return; this.ambience = true;
    const t = this.ctx.currentTime;
    // wind: two noise layers, slowly gusting
    const wind = this.noiseSrc(true), lp = this.filter('lowpass', 420, 0.6), wg = this.ctx.createGain(); wg.gain.value = 0.16;
    const lfo = this.osc('sine', 0.07), lfoG = this.ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG).connect(lp.frequency);
    wind.connect(lp).connect(wg).connect(this.master); wind.start(t); lfo.start(t);
    const whistle = this.noiseSrc(true), bp = this.filter('bandpass', 950, 9), whg = this.ctx.createGain(); whg.gain.value = 0.025;
    const lfo2 = this.osc('sine', 0.045), lfo2G = this.ctx.createGain(); lfo2G.gain.value = 380; lfo2.connect(lfo2G).connect(bp.frequency);
    whistle.connect(bp).connect(whg).connect(this.master); whistle.start(t); lfo2.start(t);
    const later = (fn, a, b) => { const go = () => { fn(); this.timers.push(setTimeout(go, (a + Math.random() * (b - a)) * 1000)); }; this.timers.push(setTimeout(go, (a + Math.random() * (b - a)) * 1000)); };
    later(() => this.creak(), 5, 13); later(() => this.crows(), 8, 20);
  },
  creak() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, o = this.osc('sawtooth', 70 + Math.random() * 50), f = this.filter('bandpass', 700, 5), g = this.ctx.createGain();
    o.frequency.setValueCurveAtTime(new Float32Array([80, 115, 90, 130, 100]).map((v) => v * (0.8 + Math.random() * 0.4)), t, 0.9);
    this.env(g, t, 0.15, 0.05, 0.8); o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 1.1);
  },
  crows() {
    if (!this.ready()) return;
    const n = 2 + Math.floor(Math.random() * 3), far = 0.03 + Math.random() * 0.04;
    for (let k = 0; k < n; k++) {
      const t = this.ctx.currentTime + k * (0.32 + Math.random() * 0.1), o = this.osc('sawtooth', 780 + Math.random() * 120), f = this.filter('bandpass', 1300, 2.5), g = this.ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(480, t + 0.24); this.env(g, t, 0.02, far, 0.24);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
    }
  },
  step(vol) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, n = this.noiseSrc(), f = this.filter('lowpass', 260, 0.8), g = this.ctx.createGain();
    this.env(g, t, 0.005, vol, 0.14); n.connect(f).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.2);
    const o = this.osc('sine', 62), og = this.ctx.createGain(); o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    this.env(og, t, 0.005, vol * 0.9, 0.16); o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  heartbeat(vol) {
    if (!this.ready()) return;
    [0, 0.24].forEach((dt, i) => {
      const t = this.ctx.currentTime + dt, o = this.osc('sine', 58), g = this.ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12); this.env(g, t, 0.01, vol * (i ? 0.7 : 1), 0.14);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
    });
  },
  sting() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, lp = this.filter('lowpass', 5000, 0.7), g = this.ctx.createGain();
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.6); this.env(g, t, 0.02, 0.22, 1.6); lp.connect(g).connect(this.master);
    [98, 104, 139, 208, 311].forEach((f) => { const o = this.osc('sawtooth', f); o.connect(lp); o.start(t); o.stop(t + 1.8); });
    const n = this.noiseSrc(), hp = this.filter('highpass', 1800, 0.7), ng = this.ctx.createGain();
    this.env(ng, t, 0.01, 0.12, 0.5); n.connect(hp).connect(ng).connect(this.master); n.start(t); n.stop(t + 0.6);
    const shriek = this.osc('sine', 1900), sg = this.ctx.createGain(); shriek.frequency.exponentialRampToValueAtTime(900, t + 0.7);
    this.env(sg, t, 0.01, 0.05, 0.7); shriek.connect(sg).connect(this.master); shriek.start(t); shriek.stop(t + 0.8);
  },
  clue() { this.tone(392, 0.5, 'triangle', 0.045); this.tone(587, 0.35, 'sine', 0.02); },
  oracle() { [660, 880, 990].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'sine', 0.035), i * 90)); },
  win() {                                                          // the monster burns away: whoosh and a low boom
    if (!this.ready()) return;
    const t = this.ctx.currentTime, n = this.noiseSrc(), bp = this.filter('bandpass', 400, 1.2), g = this.ctx.createGain();
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.8); this.env(g, t, 0.05, 0.16, 0.9); n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 1.1);
    this.tone(55, 1.2, 'sine', 0.2, -20);
  },
  hit() {                                                          // the gate is struck
    if (!this.ready()) return;
    const t = this.ctx.currentTime, n = this.noiseSrc(), f = this.filter('lowpass', 900, 0.8), g = this.ctx.createGain();
    this.env(g, t, 0.005, 0.5, 0.5); n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 0.6);
    this.tone(48, 0.9, 'sine', 0.35, -18); this.tone(140, 0.4, 'square', 0.05, -90);
  },
  click() { this.tone(300, 0.07, 'triangle', 0.03); },
};


Object.assign(Sound, {
  blow() {                                                          // a witch blows the lantern out
    if (!this.ready()) return;
    const t = this.ctx.currentTime, n = this.noiseSrc(), bp = this.filter('bandpass', 900, 0.8), g = this.ctx.createGain();
    bp.frequency.exponentialRampToValueAtTime(250, t + 0.7); this.env(g, t, 0.05, 0.25, 0.7); n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.9);
  },
  flip() { this.tone(180, 0.12, 'triangle', 0.05, -60); },
  found() { this.tone(523, 0.4, 'triangle', 0.05); this.tone(784, 0.5, 'sine', 0.03); },
  lantern(on) { this.tone(on ? 700 : 300, 0.12, 'triangle', 0.04, on ? 300 : -150); },
});

// ============================================================
// Three.js setup
// ============================================================
const canvasHost = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

await loadModels((f) => { $('#loadingText').textContent = `Waking the dead... ${Math.round(f * 100)}%`; });
const WEAPON_ICONS = renderWeaponIcons(CLASSES);
const PORTRAITS = renderMonsterPortraits(CLASSES);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
scene.add(camera);
const world = buildWorld(scene);
const sparkles = makeSparkles(scene);

// film look: cold, drained colours, grain, vignette and a faint projector flicker
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.07 }, uFlicker: { value: 1 }, uDesat: { value: 0.5 }, uVignette: { value: 1.15 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uFlicker, uDesat, uVignette; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), uDesat) * vec3(0.93, 0.98, 1.07);
      float d = distance(vUv, vec2(0.5)) * uVignette;
      c *= smoothstep(0.9, 0.28, d);
      float n = hash(floor(vUv * uRes / 1.5) + fract(uTime * 7.0) * 91.0) - 0.5;
      c += n * uGrain * (0.35 + l);
      c *= uFlicker;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const filmPass = new ShaderPass(FilmShader); composer.addPass(filmPass);
composer.addPass(new OutputPass());


// the weapon you raise, drawn in front of the camera
const fp = { holder: new THREE.Group(), weapons: {}, t: -1, cls: null, light: new THREE.PointLight('#ffd9a8', 0, 5, 1.2) };
camera.add(fp.holder); fp.holder.add(fp.light); fp.light.position.set(0.4, 0.3, 0.4);
CLASSES.forEach((c) => { const w = makeWeapon(c); w.visible = false; w.scale.setScalar(0.55); fp.weapons[c] = w; fp.holder.add(w); });
function useWeapon(cls) { Object.values(fp.weapons).forEach((w) => { w.visible = false; }); fp.cls = cls; fp.t = 0; fp.weapons[cls].visible = true; }
function animateWeapon(dt) {
  if (fp.t < 0) return;
  fp.t += dt; const t = fp.t, w = fp.weapons[fp.cls];
  const up = Math.min(1, t / 0.22), thrust = smooth(0.22, 0.42, t), away = smooth(0.95, 1.25, t);
  const e = 1 - (1 - up) ** 3;
  w.position.set(1.0 - 0.38 * e - 0.3 * thrust, -1.45 + 0.75 * e + 0.2 * thrust - 1.2 * away, -2.1 - 0.6 * thrust);
  w.rotation.set(-0.5 + 0.9 * thrust, 0.5 - 0.3 * e, -0.5 + 0.35 * thrust);
  const glow = w.userData.glow;
  fp.light.color.set(glow || '#ffd9a8'); fp.light.intensity = (glow ? 9 : 6) * e * (1 - away);
  if (t > 1.3) { w.visible = false; fp.t = -1; fp.light.intensity = 0; }
}

// ---------- the lantern: an aimed beam from the watcher at the gate ----------
const lantern = {
  on: true,
  beam: new THREE.SpotLight('#ffcf8a', 0, 0, 0.05, 0.45, 0),
  glow: new THREE.PointLight('#ff9a42', 0, 9, 1.6),
  pointer: new THREE.Vector2(0, 0.1), hasPointer: false, pointerPx: { x: 0, y: 0 },
  ray: new THREE.Raycaster(), hit: null, hitPoint: new THREE.Vector3(),
};
scene.add(lantern.beam, lantern.beam.target, lantern.glow);

// one reusable monster per class for the reveal, plus a showcase row for the title and journal
const actors = Object.fromEntries(CLASSES.map((c) => [c, makeCharacter(c)]));
Object.values(actors).forEach((a) => { a.group.visible = false; scene.add(a.group); });
const SHOW_X = [-4.4, -2.2, 0, 2.2, 4.4];
const showcase = CLASSES.map((c, i) => {
  const a = makeCharacter(c); a.group.position.set(SHOW_X[i], 0, -9.5 - Math.abs(i - 2) * 0.55);
  a.group.lookAt(SHOW_X[i] * 0.6, 0, -40); scene.add(a.group); return a;
});
const stranger = makeStranger(); stranger.group.visible = false; scene.add(stranger.group);
const owl = makeOwl(); owl.group.position.set(0, 6.3, 0.05); scene.add(owl.group);


function resize() {
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  filmPass.uniforms.uRes.value.set(w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------- cameras, eased toward their targets every frame ----------
const cam = { pos: new THREE.Vector3(0, 3.6, 5), look: new THREE.Vector3(0, 1.6, -8), wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3(), shake: 0, fov: 55, wantFov: 55 };
let cameraMode = 'title', focusIndex = 2;
const vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();
function setCameraTargets(t) {
  const narrow = camera.aspect < 0.8;
  cam.wantFov = narrow ? 68 : 55;
  if (cameraMode === 'title') {
    cam.wantPos.set(Math.sin(t * 0.13) * 0.9, 1.7 + Math.sin(t * 0.21) * 0.12, narrow ? -21 : -17.5);
    cam.wantLook.set(0, narrow ? 1.6 : 2.3, 0);
  } else if (cameraMode === 'journal') {
    const p = showcase[focusIndex].group.position;
    cam.wantPos.set(p.x - (narrow ? 0 : 0.4), narrow ? 2.4 : 2.2, p.z - (narrow ? 6.2 : 5.4)); cam.wantLook.set(p.x - (narrow ? 0 : 0.85), narrow ? 1.1 : 1.8, p.z);
  } else if (cameraMode === 'debug') {
    /* free camera for testing: cam.wantPos and cam.wantLook are set from the console */
  } else if (cameraMode === 'scare') {
    cam.wantPos.set(0, 2.5, 3.2); cam.wantLook.set(0, 2.2, -3); cam.wantFov = narrow ? 70 : 52;
  } else if (G.state === 'play' && stranger.group.visible) {
    // watch the stranger from a few steps ahead of it on the path, so trees never block the view
    const len = PATH.getLength(), back = (narrow ? 9.5 : 8.5) / len;
    const uc = Math.max(0.015, G.u - back), cp = PATH.getPointAt(uc);
    const s = stranger.group.position;
    cam.wantPos.set(cp.x, pathLift(uc) + 2.4, cp.z);
    cam.wantLook.set(s.x, s.y + (narrow ? 0.9 : 1.45), s.z);
    cam.wantFov = narrow ? 36 : 36;
  } else {
    cam.wantPos.set(0, narrow ? 7 : 6.2, narrow ? 12 : 10); cam.wantLook.set(0, 1.2, -20);
  }
}

// ============================================================
// Game state
// ============================================================
const G = {
  state: 'title', night: 0, hearts: MAX_HEARTS, coins: 12, score: 0, streak: 0,
  oil: OIL_START, oilMax: OIL_START,
  upgrades: { favor: false },
  monster: null, progress: 0, found: 0, foundCount: 0, dwell: { zone: null, t: 0 }, auraDwell: 0, queue: [], inNight: 0, paused: false,
  resolveTimer: 0, resolveMode: null, actor: null, u: 0.86, lead: 0,
  probs: null, flipped: new Set(), owlZone: null, tipShown: false,
  stats: { met: 0, right: 0, oracleRight: 0, hints: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, oilBonus: 0, bestStreak: 0 },
};

function hintCost() { return G.upgrades.favor ? 3 : HINT_COST; }

function newGame() {
  Object.assign(G, { night: 0, hearts: MAX_HEARTS, coins: 12, score: 0, streak: 0, oil: OIL_START, oilMax: OIL_START, upgrades: { favor: false }, tipShown: false,
    stats: { met: 0, right: 0, oracleRight: 0, hints: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, oilBonus: 0, bestStreak: 0 } });
  lantern.on = true;
  showNightIntro();
}

function pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
function buildQueue(n) {
  const q = [], used = new Set(), cfg = NIGHTS[n];
  while (q.length < cfg.count) {
    const m = Math.random() < cfg.trick ? pick(TRICK_POOL) : pick(n < 2 ? CLEAR_POOL : NORMAL_POOL);
    if (!used.has(m)) { used.add(m); q.push(m); }
  }
  return q;
}

function showNightIntro() {
  const cfg = NIGHTS[G.night];
  $('#introGo').textContent = `Start night ${G.night + 1}`;
  G.state = 'intro'; cameraMode = 'game'; showcase.forEach((a) => { a.group.visible = false; });
  world.setMood(cfg.mood);
  $('#introEyebrow').textContent = `Night ${G.night + 1} of ${NIGHTS.length}`;
  $('#introTitle').textContent = cfg.name;
  $('#introNote').textContent = cfg.note;
  $('#introFacts').innerHTML = `
    <div><dt>Monsters</dt><dd>${cfg.count}</dd></div>
    <div><dt>Oil</dt><dd>${Math.round(G.oil)}/${G.oilMax}</dd></div>
    <div><dt>Tricksters</dt><dd>${cfg.trick ? Math.round(cfg.trick * 100) + '%' : 'none'}</dd></div>`;
  $('#hud').hidden = true;
  show('nightIntro');
  setTimeout(() => $('#introGo').focus(), 50);
}

function startNight() {
  G.queue = buildQueue(G.night); G.inNight = 0; G.state = 'play';
  lantern.on = G.oil > 0;
  hideScreens(); $('#hud').hidden = false; nextMonster();
}

function nextMonster() {
  if (G.queue.length === 0) return endNight();
  G.monster = G.queue.shift(); G.inNight++;
  Object.assign(G, { progress: 0, found: 0, foundCount: 0, auraDwell: 0, resolveMode: null, owlZone: null, lead: 1.2 });
  G.dwell = { zone: null, t: 0 };
  stranger.reset(); stranger.group.visible = true;
  if (G.actor) G.actor.group.visible = false;
  cameraMode = 'game';
  resetClues(); resetCards(); setCardsEnabled(true); updateCards(false);
  updateHud(); updateDistance();
  if (G.night === 0 && !G.tipShown) banner(isTouch ? 'Drag the light onto its face, eyes, hands, hair or shadow' : 'Point the light at its face, eyes, hands, hair or shadow', 'tip', 6000);
  else banner(`Monster ${G.inNight} of ${NIGHTS[G.night].count}`, 'tip', 1600);
  placeOnPath(stranger.group, 0);
  setCameraTargets(0); cam.fov = cam.wantFov; cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook);
}

function walkSeconds() {
  return NIGHTS[G.night].walk;
}
function placeOnPath(obj, progress) {
  const u = 0.86 - progress * 0.82;                              // from deep in the forest to just before the gate
  if (obj === stranger.group) G.u = u;
  const p = PATH.getPointAt(Math.max(0, Math.min(1, u)));
  obj.position.set(p.x, pathLift(u), p.z);
  const ahead = PATH.getPointAt(Math.max(0, u - 0.01));
  obj.lookAt(ahead.x, obj.position.y, ahead.z);
}

// ---------- clues: six chips above the cards ----------
function resetClues() {
  $('#clues').innerHTML = CLUE_ORDER.map((k) => `
    <li class="chip" data-clue="${k}"><span class="chip-label">${CLUE_INFO[k].label}</span><span class="chip-value">${CLUE_INFO[k].where}</span></li>`).join('');
}
function isFound(k) { return (G.found >> CLUE_ORDER.indexOf(k)) & 1; }
function revealClue(k) {
  if (isFound(k) || !G.monster) return;
  const m = G.monster, info = CLUE_INFO[k], chip = $(`.chip[data-clue="${k}"]`);
  G.found |= 1 << CLUE_ORDER.indexOf(k); G.foundCount++;
  let text, word;
  if (k === 'color') { word = m.color; text = `<span class="swatch" style="background:${GLOW_COLORS[m.color]}"></span>${m.color}`; stranger.reveal(k, m, 0); stranger.setAuraColor(GLOW_COLORS[m.color]); }
  else { const v = m[info.field]; word = clueWord(k, v); text = word; stranger.reveal(k, m, percentile(k, v)); }
  chip.querySelector('.chip-value').innerHTML = text; chip.classList.add('found');
  popWord(k, word);
  Sound.found();
  if (!G.tipShown) { G.tipShown = true; banner('Each clue turns over the monsters it rules out', 'tip', 3500); }
  if (G.owlZone === k) { G.owlZone = null; $('#owlMark').hidden = true; }
  updateCards(true);
}
const pops = [];
function popWord(zone, text) {
  const el = document.createElement('div'); el.className = 'clue-pop'; el.textContent = text; $('#pops').appendChild(el);
  pops.push({ el, zone, born: performance.now() });
}
function updatePops() {
  const now = performance.now();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i], age = (now - p.born) / 1000;
    if (age > 2.6 || !stranger.group.visible) { p.el.remove(); pops.splice(i, 1); continue; }
    stranger.zonePosition(p.zone, vTmp).project(camera);
    const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
    p.el.style.transform = `translate(${(vTmp.x * 0.5 + 0.5) * w}px, ${(-vTmp.y * 0.5 + 0.5) * h - age * 18}px) translate(-50%, -100%)`;
    p.el.style.opacity = String(Math.min(1, (2.6 - age) * 2));
  }
}

// ---------- monster cards ----------
function buildCards() {
  $('#cards').innerHTML = CLASSES.map((c, i) => `
    <button class="card" data-cls="${c}" id="card-${c}" type="button" aria-label="${c}: use the ${WEAPONS[c].name.toLowerCase()}">
      <span class="card-inner">
        <span class="card-face"><span class="c-key">${i + 1}</span><img class="c-portrait" src="${PORTRAITS[c]}" alt=""><span class="c-odds"><span class="c-bar"></span><b></b></span><span class="c-name">${c}</span><img class="c-weapon" src="${WEAPON_ICONS[c]}" alt="" title="${WEAPONS[c].name}"></span>
        <span class="card-back"><span class="c-key">${i + 1}</span><span class="c-back-name">${c}</span><span class="c-back-note">unlikely</span></span>
      </span>
    </button>`).join('');
  $$('.card').forEach((b) => b.addEventListener('click', () => choose(b.dataset.cls)));
}
function setCardsEnabled(on) { $$('.card').forEach((b) => { b.disabled = !on; }); }
function resetCards() { G.flipped = new Set(); $$('.card').forEach((b) => b.classList.remove('flipped', 'right', 'wrong', 'answer', 'last', 'likely')); }
function updateCards(withSound) {
  if (!G.monster) return;
  const m = G.monster;
  G.probs = consultMask(ORACLE_MODEL, OWL_ANY, m, G.found);
  const best = G.probs.indexOf(Math.max(...G.probs));
  let changed = false;
  CLASSES.forEach((c, i) => {
    // a card turns over when the model gives it under 6%. For honest monsters the real card never turns over.
    const protect = c === m.cls && !m.trickster;
    const down = G.probs[i] < FLIP_THRESHOLD && i !== best && !protect;
    const card = $(`#card-${c}`);
    if (down !== G.flipped.has(c)) { changed = true; if (down) G.flipped.add(c); else G.flipped.delete(c); card.classList.toggle('flipped', down); }
  });
  // show the odds on the cards still face up, scaled among themselves, and mark the most likely one
  const up = CLASSES.filter((c) => !G.flipped.has(c));
  const total = up.reduce((a, c) => a + G.probs[CLASSES.indexOf(c)], 0) || 1;
  CLASSES.forEach((c, i) => {
    const card = $(`#card-${c}`), pct = G.flipped.has(c) ? 0 : Math.round((G.probs[i] / total) * 100);
    card.querySelector('.c-odds b').textContent = G.foundCount ? `${pct}%` : '';
    card.querySelector('.c-bar').style.width = G.foundCount ? `${pct}%` : '0%';
    card.classList.toggle('likely', G.foundCount > 0 && up.length > 1 && i === best);
  });
  if (changed && withSound) Sound.flip();
  $$('.card').forEach((b) => b.classList.toggle('last', up.length === 1 && b.dataset.cls === up[0]));
  if (changed && withSound && up.length === 1) banner(`Only the ${up[0]} is left. Pick it!`, 'owl', 2500);
}

// ---------- the Owl: one button that says where to look (and, from night 3, warns about tricksters) ----------
function updateOwlButton() {
  const busy = G.state !== 'play' || G.resolveMode !== null;
  $('#askOracle').innerHTML = `Ask the Owl <small>${hintCost()} coins</small>`;
  $('#askOracle').disabled = busy || G.coins < hintCost() || G.foundCount >= 6 || G.owlZone !== null;
}
const BY_CLASS = Object.fromEntries(CLASSES.map((c) => [c, MONSTERS.filter((m) => m.cls === c)]));
function bestClueToFind() {
  // for each clue not found yet, imagine its value from monsters like this one and count how many cards it would flip
  const probs = G.probs || consultMask(ORACLE_MODEL, OWL_ANY, G.monster, G.found);
  let best = null, bestScore = -1;
  for (const k of CLUE_ORDER) {
    if (isFound(k)) continue;
    const bit = 1 << CLUE_ORDER.indexOf(k); let score = 0;
    for (let s = 0; s < 24; s++) {
      const r = Math.random(); let acc = 0, ci = 0; for (; ci < probs.length - 1; ci++) { acc += probs[ci]; if (r < acc) break; }
      const other = pick(BY_CLASS[CLASSES[ci]]);
      const test = { ...G.monster, [CLUE_INFO[k].field]: other[CLUE_INFO[k].field] };
      score += consultMask(ORACLE_MODEL, OWL_ANY, test, G.found | bit).filter((v) => v < FLIP_THRESHOLD).length;
    }
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}
function askOracle() {
  if (G.state !== 'play' || G.resolveMode || G.coins < hintCost() || G.foundCount >= 6 || G.owlZone) return;
  G.coins -= hintCost(); G.stats.hints++;
  const k = bestClueToFind(); G.owlZone = k;
  const warn = G.night >= 2 && G.monster.trickster ? ' · careful, this one is a trickster' : '';
  banner(OWL_WHISPER[k] + warn, 'owl', 4000);
  Sound.oracle(); owl.ask(); updateHud();
}

// ---------- choosing a card: the jump scare ----------
function choose(cls) {
  if (G.state !== 'play' || G.resolveMode) return;
  Sound.click(); useWeapon(cls); resolve(cls);
}
function resolve(choice) {
  const m = G.monster, right = choice === m.cls, unused = 6 - G.foundCount;
  const oracleTop = consult(ORACLE_MODEL, m, 6)[0].cls;
  G.stats.met++; if (oracleTop === m.cls) G.stats.oracleRight++;
  if (m.trickster) G.stats.tricksMet++;
  setCardsEnabled(false);
  if (choice) $(`#card-${choice}`).classList.add(right ? 'right' : 'wrong');
  if (!right) $(`#card-${m.cls}`).classList.add('answer');
  $('#ring').hidden = true; $('#owlMark').hidden = true;

  // the lantern blazes and the monster is right there
  stranger.group.visible = false;
  cameraMode = 'scare'; setCameraTargets(0); cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook); cam.fov = cam.wantFov;
  G.actor = actors[m.cls]; G.actor.reset(); G.actor.group.visible = true;
  G.actor.group.position.set(0, 0, -1.6); G.actor.group.lookAt(0, 0, 8);
  flash('white'); Sound.sting(); cam.shake = 0.35;

  let msg, sub = '';
  if (right) {
    G.noDamage = false; G.streak++; G.stats.bestStreak = Math.max(G.stats.bestStreak, G.streak);
    const mult = Math.min(5, G.streak);
    const coins = 3 + unused + (mult >= 3 ? 2 : 0), pts = (100 + unused * 30) * mult * (m.trickster ? 2 : 1);
    G.coins += coins; G.stats.earned += coins; G.score += pts; G.stats.right++;
    if (m.trickster) G.stats.tricksBeaten++;
    G.resolveMode = 'defeat';
    msg = `${m.cls}! Right`;
    sub = `+${pts} points · +${coins} coins${mult > 1 ? ` · streak x${mult}` : ''}`;
    setTimeout(() => Sound.win(), 900);
  } else {
    G.streak = m.trickster && choice ? G.streak : 0;
    G.resolveMode = 'attack'; G.noDamage = !!(m.trickster && choice);
    msg = choice ? `It was a ${m.cls}` : `Too late! A ${m.cls}`;
    sub = G.noDamage ? 'A trickster fooled the cards. No harm done' : 'The gate loses a lantern';
  }
  if (m.trickster && right) sub += ' · trickster, double points';
  banner(`<strong>${msg}</strong><span>${sub}</span>`, right ? 'good' : 'bad', 2800);
  G.resolveTimer = 0; updateHud();
}
function afterResolve() {
  if (G.actor) G.actor.group.visible = false;
  G.actor = null; G.resolveMode = null;
  if (G.hearts <= 0) return endGame(false);
  nextMonster();
}

function endNight() {
  G.state = 'shop'; stranger.group.visible = false;
  const bonus = Math.round(G.oil) * 3; G.score += bonus; G.stats.oilBonus += bonus; G.lastOilBonus = bonus;
  if (G.night === NIGHTS.length - 1) return endGame(true);
  G.night++;
  G.oil = Math.max(G.oil, OIL_DAWN_MIN);                            // the village spares you a little oil each dawn
  openShop();
}

// ---------- shop ----------
const SHOP = [
  { id: 'refill', name: 'Refill the lantern', text: 'Oil back to full', cost: 15, can: () => G.oil < G.oilMax - 1, buy: () => { G.oil = G.oilMax; } },
  { id: 'mend', name: 'Mend the gate', text: 'Get back 1 gate lantern', cost: 25, can: () => G.hearts < MAX_HEARTS, buy: () => { G.hearts++; } },
  { id: 'favor', name: 'Feed the Owl', text: 'Owl hints cost 3 coins', cost: 30, can: () => !G.upgrades.favor, buy: () => { G.upgrades.favor = true; } },
]
function openShop() {
  $('#hud').hidden = true; banner('');
  $('#shopTitle').textContent = `Dawn after night ${G.night}`;
  $('#shopSub').textContent = `Oil bonus +${G.lastOilBonus} points · Next: ${NIGHTS[G.night].name}`;
  $('#shopGo').textContent = `Start night ${G.night + 1}`;
  renderShop(); updateHud(); show('shop');
}
function renderShop() {
  $('#shopCoins').textContent = G.coins;
  $('#shopOil').textContent = `${Math.round(G.oil)}/${G.oilMax}`;
  $('#shopItems').innerHTML = SHOP.map((it) => {
    const avail = it.can(), afford = G.coins >= it.cost;
    const label = !avail ? (it.id === 'mend' || it.id === 'refill' ? 'Full' : 'Owned') : `${it.cost} coins`;
    return `<li class="shop-item"><div><h3>${it.name}</h3><p>${it.text}</p></div>
      <button type="button" class="btn small" id="buy-${it.id}" data-id="${it.id}" ${!avail || !afford ? 'disabled' : ''}>${label}</button></li>`;
  }).join('');
  $$('#shopItems button').forEach((b) => b.addEventListener('click', () => {
    const it = SHOP.find((s) => s.id === b.dataset.id);
    if (it.can() && G.coins >= it.cost) { G.coins -= it.cost; it.buy(); Sound.click(); renderShop(); updateHud(); }
  }));
}

// ---------- end ----------
function endGame(won) {
  G.state = 'end'; stranger.group.visible = false; $('#hud').hidden = true;
  const s = G.stats, pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const best = Math.max(Number(safeGet('boowho-best') || 0), G.score); safeSet('boowho-best', String(best));
  $('#endEyebrow').textContent = won ? 'Dawn breaks' : `Night ${G.night + 1} · ${NIGHTS[G.night].name}`;
  $('#endTitle').textContent = won ? 'The village is safe' : 'The gate has fallen';
  $('#endText').textContent = won ? 'You held the gate through Halloween.' : `The monsters broke through on night ${G.night + 1}.`;
  $('#endStats').innerHTML = `
    <div><dt>Score</dt><dd>${G.score.toLocaleString()}</dd></div>
    <div><dt>Stopped</dt><dd>${s.right}/${s.met}</dd></div>
    <div><dt>Best streak</dt><dd>x${Math.min(5, s.bestStreak)}</dd></div>
    <div><dt>You vs Owl</dt><dd>${pct(s.right, s.met)}% · ${pct(s.oracleRight, s.met)}%</dd></div>`;
  $('#endVersus').textContent = !s.met ? '' : s.right > s.oracleRight ? 'You beat the Owl!'
    : s.right === s.oracleRight ? 'You tied with the Owl.' : 'The Owl did better. Look at the hands and the face.';
  $('#endVersus').insertAdjacentHTML('beforeend', `<span class="best">Best score: ${best.toLocaleString()} · Oil bonus: ${s.oilBonus}</span>`);
  $('#end').classList.toggle('won', won);
  show('end'); if (won) Sound.win(); else Sound.hit();
}

// ---------- HUD ----------
function updateHud() {
  $('#hudNight').textContent = `Night ${G.night + 1} · ${NIGHTS[G.night].name}`;
  $('#hudCount').textContent = `Monster ${Math.max(1, G.inNight)} of ${NIGHTS[G.night].count}`;
  $('#hudCoins').textContent = G.coins;
  $('#hudScore').textContent = G.score.toLocaleString();
  $('#hearts').innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<span class="heart${i < G.hearts ? '' : ' lost'}"></span>`).join('');
  $('#hearts').setAttribute('aria-label', `Gate health ${G.hearts} of ${MAX_HEARTS}`);
  const mult = Math.min(5, G.streak);
  $('#streak').textContent = mult >= 2 ? `x${mult}` : ''; $('#streak').hidden = mult < 2;
  updateOil(); updateOwlButton();
}
function updateOil() {
  const btn = $('#lanternBtn');
  btn.style.setProperty('--oil', (G.oil / G.oilMax).toFixed(3));
  btn.classList.toggle('low', G.oil < 20);
  btn.innerHTML = `${G.oil <= 0 ? 'No oil' : lantern.on ? 'Lantern on' : 'Lantern off'} <small>oil ${Math.round(G.oil)}</small>`;
  btn.setAttribute('aria-pressed', String(lantern.on));
  btn.disabled = G.oil <= 0;
}
function updateDistance() {
  const meters = Math.max(0, Math.round(PATH_METERS * (1 - G.progress)));
  $('#distanceText').textContent = `${meters} m to the gate`;
  $('#distanceFill').style.width = `${(G.progress * 100).toFixed(1)}%`;
  $('#distance').classList.toggle('close', meters <= 15);
}
// one message line in the middle of the screen: tips, the Owl, results
let bannerTimer;
function banner(html, kind = 'tip', ms = 3000) {
  const b = $('#banner'); clearTimeout(bannerTimer);
  if (!html) { b.hidden = true; return; }
  b.className = `banner ${kind}`; b.innerHTML = html; b.hidden = false;
  bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}
function toast(title, sub, kind) { banner(`<strong>${title}</strong><span>${sub}</span>`, kind, 3000); }

// ---------- journal ----------
function buildJournal() {
  $('#journalTabs').innerHTML = CLASSES.map((c, i) => `<button type="button" role="tab" class="jtab" id="jtab-${c}" data-i="${i}">${c}</button>`).join('');
  $$('.jtab').forEach((b) => b.addEventListener('click', () => openJournalPage(Number(b.dataset.i))));
}
function openJournalPage(i) {
  focusIndex = i; const c = CLASSES[i], j = JOURNAL[c];
  $$('.jtab').forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
  const stat = (label, key, fmt) => {
    const v = j.means[key], p = percentile(key === 'height' ? 'height' : key === 'hairLength' ? 'hair' : key === 'aura' ? 'aura' : key === 'bloodCoverage' ? 'blood' : 'rot', v);
    return `<li><span>${label}</span><span class="js-track"><span class="js-fill" style="width:${Math.max(4, p * 100).toFixed(0)}%"></span></span><b>${fmt(v)}</b></li>`;
  };
  $('#journalPage').innerHTML = `
    <h2>${c}</h2>
    <p class="lore">${j.lore}</p>
    <p class="weapon-line"><img src="${WEAPON_ICONS[c]}" alt=""> Weapon: <b>${WEAPONS[c].name.toLowerCase()}</b></p>
    <h3>Average clues</h3>
    <ul class="jstats">
      ${stat('Height', 'height', (v) => v.toFixed(0))}
      ${stat('Hair', 'hairLength', (v) => v.toFixed(1))}
      ${stat('Aura', 'aura', (v) => v.toFixed(2))}
      ${stat('Rot', 'rottingFleshPct', (v) => `${Math.round(v)}%`)}
      ${stat('Blood', 'bloodCoverage', (v) => `${Math.round(v)}%`)}
    </ul>
    <h3>Glow</h3>
    <ul class="jcolors">${COLOR_NAMES.map((cn) => `<li><span class="swatch" style="background:${GLOW_COLORS[cn]}"></span>${cn}<b>${Math.round(j.colors[cn])}%</b></li>`).join('')}</ul>`;
}

// ---------- input ----------
function setLantern(on) {
  if (on && G.oil <= 0) return;
  if (lantern.on !== on) Sound.lantern(on);
  lantern.on = on; G.auraDwell = 0; updateOil();
}
function bind() {
  buildCards(); buildJournal();
  $('#playBtn').addEventListener('click', () => { Sound.init(); Sound.startAmbience(); Sound.click(); newGame(); });
  $('#howBtn').addEventListener('click', () => { show('howto'); });
  $('#journalBtn').addEventListener('click', () => { cameraMode = 'journal'; openJournalPage(focusIndex); show('journal'); });
  $$('.back-title').forEach((b) => b.addEventListener('click', goTitle));
  $('#howPlay').addEventListener('click', () => { Sound.init(); Sound.startAmbience(); newGame(); });
  $('#introGo').addEventListener('click', startNight);
  $('#shopGo').addEventListener('click', showNightIntro);
  $('#againBtn').addEventListener('click', newGame);
  $('#askOracle').addEventListener('click', askOracle);
  $('#lanternBtn').addEventListener('click', () => setLantern(!lantern.on));
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#resumeBtn').addEventListener('click', togglePause);
  $('#quitBtn').addEventListener('click', () => { G.paused = false; goTitle(); });
  $('#soundBtn').addEventListener('click', () => { Sound.setOn(!Sound.on); $('#soundBtn').setAttribute('aria-pressed', String(!Sound.on)); $('#soundBtn').textContent = Sound.on ? 'Sound on' : 'Sound off'; });
  // aiming the lantern: the mouse or a dragging finger over the scene
  const el = renderer.domElement;
  const aim = (e) => {
    const r = el.getBoundingClientRect();
    lantern.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    lantern.pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top }; lantern.hasPointer = true;
  };
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) aim(e); });
  el.addEventListener('pointerdown', (e) => { aim(e); if (e.button === 2) setLantern(!lantern.on); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.state === 'play') { togglePause(); e.preventDefault(); } return; }
    if (G.state === 'play' && !G.paused) {
      const n = Number(e.key); if (n >= 1 && n <= 5) choose(CLASSES[n - 1]);
      if (e.key === 'o' || e.key === 'O') askOracle();
      if (e.key === 'l' || e.key === 'L') setLantern(!lantern.on);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !G.paused) togglePause(); });
}
function togglePause() {
  if (G.state !== 'play') return;
  G.paused = !G.paused;
  if (G.paused) show('pause'); else hideScreens();
}
function goTitle() {
  G.state = 'title'; G.paused = false; cameraMode = 'title'; world.setMood('normal');
  stranger.group.visible = false; if (G.actor) G.actor.group.visible = false; G.actor = null; G.resolveMode = null;
  showcase.forEach((a) => { a.group.visible = true; });
  $('#hud').hidden = true; banner('');
  const best = Number(safeGet('boowho-best') || 0);
  $('#bestLine').textContent = best ? `Best: ${best.toLocaleString()}` : '';
  show('title');
}

// ============================================================
// Lantern, clues and monster behaviour, every frame while a stranger walks
// ============================================================
const audio = { step: 0, beat: 0 };
function updateLantern(dt, t) {
  const playing = G.state === 'play' && !G.paused && !G.resolveMode && stranger.group.visible;
  const on = playing && lantern.on && G.oil > 0;
  // where the lantern points: at the pointer, or at the stranger's chest before the player aims
  if (!lantern.hasPointer && playing) { stranger.zonePosition('blood', vTmp).project(camera); lantern.pointer.set(vTmp.x, vTmp.y + 0.1); }
  lantern.ray.setFromCamera(lantern.pointer, camera);
  const hits = playing ? lantern.ray.intersectObjects(stranger.zones, false) : [];
  lantern.hit = hits.length ? hits[0].object.userData.zone : null;
  if (hits.length) lantern.hitPoint.copy(hits[0].point);
  else lantern.ray.ray.at(stranger.group.visible ? camera.position.distanceTo(stranger.group.position) : 30, lantern.hitPoint);
  // the beam: a spotlight from just beside the camera, a small circle wherever it lands
  lantern.beam.position.copy(camera.position).add(vTmp2.set(0.6, -0.4, 0).applyQuaternion(camera.quaternion));
  lantern.beam.target.position.copy(lantern.hitPoint);
  const dist = lantern.beam.position.distanceTo(lantern.hitPoint);
  lantern.beam.angle = Math.min(0.6, Math.atan(1.0 * 1.7 / dist));
  const flick = 0.9 + 0.08 * Math.sin(t * 17) + 0.04 * Math.random();
  lantern.beam.intensity += ((on ? 18 * flick : 0) - lantern.beam.intensity) * Math.min(1, dt * 12);
  lantern.glow.position.copy(lantern.beam.position); lantern.glow.intensity = on ? 3 * flick : 0;
  $('#lanternFx').classList.toggle('on', on);

  if (!playing) { $('#ring').hidden = true; $('#owlMark').hidden = true; return; }
  // oil burns only while the lantern is lit
  if (on) { G.oil = Math.max(0, G.oil - dt * OIL_BURN); if (G.oil <= 0) { lantern.on = false; banner('Out of oil. Pick from the cards you have.', 'bad', 3000); } updateOil(); }

  // finding clues: hold the light on one body part for a second
  let ringZone = null, ringFrac = 0;
  if (on && lantern.hit && !isFound(lantern.hit)) {
    if (G.dwell.zone !== lantern.hit) G.dwell = { zone: lantern.hit, t: 0 };
    G.dwell.t += dt; ringZone = lantern.hit; ringFrac = G.dwell.t / DWELL;
    if (G.dwell.t >= DWELL) { revealClue(lantern.hit); G.dwell = { zone: null, t: 0 }; }
  } else G.dwell = { zone: null, t: 0 };
  // the aura shows only in the dark: keep the lantern off for a moment
  if (!on && !isFound('aura')) {
    G.auraDwell += dt; ringZone = 'aura'; ringFrac = G.auraDwell / AURA_DWELL;
    if (G.auraDwell >= AURA_DWELL) { revealClue('aura'); G.auraDwell = 0; }
  }
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  const toScreen = (zone) => { stranger.zonePosition(zone, vTmp).project(camera); return [(vTmp.x * 0.5 + 0.5) * w, (-vTmp.y * 0.5 + 0.5) * h]; };
  const ring = $('#ring');
  if (ringZone) {
    ring.hidden = false; ring.style.setProperty('--p', Math.min(1, ringFrac).toFixed(3));
    let x = lantern.pointerPx.x, y = lantern.pointerPx.y;
    if (ringZone === 'aura' || !lantern.hasPointer) [x, y] = toScreen(ringZone);
    ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    ring.dataset.label = CLUE_INFO[ringZone].label;
  } else ring.hidden = true;
  // the Owl's marker sits on the body part it pointed at, until that clue is found
  const mark = $('#owlMark');
  if (G.owlZone && G.owlZone !== 'aura') { const [x, y] = toScreen(G.owlZone); mark.hidden = false; mark.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }
  else mark.hidden = true;
}

// ============================================================
// Main loop
// ============================================================
const clock = new THREE.Clock();
const hudEl = $('#hud');
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * (window.__nightWatch?.timeScale || 1);
  elapsed += dt;
  const t = elapsed;

  updateLantern(dt, t);
  const resolving = !!G.resolveMode; if (resolving !== hudEl.classList.contains('resolving')) hudEl.classList.toggle('resolving', resolving);
  if (G.state === 'play' && !G.paused) {
    if (!G.resolveMode) {
      const rate = 1 / walkSeconds();
      if (G.lead > 0) G.lead -= dt; else G.progress += dt * rate;                  // a short pause before it starts walking
      placeOnPath(stranger.group, Math.min(1, G.progress)); stranger.animate(t, dt, !(lantern.on && G.oil > 0));
      updateDistance();
      audio.step -= dt; audio.beat -= dt;
      if (audio.step <= 0) { Sound.step(0.04 + 0.42 * G.progress * G.progress); audio.step = (0.3 + walkSeconds() / 70) / (rate * walkSeconds()); }
      if (G.progress > 0.62 && audio.beat <= 0) { const k = (G.progress - 0.62) / 0.38; Sound.heartbeat(0.18 + 0.4 * k); audio.beat = 1.05 - 0.55 * k; }
      if (G.progress >= 1) resolve(null);
    } else {
      G.resolveTimer += dt; const a = G.actor, rt = G.resolveTimer;
      if (G.resolveMode === 'defeat') {
        a.animate(t, rt < 0.8 ? 'attack' : 'idle', 1.4);
        if (rt > 1.3) { const f = Math.max(0, 1 - (rt - 1.3) / 0.9); a.setFade(f); a.group.position.y += dt * 0.8; }
        if (rt > 1.3 && rt - dt <= 1.3) sparkles.burst(a.group.position, WEAPONS[a.cls].color);
      } else {
        a.animate(t, 'attack', 1.6);
        if (rt > 0.9 && rt < 1.5) { const k = (rt - 0.9) / 0.6; a.group.position.z = -1.6 + 2.6 * k * k; }        // it lunges at you
        if (rt >= 1.5 && rt - dt < 1.5 && !G.noDamage) { G.hearts--; cam.shake = 1.0; Sound.hit(); flash('red'); updateHud(); }
      }
      if (rt > 3.0) afterResolve();
    }
  }

  showcase.forEach((a, i) => { if (a.group.visible) a.animate(t + i * 1.7, 'idle'); });
  sparkles.update(dt);
  animateWeapon(dt);
  updatePops();
  const lookingBack = cameraMode === 'title' || cameraMode === 'journal';
  owl.update(t, dt, stranger.group.visible ? stranger.group.position : null, lookingBack ? Math.PI : 0);
  world.setMoonSide(lookingBack ? 1 : -1);
  world.stageLight.intensity += ((lookingBack ? 90 : 0) - world.stageLight.intensity) * Math.min(1, dt * 3);
  if (cameraMode === 'journal') { const p = showcase[focusIndex].group.position; world.stageLight.target.position.set(p.x, 1.4, p.z); world.stageLight.position.set(p.x - 1.5, 6.5, p.z - 8); }
  else { world.stageLight.target.position.set(0, 1.4, -10); world.stageLight.position.set(0, 7, -19); }
  if (G.actor && G.resolveMode) {
    world.revealLight.position.set(0.6, 3.2, 1.2);
    world.revealLight.intensity += ((G.resolveTimer < 0.25 ? 90 : 38) - world.revealLight.intensity) * Math.min(1, dt * 10);
  } else world.revealLight.intensity = Math.max(0, world.revealLight.intensity - dt * 60);
  world.update(t, dt);

  setCameraTargets(t);
  const ease = 1 - Math.pow(0.02, dt);
  cam.pos.lerp(cam.wantPos, ease); cam.look.lerp(cam.wantLook, ease);
  cam.fov += (cam.wantFov - cam.fov) * ease;
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  camera.position.copy(cam.pos);
  const zoomCalm = Math.min(1, cam.fov / 45);                      // steadier breathing when zoomed in
  camera.position.x += Math.sin(t * 0.47) * 0.035 * zoomCalm; camera.position.y += Math.sin(t * 0.83) * 0.045 * zoomCalm;
  if (cam.shake > 0) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.1); }
  camera.lookAt(cam.look.x + Math.sin(t * 0.31) * 0.05 * zoomCalm, cam.look.y + Math.sin(t * 0.53) * 0.04 * zoomCalm, cam.look.z);
  filmPass.uniforms.uTime.value = t;
  filmPass.uniforms.uFlicker.value += ((0.96 + 0.03 * Math.sin(t * 23) + 0.02 * Math.random() - (Math.random() < 0.004 ? 0.12 : 0)) - filmPass.uniforms.uFlicker.value) * 0.5;
  composer.render();
  requestAnimationFrame(frame);
}
function flash(kind = 'red') { const f = $('#flash'); f.className = kind === 'white' ? 'white' : ''; void f.offsetWidth; f.classList.add('on'); }

bind(); goTitle(); setCameraTargets(0); cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook);
$('#loading').hidden = true;
window.__nightWatchReady = true;
window.__nightWatch = { G, timeScale: 1, camera, showcase, actors, THREE, cam, world, lantern, stranger, revealClue, setCameraMode: (m) => { cameraMode = m; } };   // handle for testing
requestAnimationFrame(frame);
