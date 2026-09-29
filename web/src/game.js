// ============================================================
// Boo Who? · game logic, HUD and screens (version 2: the lantern and the monster cards)
// Globals from the build: ORACLE_MODEL, MONSTER_ROWS, JOURNAL, TELLS, OWL_BRAIN and Brain (the Owl's neural network, notebook 05)
// ============================================================

const CLASSES = ORACLE_MODEL.classes;                          // Zombie, Witch, Ghost, Vampire, Mummy
const COLOR_NAMES = ORACLE_MODEL.colors;                       // green, grey, purple, white
const MONSTERS = MONSTER_ROWS.map((r) => ({
  cls: CLASSES[r[0]], height: r[1], rottingFleshPct: r[2], bloodCoverage: r[3], aura: r[4], hairLength: r[5],
  color: COLOR_NAMES[r[6]], trickster: r[7] === 1,
}));

const WEAPONS = {
  Zombie: { name: 'Shovel', color: '#c9a24a' },
  Witch: { name: 'Holy water', color: '#7fd4ff' },
  Ghost: { name: 'Salt', color: '#e8e4da' },
  Vampire: { name: 'Garlic stake', color: '#ff6a5a' },
  Mummy: { name: 'Fire torch', color: '#ff9a3a' },
};
const PLURAL = { Zombie: 'Zombies', Witch: 'Witches', Ghost: 'Ghosts', Vampire: 'Vampires', Mummy: 'Mummies' };

const NIGHTS = [
  { name: 'First Moon', count: 5, walk: 36, trick: 0, mood: 'normal', note: '5 slow monsters. Ask about the face, hands, shadow and eyes.' },
  { name: 'Night of Crows', count: 6, walk: 32, trick: 0, mood: 'normal', note: '6 monsters, walking faster.' },
  { name: 'Fog Night', count: 7, walk: 29, trick: 0.1, mood: 'fog', note: 'Only 3 questions per monster from tonight. Tricksters appear: they break one of their rules.' },
  { name: 'Blood Moon', count: 8, walk: 26, trick: 0.15, mood: 'blood', note: 'A red moon and more tricksters.' },
  { name: 'Halloween', count: 9, walk: 23, trick: 0.2, mood: 'halloween', note: 'The last night. Survive it to win.' },
];
const PATH_METERS = 50;
const MAX_HEARTS = 5;
const HINT_COST = 5;
const ASK_TIME = 0.7;
const JUMP_METERS = 10;                                            // a wrong card makes the monster rush this far closer
function maxQuestions() { return G.night >= 2 ? 3 : 4; }            // from Fog Night, only 3 questions per monster
function speedMul() {                                              // every question and a hot streak make it walk faster
  return (1 + 0.1 * G.asked.size) * (G.streak >= 3 ? 1.1 : 1);
}                                             // seconds the lantern takes to look at a body part

// ---------- the four questions and each monster's rules (from notebooks/04_monster_rules.ipynb) ----------
const QUESTIONS = TELLS.questions;                                // rot, blood, height, color
const Q = {
  rot: { label: 'Rot', where: 'face', ask: 'Look at its face', field: 'rottingFleshPct' },
  blood: { label: 'Blood', where: 'hands', ask: 'Look at its hands', field: 'bloodCoverage' },
  height: { label: 'Size', where: 'shadow', ask: 'Look at its shadow', field: 'height' },
  color: { label: 'Glow', where: 'eyes', ask: 'Look into its eyes', field: 'color' },
};
const RULES = TELLS.rules;
function levelOf(m, q) {
  if (q === 'color') return TELLS.colors.indexOf(m.color);
  const v = m[Q[q].field], cs = TELLS.cuts[q]; let i = 0;
  while (i < cs.length && v >= cs[i]) i++;
  return i;
}
function levelWord(q, lv) { return TELLS.levels[q][lv]; }
function fits(cls, m, q) { return RULES[cls][q].includes(levelOf(m, q)); }
function brokenRules(m) { return QUESTIONS.filter((q) => !fits(m.cls, m, q)); }
// honest monsters follow every rule of their kind; tricksters break exactly one
const FOLLOW = Object.fromEntries(CLASSES.map((c) => [c, MONSTERS.filter((m) => m.cls === c && brokenRules(m).length === 0)]));
const TRICKS = MONSTERS.filter((m) => brokenRules(m).length === 1);
const CLASS_WEIGHT = { Zombie: 0.28, Witch: 0.18, Ghost: 0.18, Vampire: 0.18, Mummy: 0.18 };
const isTrick = (m) => brokenRules(m).length > 0;

// percentiles, for how strongly the hooded figure shows a clue and for the journal
const FIELDS = { rot: 'rottingFleshPct', blood: 'bloodCoverage', height: 'height', hair: 'hairLength', aura: 'aura' };
const SORTED = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, MONSTERS.map((m) => m[f]).sort((a, b) => a - b)]));
function percentile(k, v) { const a = SORTED[k]; let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; } return lo / a.length; }

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
  correct() {                                                       // right monster: a bright rising bell chord and a shimmer
    if (!this.ready()) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => setTimeout(() => { this.tone(f, 0.9, 'triangle', 0.07); this.tone(f * 2, 0.5, 'sine', 0.02); }, i * 85));
    const t = this.ctx.currentTime + 0.3, n = this.noiseSrc(), hp = this.filter('highpass', 6000, 0.7), g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.05, 1.1); n.connect(hp).connect(g).connect(this.master); n.start(t); n.stop(t + 1.3);
  },
  wrong() {                                                         // wrong monster: a sour falling buzz and a low thud
    if (!this.ready()) return;
    const t = this.ctx.currentTime, lp = this.filter('lowpass', 1400, 1.2), g = this.ctx.createGain();
    this.env(g, t, 0.02, 0.16, 0.9); lp.connect(g).connect(this.master);
    [[233, 110], [247, 116], [311, 147]].forEach(([a, b]) => { const o = this.osc('sawtooth', a); o.frequency.exponentialRampToValueAtTime(b, t + 0.85); o.connect(lp); o.start(t); o.stop(t + 1); });
    this.tone(70, 0.6, 'square', 0.06, -30);
  },
  thunder() {                                                       // distant thunder after a lightning flash
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.4, n = this.noiseSrc(), lp = this.filter('lowpass', 180, 0.8), g = this.ctx.createGain();
    lp.frequency.exponentialRampToValueAtTime(60, t + 2.4); this.env(g, t, 0.25, 0.3, 2.3); n.connect(lp).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 2.8);
  },
  // a slow pulse that speeds up as the monster comes closer: bass thump, a tolling bell, then a ticking beat
  intensity: 0, musicOn: false, musicTimer: null, musicStep: 0,
  startMusic() {
    if (!this.ready() || this.musicOn) return;
    this.musicOn = true; this.musicStep = 0;
    const BELL = [220, 207.65, 246.94, 196, 233.08, 185];            // a falling, uneasy minor line
    const tick = () => {
      if (!this.musicOn) return;
      const k = Math.max(0, Math.min(1, this.intensity)), s = this.musicStep++;
      const t = this.ctx.currentTime;
      if (s % 2 === 0) {                                             // bass thump on the beat
        const o = this.osc('sine', 62), g = this.ctx.createGain(); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        this.env(g, t, 0.005, 0.07 + 0.12 * k, 0.22); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
      }
      if (s % 8 === 0) this.tone(BELL[(s / 8) % BELL.length], 1.6, 'triangle', 0.028 + 0.02 * k);
      if (k > 0.45 && s % 2 === 1) {                                 // ticking hats once it is half way
        const n = this.noiseSrc(), hp = this.filter('highpass', 7000, 0.8), g = this.ctx.createGain();
        this.env(g, t, 0.002, 0.02 + 0.03 * k, 0.05); n.connect(hp).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.08);
      }
      if (k > 0.75 && s % 4 === 2) this.tone(BELL[(s / 4) % BELL.length] * 2, 0.25, 'sawtooth', 0.012 + 0.02 * k);
      const bpm = 58 + 104 * k;
      this.musicTimer = setTimeout(tick, 60000 / bpm / 2);
    };
    tick();
  },
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); },
  question() { this.tone(330, 0.18, 'sine', 0.05, 120); },
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.7;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

await loadModels((f) => { $('#loadingText').textContent = `Waking the dead... ${Math.round(f * 100)}%`; });
const WEAPON_ICONS = renderWeaponIcons(CLASSES);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
scene.add(camera);
const world = buildWorld(scene);
const sparkles = makeSparkles(scene);

// a ring of light that swells on the body part you just asked about
const pulses = [];
for (let i = 0; i < 4; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ffc46b', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.renderOrder = 5; scene.add(sp); pulses.push({ sp, t: 9 });
}
function pulseAt(zone, color) {
  const p = pulses.find((x) => x.t > 0.8) || pulses[0];
  stranger.zonePosition(zone, p.sp.position); p.sp.material.color.set(color); p.t = 0;
}
function updatePulses(dt) {
  for (const p of pulses) {
    if (p.t > 0.8) { p.sp.material.opacity = 0; continue; }
    p.t += dt; const k = p.t / 0.8;
    p.sp.scale.setScalar(0.3 + 1.6 * k); p.sp.material.opacity = 0.9 * (1 - k) * (1 - k);
  }
}
// fireflies drifting in the air in front of the watcher
const FLY_N = 70, flyGeo = new THREE.BufferGeometry(), flyPos = new Float32Array(FLY_N * 3), flySeed = [];
for (let i = 0; i < FLY_N; i++) flySeed.push([Math.random() * 20 - 10, Math.random() * 3 + 0.4, Math.random() * 16 + 2, Math.random() * 6.28, 0.3 + Math.random() * 0.6]);
flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
const flyMat = new THREE.PointsMaterial({ size: 0.16, map: GLOW, color: '#d6ff7a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const flies = new THREE.Points(flyGeo, flyMat); flies.frustumCulled = false; scene.add(flies);
const flyFwd = new THREE.Vector3(), flyRight = new THREE.Vector3(), flyUp = new THREE.Vector3(0, 1, 0);
function updateFlies(t) {
  camera.getWorldDirection(flyFwd); flyFwd.y = 0; flyFwd.normalize(); flyRight.crossVectors(flyFwd, flyUp);
  for (let i = 0; i < FLY_N; i++) {
    const [x, y, z, ph, sp] = flySeed[i];
    const px = x + Math.sin(t * sp + ph) * 0.8, py = y + Math.sin(t * sp * 1.3 + ph * 2) * 0.35, pz = z + Math.cos(t * sp * 0.7 + ph) * 0.8;
    flyPos[i * 3] = camera.position.x + flyRight.x * px + flyFwd.x * pz;
    flyPos[i * 3 + 1] = Math.max(0.3, camera.position.y - 2.2 + py);
    flyPos[i * 3 + 2] = camera.position.z + flyRight.z * px + flyFwd.z * pz;
  }
  flyGeo.attributes.position.needsUpdate = true;
  flyMat.opacity = 0.55 + 0.35 * Math.sin(t * 3.1);
}

// film look: cold, drained colours, grain, vignette and a faint projector flicker
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.07 }, uFlicker: { value: 1 }, uDesat: { value: 0.38 }, uVignette: { value: 0.95 }, uRes: { value: new THREE.Vector2(1, 1) } },
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
// The disguised monster lives in its own layer (1). It is drawn alone, blurred, and laid over the scene;
// then only the parts you have uncovered are drawn again, sharp, on top.
const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const figRT = new THREE.WebGLRenderTarget(1, 1), sharpRT = new THREE.WebGLRenderTarget(1, 1);
const blurA = new THREE.WebGLRenderTarget(1, 1), blurB = new THREE.WebGLRenderTarget(1, 1);
const blurPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } }, vertexShader: QUAD_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv) * 0.19648;
      c += (texture2D(tDiffuse, vUv + uDir * 1.41176) + texture2D(tDiffuse, vUv - uDir * 1.41176)) * 0.29691;
      c += (texture2D(tDiffuse, vUv + uDir * 3.29412) + texture2D(tDiffuse, vUv - uDir * 3.29412)) * 0.09447;
      c += (texture2D(tDiffuse, vUv + uDir * 5.17647) + texture2D(tDiffuse, vUv - uDir * 5.17647)) * 0.01038;
      gl_FragColor = c;
    }`,
});
const figPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tFig: { value: blurB.texture }, tSharp: { value: sharpRT.texture }, uOn: { value: 0 } }, vertexShader: QUAD_VS,
  fragmentShader: `uniform sampler2D tDiffuse, tFig, tSharp; uniform float uOn; varying vec2 vUv;
    void main() {
      vec4 s = texture2D(tDiffuse, vUv);
      if (uOn < 0.5) { gl_FragColor = s; return; }
      vec4 f = texture2D(tFig, vUv), k = texture2D(tSharp, vUv);
      vec3 c = s.rgb * (1.0 - f.a) + f.rgb;
      c = c * (1.0 - k.a) + k.rgb;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
figPass.uniforms.tFig.value = blurB.texture; figPass.uniforms.tSharp.value = sharpRT.texture;   // ShaderPass does not copy render target textures
composer.addPass(figPass);
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
// one disguised real monster per kind; the one walking is `stranger`
const walkers = Object.fromEntries(CLASSES.map((c) => { const w = makeDisguised(c); w.group.visible = false; scene.add(w.group); return [c, w]; }));
let stranger = walkers.Zombie;
const owl = makeOwl(); owl.group.position.set(-2.15, 3.63, 0.42); owl.group.userData.baseY = 3.63; owl.group.scale.setScalar(0.62); scene.add(owl.group);
const owlLight = new THREE.PointLight('#a9bde0', 3, 4, 1.5); owlLight.position.set(-2.0, 4.3, 1.8); scene.add(owlLight);   // on the left gate post, beside the lantern


function resize() {
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  sharpRT.setSize(db.x, db.y); figRT.setSize(Math.ceil(db.x / 2), Math.ceil(db.y / 2));
  blurA.setSize(Math.ceil(db.x / 2), Math.ceil(db.y / 2)); blurB.setSize(Math.ceil(db.x / 2), Math.ceil(db.y / 2));
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
    cam.wantPos.set(0, 2.3, 3.4); cam.wantLook.set(0, narrow ? 1.0 : 1.25, -3); cam.wantFov = narrow ? 66 : 50;
  } else if (G.state === 'play' && stranger.group.visible) {
    // you watch from behind your gate; asking a question zooms the spyglass onto that body part
    const s = stranger.group.position;
    cam.wantPos.set(0, narrow ? 3.4 : 3.6, narrow ? 13 : 11);
    if (G.lookZone) {
      const whole = G.lookZone === 'height', zone = whole ? 'chest' : G.lookZone;
      stranger.zonePosition(zone, vTmp); cam.wantLook.copy(vTmp);
      if (whole) cam.wantLook.y = s.y + 1.3 * stranger.group.scale.y;
      const dist = cam.wantLook.distanceTo(cam.wantPos), span = whole ? 3.6 : G.lookZone === 'blood' ? 1.9 : 1.1;
      cam.wantFov = THREE.MathUtils.clamp(2 * Math.atan(span / 2 / dist) * 180 / Math.PI * (narrow ? 1.6 : 1), 2.5, 45);
    } else {
      const dist = Math.hypot(s.x, s.z - cam.wantPos.z);
      cam.wantFov = THREE.MathUtils.clamp(2 * Math.atan(8 / dist) * 180 / Math.PI, narrow ? 46 : 23, narrow ? 60 : 40);
      const halfH = dist * Math.tan(cam.wantFov * Math.PI / 360);
      cam.wantLook.set(s.x * 0.5, s.y + 1.3 - halfH * (narrow ? 0.34 : 0.24), s.z);    // keep the monster in the open space above the cards
    }
  } else {
    cam.wantPos.set(0, narrow ? 7 : 6.2, narrow ? 12 : 10); cam.wantLook.set(0, 1.2, -20);
  }
}

// ============================================================
// Game state
// ============================================================
const G = {
  state: 'title', night: 0, hearts: MAX_HEARTS, coins: 12, score: 0, streak: 0,
  upgrades: { favor: false, draught: false },
  monster: null, progress: 0, asked: new Set(), asking: null, queue: [], inNight: 0, paused: false,
  resolveTimer: 0, resolveMode: null, actor: null, u: 0.86, lead: 0, noDamage: false,
  flipped: new Set(), owlZone: null, owlFinal: false, tipShown: false, missed: false, tried: new Set(),
  stats: { met: 0, right: 0, oracleRight: 0, hints: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, bestStreak: 0, questions: 0 },
};

function hintCost() { return G.upgrades.favor ? 3 : HINT_COST; }

function newGame() {
  Object.assign(G, { night: 0, hearts: MAX_HEARTS, coins: 12, score: 0, streak: 0, upgrades: { favor: false, draught: false }, tipShown: false,
    stats: { met: 0, right: 0, oracleRight: 0, hints: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, bestStreak: 0, questions: 0 } });
  showNightIntro();
}

function pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
function pickClass() { let r = Math.random(); for (const c of CLASSES) { r -= CLASS_WEIGHT[c]; if (r < 0) return c; } return 'Zombie'; }
function buildQueue(n) {
  const q = [], used = new Set(), cfg = NIGHTS[n];
  while (q.length < cfg.count) {
    const m = Math.random() < cfg.trick ? pick(TRICKS) : pick(FOLLOW[pickClass()]);
    if (!used.has(m)) { used.add(m); q.push(m); }
  }
  if (n === NIGHTS.length - 1) q[q.length - 1] = pick(FOLLOW[pickClass()]);     // the Monster King always follows its rules
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
    <div><dt>Gate</dt><dd>${G.hearts}/${MAX_HEARTS}</dd></div>
    <div><dt>Questions</dt><dd>${G.night >= 2 ? 3 : 4} each</dd></div>
    <div><dt>Tricksters</dt><dd>${cfg.trick ? Math.round(cfg.trick * 100) + '%' : 'none'}</dd></div>`;
  $('#hud').hidden = true;
  show('nightIntro');
  setTimeout(() => $('#introGo').focus(), 50);
}

function startNight() {
  G.queue = buildQueue(G.night); G.inNight = 0; G.state = 'play';
  lantern.on = true;
  hideScreens(); $('#hud').hidden = false; nextMonster();
}

function nextMonster() {
  if (G.queue.length === 0) return endNight();
  G.monster = G.queue.shift(); G.inNight++;
  const tutorial = tutorialWanted() && tutorialMonster();
  if (tutorial) G.monster = tutorial;
  Object.assign(G, { progress: 0, asked: new Set(), asking: null, resolveMode: null, owlZone: null, owlFinal: false, lead: 1.2, missed: false, tried: new Set() });
  Object.values(walkers).forEach((w) => { w.group.visible = false; });
  stranger = walkers[G.monster.cls]; stranger.reset(); stranger.group.visible = true;
  G.boss = G.night === NIGHTS.length - 1 && G.queue.length === 0;
  stranger.setBoss(G.boss);
  Sound.startMusic();
  G.lookZone = null; G.lookTimer = 0;
  if (G.actor) G.actor.group.visible = false;
  cameraMode = 'game';
  resetClues(); resetCards(); setCardsEnabled(true); updateCards(false);
  updateHud(); updateDistance();
  if (G.boss) { banner('<strong>The Monster King</strong><span>Triple points. No second chance: a wrong guess costs 2 lanterns</span>', 'bad', 4500); Sound.sting(); cam.shake = 0.5; }
  else if (tutorial) banner('');
  else if (G.night === 0 && !G.tipShown) banner(`${isTouch ? 'Tap' : 'Click'} its face, hands, shadow or eyes to ask a question`, 'tip', 6000);
  else banner(`Monster ${G.inNight} of ${NIGHTS[G.night].count}`, 'tip', 1600);
  placeOnPath(stranger.group, 0);
  setCameraTargets(0); cam.fov = cam.wantFov; cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook);
  if (tutorial) startTutorial(); else tutorialNextMonster();
}

function walkSeconds() {
  return NIGHTS[G.night].walk * (G.upgrades.draught ? 1.15 : 1);
}
function placeOnPath(obj, progress) {
  const u = 0.55 - progress * 0.5;                               // from the forest edge to just before the gate
  if (obj === stranger.group) G.u = u;
  const p = PATH.getPointAt(Math.max(0, Math.min(1, u)));
  obj.position.set(p.x, pathLift(u), p.z);
  const ahead = PATH.getPointAt(Math.max(0, u - 0.01));
  obj.lookAt(ahead.x, obj.position.y, ahead.z);
}

// ---------- questions: four buttons above the cards (or click the body part) ----------
function resetClues() {
  $('#clues').innerHTML = QUESTIONS.map((q) => `
    <li><button type="button" class="chip" data-q="${q}"><span class="chip-label">${Q[q].where}</span><span class="chip-value">${Q[q].label.toLowerCase()}?</span></button></li>`).join('');
  $$('.chip').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
}
function isAsked(q) { return G.asked.has(q); }
// after an answer, every card shows just that rule for a moment, so you can see why cards turn over
let peekTimer;
function peekRule(q) { const hud = $('#hud'); hud.dataset.peek = q; clearTimeout(peekTimer); peekTimer = setTimeout(() => { delete hud.dataset.peek; }, 2800); }
function setRules(on) {
  $('#hud').classList.toggle('show-rules', on); $('#rulesBtn').setAttribute('aria-pressed', String(on));
  safeSet('boowho-rules', on ? '1' : '0');
}
function ask(q) {
  if (G.state !== 'play' || G.paused || G.resolveMode || !G.monster || !QUESTIONS.includes(q) || isAsked(q) || G.asking) return;
  if (G.asked.size >= maxQuestions()) { banner(`Only ${maxQuestions()} questions tonight. Pick a card`, 'bad', 2400); return; }
  if (TUT.on && (TUT.step === 'intro' || TUT.step === 'cards' || (TUT.step === 'face' && q !== 'rot'))) return;   // the tutorial waits for its step
  G.asking = { q, t: 0 }; G.lookZone = q; G.lookTimer = 99; Sound.question(); tutorialAsking();
  const chip = $(`.chip[data-q="${q}"]`); if (chip) chip.classList.add('asking');
}
function answer(q) {
  const m = G.monster, lv = levelOf(m, q), word = levelWord(q, lv), chip = $(`.chip[data-q="${q}"]`);
  G.asked.add(q); G.asking = null; G.stats.questions++; G.lookTimer = 1.5;
  chip.classList.remove('asking'); chip.classList.add('found'); chip.disabled = true;
  chip.querySelector('.chip-value').innerHTML = q === 'color' ? `<span class="swatch" style="background:${GLOW_COLORS[m.color]}"></span>${word}` : `<span class="chip-q">${Q[q].label.toLowerCase()}: </span>${word}`;
  peekRule(q);
  if (q === 'color') { stranger.reveal('color', m, 0); stranger.setAuraColor(GLOW_COLORS[m.color]); }
  else stranger.reveal(q, m, percentile(q, m[Q[q].field]));
  popWord(q, `${Q[q].label}: ${word}`);
  pulseAt(q, q === 'color' ? GLOW_COLORS[m.color] : '#ffc46b');
  Sound.found();
  if (G.owlZone === q) { G.owlZone = null; $('#owlMark').hidden = true; }
  $$(`.rule-row[data-q="${q}"]`).forEach((row) => { row.dataset.answer = lv; });      // show the answer on every card
  if (G.asked.size >= maxQuestions()) $$('.chip:not(.found)').forEach((c) => { c.disabled = true; c.classList.add('locked'); c.querySelector('.chip-value').textContent = 'no more'; });
  updateCards(true);
  tutorialAnswer();
  if (!G.tipShown) { G.tipShown = true; setTimeout(() => { if (G.state === 'play' && !G.resolveMode && ($('#banner').hidden || !$('#banner').classList.contains('owl'))) banner('Cards that don’t match turn over. Each question makes it walk faster', 'tip', 3600); }, 900); }
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

// ---------- monster cards: each card shows its monster's rules ----------
function ruleRows(c) {
  return QUESTIONS.map((q) => `<span class="rule-row" data-q="${q}"><i>${Q[q].label}</i>${[0, 1, 2, 3].map((lv) =>
    `<b class="${RULES[c][q].includes(lv) ? 'on' : ''}" data-lv="${lv}"${q === 'color' ? ` style="--glow:${GLOW_COLORS[TELLS.colors[lv]]}"` : ''} title="${levelWord(q, lv)}"></b>`).join('')}</span>`).join('');
}
function buildCards() {
  $('#cards').innerHTML = CLASSES.map((c, i) => `
    <button class="card" data-cls="${c}" id="card-${c}" type="button" aria-label="${WEAPONS[c].name}, for the ${c}">
      <span class="card-inner">
        <span class="card-face"><img class="c-tool" src="${WEAPON_ICONS[c]}" alt="">
          <span class="c-info"><span class="c-name">${WEAPONS[c].name}</span><span class="c-for">${c}</span><span class="c-rules">${ruleRows(c)}</span></span></span>
        <span class="card-back"><span class="c-back-name">${WEAPONS[c].name}</span><span class="c-for">${c}</span><span class="c-back-note"></span></span>
      </span>
    </button>`).join('');
  $$('.card').forEach((b) => b.addEventListener('click', () => choose(b.dataset.cls)));
}
function setCardsEnabled(on) { $$('.card').forEach((b) => { b.disabled = !on; }); }
function resetCards() {
  G.flipped = new Set();
  $$('.card').forEach((b, i) => { b.style.setProperty('--d', `${i * 70}ms`); b.classList.remove('flipped', 'right', 'wrong', 'answer', 'last', 'shake'); b.disabled = false; });
  $$('.rule-row').forEach((r) => { delete r.dataset.answer; });
}
function upCards() { return CLASSES.filter((c) => !G.flipped.has(c)); }
function updateCards(withSound) {
  if (!G.monster) return;
  const m = G.monster; let changed = false;
  for (const c of CLASSES) {
    if (G.flipped.has(c)) continue;
    const bad = [...G.asked].find((q) => !fits(c, m, q));
    if (!bad) continue;
    G.flipped.add(c); changed = true;
    const card = $(`#card-${c}`); card.classList.add('flipped');
    card.querySelector('.c-back-note').textContent = `${Q[bad].label}: not ${levelWord(bad, levelOf(m, bad))}`;
  }
  const up = upCards();
  if (changed && withSound) Sound.flip();
  $$('.card').forEach((b) => b.classList.toggle('last', up.length === 1 && b.dataset.cls === up[0]));
  if (withSound) {
    if (up.length === 1) banner(`Only the ${WEAPONS[up[0]].name.toLowerCase()} fits. Use it!`, 'owl', 3200);
    else if (up.length === 0) banner('No card fits. A trickster! Make your best guess', 'bad', 3800);
    else if (G.asked.size >= maxQuestions()) banner(`${up.length} cards fit. Pick one, or ask the Owl`, 'owl', 4000);
  }
  updateOwlButton();
}

// ---------- the Owl: which question to ask next, and (at the end) which card is more common ----------
function updateOwlButton() {
  const busy = G.state !== 'play' || G.resolveMode !== null;
  const done = G.asked.size >= maxQuestions(), up = upCards();
  $('#askOracle').innerHTML = `<span>${done ? '<span class="owl-long">Which one?</span><span class="owl-short">Owl</span>' : 'Owl'}</span><small>${hintCost()} coins</small>`;
  $('#askOracle').disabled = busy || G.coins < hintCost() || up.length === 1 || G.owlZone !== null || G.owlFinal || !!G.asking;
}
function askedMask() { return QUESTIONS.reduce((a, q, i) => a | (isAsked(q) ? 1 << i : 0), 0); }
function askedLevels() { return QUESTIONS.map((q) => (isAsked(q) ? levelOf(G.monster, q) : -1)); }
function bestQuestion() { return Brain.advise(askedLevels()); }     // highest expected information gain (notebook 05)
// the Owl's belief about the monster, shifted to how often the game sends each monster
function owlBelief(m, mask) { return Brain.toGame(Brain.predictSync(m, mask), CLASS_WEIGHT); }
function owlBars(p, pool) {
  const tot = pool.reduce((a, c) => a + p[CLASSES.indexOf(c)], 0) || 1;
  return pool.map((c) => ({ c, v: p[CLASSES.indexOf(c)] / tot })).sort((a, b) => b.v - a.v);
}
async function askOracle() {
  if ($('#askOracle').disabled) return;
  G.coins -= hintCost(); G.stats.hints++;
  const warn = G.night >= 2 && isTrick(G.monster) ? '<span>Careful, this one breaks a rule</span>' : '';
  Sound.oracle(); owl.ask(); updateHud();
  if (G.asked.size < maxQuestions()) {
    const a = bestQuestion(); G.owlZone = a.q; updateOwlButton();
    banner(`<strong>${Q[a.q].ask}</strong>${warn}`, 'owl', 4000);
  } else {
    // all answers are in: the network says which card is most likely
    G.owlFinal = true; updateOwlButton();
    const m = G.monster, mask = askedMask(), pool = upCards().length ? upCards() : CLASSES;
    const bars = owlBars(owlBelief(m, mask), pool).slice(0, 3), top = bars[0].c;
    if (G.monster !== m || G.resolveMode) return;
    banner(`<strong>Most likely the ${WEAPONS[top].name.toLowerCase()}</strong>
      <span class="mind">${bars.map((b) => `<i class="m-row"><b>${b.c}</b><i class="m-bar"><i style="width:${(b.v * 100).toFixed(0)}%"></i></i><em>${Math.round(b.v * 100)}%</em></i>`).join('')}</span>${warn}`, 'owl', 5000);
  }
}

// ---------- choosing a card: the jump scare ----------
function choose(cls) {
  if (G.state !== 'play' || G.resolveMode || G.tried.has(cls)) return;
  if (TUT.on && TUT.step !== 'play') return;       // the tutorial asks you to find out first
  if (TUT.hold) { TUT.hold = false; coach(null); }
  Sound.click();
  // first wrong card: the monster rushes 10 m closer and you get one more try (not tricksters, not the Monster King)
  if (cls !== G.monster.cls && !G.missed && !isTrick(G.monster) && !G.boss) return secondChance(cls);
  useWeapon(cls); resolve(cls);
}
function secondChance(cls) {
  G.missed = true; G.tried.add(cls); G.streak = 0; G.stats.misses = (G.stats.misses || 0) + 1;
  const card = $(`#card-${cls}`);
  card.classList.add('flipped', 'shake'); card.disabled = true; card.querySelector('.c-back-note').textContent = 'wrong guess';
  G.flipped.add(cls);
  Sound.wrong(); flash('red'); cam.shake = 0.5;
  G.progress = Math.min(1, G.progress + JUMP_METERS / PATH_METERS);
  updateHud(); updateDistance(); updateCards(false);
  if (G.progress >= 1) return resolve(null);
  banner(`<strong>The ${WEAPONS[cls].name.toLowerCase()} does nothing!</strong><span>It is not a ${cls}. It rushes ${JUMP_METERS} m closer. One more try</span>`, 'bad', 3200);
}
function resolve(choice) {
  const m = G.monster, right = choice === m.cls, unused = QUESTIONS.length - G.asked.size, trick = isTrick(m);
  const owlP = owlBelief(m, askedMask()), owlTop = CLASSES[owlP.indexOf(Math.max(...owlP))];   // the Owl's guess with the same questions you asked
  G.stats.met++; if (owlTop === m.cls) G.stats.oracleRight++;
  if (trick) G.stats.tricksMet++;
  setCardsEnabled(false);
  if (choice) $(`#card-${choice}`).classList.add(right ? 'right' : 'wrong');
  if (!right) $(`#card-${m.cls}`).classList.add('answer');
  $('#ring').hidden = true; $('#owlMark').hidden = true; G.asking = null; Sound.stopMusic();

  // the lantern blazes and the monster is right there
  stranger.group.visible = false;
  cameraMode = 'scare'; setCameraTargets(0); cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook); cam.fov = cam.wantFov;
  G.actor = actors[m.cls]; G.actor.reset(); G.actor.group.visible = true; if (G.boss) G.actor.group.scale.setScalar(1.3);
  G.actor.group.position.set(0, 0, -1.6); G.actor.group.lookAt(0, 0, 8);
  flash(right ? 'gold' : 'white'); cam.shake = right ? 0.15 : 0.45;
  if (right) Sound.correct(); else { Sound.sting(); setTimeout(() => Sound.wrong(), 350); }

  let msg, sub = '';
  if (right) {
    G.noDamage = false; G.streak++; G.stats.bestStreak = Math.max(G.stats.bestStreak, G.streak);
    const mult = Math.min(5, G.streak);
    const coins = 3 + unused * 2 + (mult >= 3 ? 2 : 0) + (G.boss ? 20 : 0), pts = Math.round((100 + unused * 60) * mult * (trick ? 2 : 1) * (G.boss ? 3 : 1) * (G.missed ? 0.5 : 1));
    G.coins += coins; G.stats.earned += coins; G.score += pts; G.stats.right++;
    if (trick) G.stats.tricksBeaten++;
    G.resolveMode = 'defeat';
    msg = G.boss ? `The Monster King falls!` : `${m.cls}! Right`;
    if (G.streak === 3) setTimeout(() => { if (G.state === 'play') banner('<strong>Streak x3</strong><span>Monsters walk faster while your streak lasts</span>', 'owl', 3200); }, 3200);
    sub = `+${pts} points · +${coins} coins${mult > 1 ? ` · streak x${mult}` : ''}`;
    setTimeout(() => Sound.win(), 1250);
    scorePop(`+${pts}`, 'good');
  } else {
    G.streak = trick && choice ? G.streak : 0;
    G.resolveMode = 'attack'; G.noDamage = !!(trick && choice);
    msg = choice ? `It was a ${m.cls}` : `Too late! A ${m.cls}`;
    const b = brokenRules(m)[0];
    sub = G.noDamage ? `A trickster: its ${Q[b].label.toLowerCase()} broke the rule. No harm done` : G.boss ? 'The Monster King breaks 2 lanterns' : 'The gate loses a lantern';
    if (choice) { const card = $(`#card-${choice}`); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  }
  if (trick && right) sub += ' · trickster, double points';
  const owlLine = owlTop === m.cls ? `The Owl guessed ${owlTop} too` : `The Owl guessed ${owlTop}`;
  banner(`<strong>${msg}</strong><span>${sub}</span><span class="owl-line">${owlLine}</span>`, right ? 'good' : 'bad', 2800);
  G.resolveTimer = 0; updateHud();
  if (TUT.on) endTutorial(true);
}
function afterResolve() {
  if (G.actor) G.actor.group.visible = false;
  G.actor = null; G.resolveMode = null;
  if (G.hearts <= 0) return endGame(false);
  nextMonster();
}

function endNight() {
  G.state = 'shop'; stranger.group.visible = false; Sound.stopMusic(); G.upgrades.draught = false;
  if (G.night === NIGHTS.length - 1) return endGame(true);
  G.night++;
  openShop();
}

// ---------- shop ----------
const SHOP = [
  { id: 'mend', name: 'Mend the gate', text: 'Get back 1 gate lantern', cost: 25, can: () => G.hearts < MAX_HEARTS, buy: () => { G.hearts++; } },
  { id: 'favor', name: 'Feed the Owl', text: 'Owl hints cost 3 coins', cost: 30, can: () => !G.upgrades.favor, buy: () => { G.upgrades.favor = true; } },
  { id: 'draught', name: 'Sleeping draught', text: 'Next night the monsters walk 15% slower', cost: 20, can: () => !G.upgrades.draught, buy: () => { G.upgrades.draught = true; } },
];
function openShop() {
  $('#hud').hidden = true; banner('');
  $('#shopTitle').textContent = `Dawn after night ${G.night}`;
  $('#shopSub').textContent = `Next: ${NIGHTS[G.night].name}`;
  $('#shopGo').textContent = `Start night ${G.night + 1}`;
  renderShop(); updateHud(); show('shop');
}
function renderShop() {
  $('#shopCoins').textContent = G.coins;
  $('#shopItems').innerHTML = SHOP.map((it) => {
    const avail = it.can(), afford = G.coins >= it.cost;
    const label = !avail ? (it.id === 'mend' ? 'Full' : 'Owned') : `${it.cost} coins`;
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
  const today = new Date().toISOString().slice(0, 10);
  let board = []; try { board = JSON.parse(safeGet('boowho-board') || '[]'); } catch { board = []; }
  const entry = { score: G.score, night: won ? NIGHTS.length : G.night + 1, won, date: today, id: Date.now() };
  board.push(entry); board.sort((a, b) => b.score - a.score); board = board.slice(0, 5); safeSet('boowho-board', JSON.stringify(board));
  const todayBest = Math.max(Number(safeGet(`boowho-day-${today}`) || 0), G.score); safeSet(`boowho-day-${today}`, String(todayBest));
  $('#endEyebrow').textContent = won ? 'Dawn breaks' : `Night ${G.night + 1} · ${NIGHTS[G.night].name}`;
  $('#endTitle').textContent = won ? 'The village is safe' : 'The gate has fallen';
  $('#endText').textContent = won ? 'You held the gate through Halloween.' : `The monsters broke through on night ${G.night + 1}.`;
  $('#endStats').innerHTML = `
    <div><dt>Score</dt><dd>${G.score.toLocaleString()}</dd></div>
    <div><dt>Stopped</dt><dd>${s.right}/${s.met}</dd></div>
    <div><dt>Best streak</dt><dd>x${Math.min(5, s.bestStreak)}</dd></div>
    <div><dt>You vs Owl</dt><dd>${pct(s.right, s.met)}% · ${pct(s.oracleRight, s.met)}%</dd></div>`;
  $('#endVersus').textContent = !s.met ? '' : s.right > s.oracleRight ? 'You beat the Owl!'
    : s.right === s.oracleRight ? 'You tied with the Owl.' : 'The Owl did better. Ask one more question before you pick.';
  $('#endVersus').insertAdjacentHTML('beforeend', '<span class="best">The Owl only saw the answers to the questions you asked.</span>');
  $('#endVersus').insertAdjacentHTML('beforeend', `<span class="best">Best score: ${best.toLocaleString()} · ${s.met ? (s.questions / s.met).toFixed(1) : 0} questions per monster</span>`);
  $('#endBoard').innerHTML = `<h3>Best scores <small>today's record: ${todayBest.toLocaleString()}</small></h3>` + board.map((b, i) =>
    `<li class="${b.id === entry.id ? 'me' : ''}"><span>${i + 1}</span><b>${b.score.toLocaleString()}</b><em>${b.won ? 'Won' : `Night ${b.night}`}</em><time>${b.date.slice(5).replace('-', '/')}</time></li>`).join('');
  $('#end').classList.toggle('won', won);
  Sound.stopMusic();
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
  updateOwlButton();
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
  bannerTimer = setTimeout(() => { b.classList.add('out'); bannerTimer = setTimeout(() => { b.hidden = true; }, 320); }, ms);
}
function scorePop(text, kind) {
  const el = document.createElement('div'); el.className = `score-pop ${kind}`; el.textContent = text;
  $('#hud').appendChild(el); setTimeout(() => el.remove(), 1600);
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
  $('#journalPage').innerHTML = `
    <h2>${c}</h2>
    <p class="lore"><b>Spot it:</b> ${j.lore}</p>
    <p class="weapon-line"><img src="${WEAPON_ICONS[c]}" alt=""> Weapon: <b>${WEAPONS[c].name}</b></p>
    <h3>Rules <small>lit = it can have this</small></h3>
    <div class="j-rules">${QUESTIONS.map((q) => `<div class="j-rule"><span>${Q[q].label} <small>(${Q[q].where})</small></span><div>${[0, 1, 2, 3].map((lv) =>
      `<em class="${RULES[c][q].includes(lv) ? 'on' : ''}"${q === 'color' ? ` style="--glow:${GLOW_COLORS[TELLS.colors[lv]]}"` : ''}>${levelWord(q, lv)}</em>`).join('')}</div></div>`).join('')}</div>`;
}

// ---------- guided first monster: a step-by-step tutorial ----------
// The monster waits while the coach box walks you through one question, the flipping cards and the last card.
const TUT = { on: false, hold: false, step: null, timer: null };
const TUT_STEPS = ['intro', 'face', 'cards', 'more', 'play'];
const tap = () => (isTouch ? 'Tap' : 'Click');
function tutorialWanted() { return G.night === 0 && G.inNight === 1 && safeGet('boowho-tutorial') !== 'done'; }
function tutorialMonster() {       // a Ghost with no rot: one question leaves two cards, the next leaves one
  const pool = FOLLOW.Ghost.filter((m) => levelOf(m, 'rot') === 0);
  return pool.length ? pick(pool) : null;
}
// one coach box with an arrow that points at what to press
function coach(html, target, buttons = [], opts = {}) {
  const c = $('#coach');
  $$('.coach-hi').forEach((e) => e.classList.remove('coach-hi'));
  clearTimeout(TUT.fade);
  if (!html) { c.classList.remove('show'); TUT.fade = setTimeout(() => { c.hidden = true; }, 200); return; }
  const dots = TUT_STEPS.includes(TUT.step) ? `<span class="coach-dots">${TUT_STEPS.map((st) => `<i class="${st === TUT.step ? 'on' : TUT_STEPS.indexOf(st) < TUT_STEPS.indexOf(TUT.step) ? 'done' : ''}"></i>`).join('')}</span>` : '';
  c.innerHTML = `${dots}<p>${html}</p><div class="coach-row">${buttons.map(([id, label, main]) => `<button type="button" class="btn small${main ? '' : ' ghost'}" data-coach="${id}">${label}</button>`).join('')}</div><span class="coach-arrow"></span>`;
  c.querySelectorAll('[data-coach]').forEach((b) => b.addEventListener('click', () => { Sound.click(); tutorialButton(b.dataset.coach); }));
  const els = target ? $$(target) : [];
  els.forEach((e) => e.classList.add('coach-hi'));
  c.hidden = false; c.style.top = ''; c.style.bottom = '';
  const r = els.length ? els.map((e) => e.getBoundingClientRect()).reduce((a, b) => ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) })) : null;
  const below = r && r.bottom < innerHeight * 0.3;              // the target is at the top of the screen: sit under it
  if (below) c.style.top = `${Math.round(r.bottom + 16)}px`;
  else c.style.bottom = `${Math.round(innerHeight - $('#dock').getBoundingClientRect().top + 16)}px`;
  c.classList.toggle('below', !!below); c.classList.toggle('no-arrow', !r || !!opts.noArrow);
  if (r) {                                                      // point the arrow at the middle of the target
    const box = c.getBoundingClientRect(), x = (r.left + r.right) / 2 - box.left;
    c.style.setProperty('--arrow-x', `${Math.max(18, Math.min(box.width - 18, x))}px`);
  }
  requestAnimationFrame(() => c.classList.add('show'));
}
const SKIP = ['skip', 'Skip'];
function tutorialStep(step) {
  TUT.step = step; $('#coach').classList.remove('show');
  const up = upCards(), name = (c) => `<b>${WEAPONS[c].name}</b>`;
  if (step === 'intro') coach('A monster is coming! Find out what it is before it reaches the gate.', '#distance', [['next', 'OK', true], SKIP]);
  if (step === 'face') coach(`${tap()} <b>Face</b> to look at its face.`, '.chip[data-q="rot"]', [SKIP]);
  if (step === 'cards') coach(`Its face has <b>no rot</b>, so the cards that can't have that flipped over. ${up.length === 2 ? `Only ${name(up[0])} and ${name(up[1])} are left.` : ''}`, up.map((c) => `#card-${c}`).join(','), [['next', 'OK', true], SKIP]);
  if (step === 'more') coach(`Ask one more question to tell them apart. ${tap()} any part.`, '.chip:not(.found)', [SKIP]);
  if (step === 'play') coach(`Only ${name(up[0])} fits. ${tap()} it!`, `#card-${up[0]}`, []);
}
function startTutorial() {
  Object.assign(TUT, { on: true, hold: false }); G.tipShown = true;
  G.progress = 0.3; G.lead = 0; placeOnPath(stranger.group, G.progress); updateDistance();
  setTimeout(() => { if (TUT.on && TUT.step === null) tutorialStep('intro'); }, 700);
}
function tutorialButton(id) {
  if (id === 'next') tutorialStep(TUT.step === 'intro' ? 'face' : 'more');
  if (id === 'skip') endTutorial(false);
  if (id === 'go') { TUT.hold = false; coach(null); }
}
function tutorialAsking() { if (TUT.on) coach(null); if (TUT.hold) { TUT.hold = false; coach(null); } }   // keep the view clear while the spyglass looks
function tutorialAnswer() {
  if (!TUT.on) return;
  clearTimeout(TUT.timer);
  TUT.timer = setTimeout(() => {                               // let the cards finish flipping first
    if (!TUT.on) return;
    if (upCards().length === 1) return tutorialStep('play');
    if (TUT.step === 'face') return tutorialStep('cards');
    tutorialStep('more');
  }, 900);
}
function endTutorial(finished) {
  TUT.on = false; TUT.step = null; safeSet('boowho-tutorial', 'done'); clearTimeout(TUT.timer);
  coach(null);
  TUT.hold = finished;             // the next monster waits until you press Start
}
function tutorialNextMonster() {
  if (!TUT.hold) return;
  setTimeout(() => {
    if (!TUT.hold || G.state !== 'play') return;
    coach('<b>You stopped it!</b> From now on monsters keep walking, so be quick. Fewer questions give more points.', null, [['go', 'Start', true]]);
  }, 500);
}

// ---------- input ----------
function bind() {
  buildCards(); buildJournal();
  $('#playBtn').addEventListener('click', () => { Sound.init(); Sound.startAmbience(); Sound.click(); newGame(); });
  $('#howBtn').addEventListener('click', () => { show('howto'); });
  $('#journalBtn').addEventListener('click', () => { cameraMode = 'journal'; openJournalPage(focusIndex); show('journal'); });
  $$('.back-title').forEach((b) => b.addEventListener('click', goTitle));
  $('#howPlay').addEventListener('click', () => { Sound.init(); Sound.startAmbience(); newGame(); });
  $('#howTutorial').addEventListener('click', () => { safeSet('boowho-tutorial', ''); Sound.init(); Sound.startAmbience(); newGame(); });
  $('#introGo').addEventListener('click', startNight);
  $('#shopGo').addEventListener('click', showNightIntro);
  $('#againBtn').addEventListener('click', newGame);
  $('#askOracle').addEventListener('click', askOracle);
  $('#rulesBtn').addEventListener('click', () => { setRules(!$('#hud').classList.contains('show-rules')); Sound.click(); });
  setRules(safeGet('boowho-rules') === '1');
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
  el.addEventListener('pointerdown', (e) => { aim(e); const z = zoneAt(); if (z) ask(z); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.state === 'play') { togglePause(); e.preventDefault(); } return; }
    if (G.state === 'play' && !G.paused) {
      const n = Number(e.key); if (n >= 1 && n <= 5) choose(CLASSES[n - 1]);
      if (e.key === 'o' || e.key === 'O') askOracle();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !G.paused) togglePause(); });
}
function zoneAt() {
  if (G.state !== 'play' || !stranger.group.visible) return null;
  lantern.ray.setFromCamera(lantern.pointer, camera);
  const h = lantern.ray.intersectObjects(stranger.zones, false).find((x) => QUESTIONS.includes(x.object.userData.zone));
  return h ? h.object.userData.zone : null;
}
function togglePause() {
  if (G.state !== 'play') return;
  G.paused = !G.paused;
  if (G.paused) { show('pause'); Sound.stopMusic(); } else { hideScreens(); if (!G.resolveMode) Sound.startMusic(); }
}
function goTitle() {
  Object.assign(TUT, { on: false, hold: false, step: null }); coach(null);
  Sound.stopMusic(); G.state = 'title'; G.paused = false; cameraMode = 'title'; world.setMood('normal');
  stranger.group.visible = false; if (G.actor) G.actor.group.visible = false; G.actor = null; G.resolveMode = null;
  showcase.forEach((a) => { a.group.visible = true; });
  $('#hud').hidden = true; banner('');
  const best = Number(safeGet('boowho-best') || 0);
  show('title');
}

// ============================================================
// Lantern, clues and monster behaviour, every frame while a stranger walks
// ============================================================
const audio = { step: 0, beat: 0 };
function updateLantern(dt, t) {
  const playing = G.state === 'play' && !G.paused && !G.resolveMode && stranger.group.visible;
  // where the lantern points: at the body part being asked about, else at the pointer (or the chest before the player aims)
  if (G.asking && playing) { stranger.zonePosition(G.asking.q, lantern.hitPoint); lantern.hit = G.asking.q; }
  else {
    if (!lantern.hasPointer && playing) { stranger.zonePosition('blood', vTmp).project(camera); lantern.pointer.set(vTmp.x, vTmp.y + 0.1); }
    lantern.ray.setFromCamera(lantern.pointer, camera);
    const hits = playing ? lantern.ray.intersectObjects(stranger.zones, false) : [];
    const h = hits.find((x) => QUESTIONS.includes(x.object.userData.zone));
    lantern.hit = h ? h.object.userData.zone : null;
    if (hits.length) lantern.hitPoint.copy(hits[0].point);
    else lantern.ray.ray.at(stranger.group.visible ? camera.position.distanceTo(stranger.group.position) : 30, lantern.hitPoint);
  }
  lantern.beam.position.copy(camera.position).add(vTmp2.set(0.6, -0.4, 0).applyQuaternion(camera.quaternion));
  lantern.beam.target.position.copy(lantern.hitPoint);
  const dist = lantern.beam.position.distanceTo(lantern.hitPoint);
  lantern.beam.angle = Math.min(0.6, Math.atan((G.asking || G.lookZone ? 0.8 : 1.6) * 1.7 / dist));
  const flick = 0.9 + 0.08 * Math.sin(t * 17) + 0.04 * Math.random();
  lantern.beam.intensity += ((playing ? (G.asking || G.lookZone ? 7 : 22) * flick : 0) - lantern.beam.intensity) * Math.min(1, dt * 12);
  lantern.glow.position.copy(lantern.beam.position); lantern.glow.intensity = playing ? 3 * flick : 0;
  $('#lanternFx').classList.toggle('on', playing);
  const ring = $('#ring'), mark = $('#owlMark');
  if (!playing) { ring.hidden = true; mark.hidden = true; return; }

  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  const toScreen = (zone) => { stranger.zonePosition(zone, vTmp).project(camera); return [(vTmp.x * 0.5 + 0.5) * w, (-vTmp.y * 0.5 + 0.5) * h]; };
  if (G.asking) {
    G.asking.t += dt;
    const [x, y] = toScreen(G.asking.q);
    ring.hidden = false; ring.classList.remove('hover'); ring.style.setProperty('--p', Math.min(1, G.asking.t / ASK_TIME).toFixed(3));
    ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; ring.dataset.label = Q[G.asking.q].label;
    if (G.asking.t >= ASK_TIME) answer(G.asking.q);
  } else if (lantern.hit && !isAsked(lantern.hit) && lantern.hasPointer && !isTouch) {
    ring.hidden = false; ring.classList.add('hover'); ring.style.setProperty('--p', '0');
    ring.style.transform = `translate(${lantern.pointerPx.x}px, ${lantern.pointerPx.y}px) translate(-50%, -50%)`;
    ring.dataset.label = `${Q[lantern.hit].label}? click`;
  } else ring.hidden = true;
  renderer.domElement.style.cursor = lantern.hit && !isAsked(lantern.hit) ? 'pointer' : 'crosshair';
  // the Owl's marker sits on the body part it suggested, until that question is asked
  if (G.owlZone) { const [x, y] = toScreen(G.owlZone); mark.hidden = false; mark.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }
  else mark.hidden = true;
}

// ============================================================
// Main loop
// ============================================================
const clock = new THREE.Clock();
const bolt = { timer: 12, t: 9, base: world.hemi.intensity };
const hudEl = $('#hud');
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * (window.__nightWatch?.timeScale || 1);
  elapsed += dt;
  const t = elapsed;

  updateLantern(dt, t);
  if (G.lookZone && !G.asking) { G.lookTimer -= dt; if (G.lookTimer <= 0 || G.resolveMode) G.lookZone = null; }
  $('#spyglass').classList.toggle('on', !!G.lookZone && G.state === 'play');
  const resolving = !!G.resolveMode; if (resolving !== hudEl.classList.contains('resolving')) hudEl.classList.toggle('resolving', resolving);
  if (G.state === 'play' && !G.paused) {
    if (!G.resolveMode) {
      const rate = speedMul() / walkSeconds();
      if (TUT.on || TUT.hold) { /* the tutorial monster waits for you */ } else if (G.lead > 0) G.lead -= dt; else G.progress += dt * rate;                  // a short pause before it starts walking
      placeOnPath(stranger.group, Math.min(1, G.progress)); stranger.animate(t, dt, false);
      updateDistance();
      audio.step -= dt; audio.beat -= dt;
      if (audio.step <= 0) { Sound.step(0.04 + 0.42 * G.progress * G.progress); audio.step = (0.3 + walkSeconds() / 70) / (rate * walkSeconds()); }
      Sound.intensity = Math.min(1, G.progress * 1.05 + (G.boss ? 0.25 : 0));
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
        if (rt >= 1.5 && rt - dt < 1.5 && !G.noDamage) { G.hearts = Math.max(0, G.hearts - (G.boss ? 2 : 1)); cam.shake = 1.0; Sound.hit(); flash('red'); updateHud(); }
      }
      if (rt > 3.0) afterResolve();
    }
  }

  showcase.forEach((a, i) => { if (a.group.visible) a.animate(t + i * 1.7, 'idle'); });
  sparkles.update(dt); updatePulses(dt); updateFlies(t);
  // lightning now and then while a night is running
  if (G.state === 'play' && !G.paused) {
    bolt.timer -= dt;
    if (bolt.timer <= 0) { bolt.timer = 16 + Math.random() * 18; bolt.t = 0; Sound.thunder(); }
  }
  if (bolt.t < 0.6) {
    bolt.t += dt; const k = bolt.t;
    const f = (k < 0.08 ? 1 : k < 0.16 ? 0.2 : k < 0.26 ? 0.8 : Math.max(0, 1 - (k - 0.26) / 0.34) * 0.4);
    world.hemi.intensity = bolt.base + f * 2.6; filmPass.uniforms.uFlicker.value = 1 + f * 0.35;
  } else if (bolt.base !== null) world.hemi.intensity = bolt.base;
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
  renderFigure();
  composer.render();
  requestAnimationFrame(frame);
}
const clearTmp = new THREE.Color();
function renderFigure() {
  const on = G.state === 'play' && stranger.group.visible && !G.resolveMode;
  figPass.uniforms.uOn.value = on ? 1 : 0;
  if (!on) return;
  const bg = scene.background; scene.background = null;
  renderer.getClearColor(clearTmp); const alpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0); camera.layers.set(1);
  renderer.setRenderTarget(figRT); renderer.clear(); renderer.render(scene, camera);
  SHARP.value = 1; stranger.sharpPass(true);
  renderer.setRenderTarget(sharpRT); renderer.clear(); renderer.render(scene, camera);
  SHARP.value = 0; stranger.sharpPass(false);
  camera.layers.set(0); scene.background = bg; renderer.setClearColor(clearTmp, alpha);
  // blur strength follows how big the figure is on screen, so it stays hard to read up close too
  const dist = camera.position.distanceTo(stranger.group.position);
  const px = (2.7 * stranger.group.scale.y) / (2 * dist * Math.tan(camera.fov * Math.PI / 360)) * figRT.height;
  const spread = THREE.MathUtils.clamp(px * 0.012, 0.8, 7);
  for (let i = 0; i < 2; i++) {
    blurPass.uniforms.uDir.value.set(spread / figRT.width, 0); blurPass.render(renderer, blurA, i ? blurB : figRT);
    blurPass.uniforms.uDir.value.set(0, spread / figRT.height); blurPass.render(renderer, blurB, blurA);
  }
  renderer.setRenderTarget(null);
}
function flash(kind = 'red') { const f = $('#flash'); f.className = kind === 'red' ? '' : kind; void f.offsetWidth; f.classList.add('on'); }

scene.traverse((o) => { if (o.isLight && !o.layers.isEnabled(1)) o.layers.enable(1); });
lantern.ray.layers.enable(1);
bind(); goTitle(); setCameraTargets(0); cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook);
$('#loading').hidden = true;
window.__nightWatchReady = true;
Brain.init();                 // load ONNX Runtime Web in the background; the JavaScript engine works until then
window.__nightWatch = { G, Brain, askOracle, choose, TUT, timeScale: 1, nextMonster, camera, renderer, figRT, sharpRT, blurB, figPass, SHARP, scene, showcase, actors, THREE, cam, world, lantern, get stranger() { return stranger; }, walkers, ask, answer, levelOf, RULES, isTrick, upCards, setCameraMode: (m) => { cameraMode = m; } };   // handle for testing
requestAnimationFrame(frame);
