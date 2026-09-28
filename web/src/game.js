// ============================================================
// Boo Who? · game logic, HUD and screens
// Globals from the build: ORACLE_MODEL, MONSTER_ROWS, JOURNAL, consult()
// ============================================================

const CLASSES = ORACLE_MODEL.classes;                          // Zombie, Witch, Ghost, Vampire, Mummy
const COLOR_NAMES = ORACLE_MODEL.colors;                       // green, grey, purple, white
const MONSTERS = MONSTER_ROWS.map((r) => ({
  cls: CLASSES[r[0]], height: r[1], rottingFleshPct: r[2], bloodCoverage: r[3], aura: r[4], hairLength: r[5],
  color: COLOR_NAMES[r[6]], trickster: r[7] === 1,
}));
const NORMAL_POOL = MONSTERS.filter((m) => !m.trickster), TRICK_POOL = MONSTERS.filter((m) => m.trickster);

const WEAPONS = {
  Zombie: { name: 'Shovel', icon: '⛏️', color: '#c9a24a', verb: 'The shovel sends it back to the grave' },
  Witch: { name: 'Holy water', icon: '💧', color: '#7fd4ff', verb: 'Holy water melts the spell' },
  Ghost: { name: 'Salt circle', icon: '🧂', color: '#f3e7c4', verb: 'The salt circle banishes it' },
  Vampire: { name: 'Garlic stake', icon: '🧄', color: '#ff7a7a', verb: 'Garlic and stake do the job' },
  Mummy: { name: 'Fire torch', icon: '🔥', color: '#ffb454', verb: 'The torch burns the old wraps' },
};

const PLURAL = { Zombie: 'Zombies', Witch: 'Witches', Ghost: 'Ghosts', Vampire: 'Vampires', Mummy: 'Mummies' };

const NIGHTS = [
  { name: 'First Moon', count: 5, walk: 32, trick: 0, mood: 'normal', note: '5 slow monsters. Learn the clues.' },
  { name: 'Night of Crows', count: 6, walk: 28, trick: 0, mood: 'normal', note: '6 monsters, walking faster.' },
  { name: 'Fog Night', count: 7, walk: 25, trick: 0.25, mood: 'fog', note: 'Thick fog. Tricksters appear: they fool the Owl.' },
  { name: 'Blood Moon', count: 8, walk: 22, trick: 0.35, mood: 'blood', note: 'A red moon and more tricksters.' },
  { name: 'Halloween', count: 9, walk: 19, trick: 0.45, mood: 'halloween', note: 'The last night. Survive it to win.' },
];
const PATH_METERS = 80;
const CLUE_AT = [70, 60, 50, 40, 30, 20];                      // metres from the gate where each clue appears
const MAX_HEARTS = 5;
const ORACLE_COST = 6;

// clue descriptions: words come from where the value falls among all game monsters
const CLUE_INFO = {
  hair: { label: 'Hair', field: 'hairLength', fmt: (v) => v.toFixed(1), words: ['cropped', 'short', 'shoulder-length', 'long', 'waist-long'] },
  aura: { label: 'Aura', field: 'aura', fmt: (v) => v.toFixed(2), words: ['no glow', 'dim', 'glowing', 'bright', 'blinding'] },
  color: { label: 'Glow', field: 'color' },
  height: { label: 'Height', field: 'height', fmt: (v) => v.toFixed(0), words: ['child-sized', 'short', 'average', 'tall', 'towering'] },
  rot: { label: 'Rot', field: 'rottingFleshPct', fmt: (v) => `${Math.round(v)}%`, words: ['no rot', 'patches of rot', 'half rotten', 'mostly rotten', 'falling apart'] },
  blood: { label: 'Blood', field: 'bloodCoverage', fmt: (v) => `${Math.round(v)}%`, words: ['spotless', 'spattered', 'bloodstained', 'soaked', 'drenched'] },
};
const SORTED = {};
for (const k of Object.keys(CLUE_INFO)) if (k !== 'color') SORTED[k] = MONSTERS.map((m) => m[CLUE_INFO[k].field]).sort((a, b) => a - b);
function percentile(k, v) { const a = SORTED[k]; let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; } return lo / a.length; }
function clueWord(k, v) { return CLUE_INFO[k].words[Math.min(4, Math.floor(percentile(k, v) * 5))]; }

// ---------- DOM helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function show(id) { $$('.screen').forEach((s) => { s.hidden = s.id !== id; }); }
function hideScreens() { $$('.screen').forEach((s) => { s.hidden = true; }); }
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: fine */ } }

// ---------- sound (tiny WebAudio synth, starts after the first click) ----------
const Sound = {
  ctx: null, on: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } } },
  tone(f, d = 0.2, type = 'sine', v = 0.12, slide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  clue() { this.tone(660, 0.12, 'triangle', 0.06); },
  oracle() { [880, 1175, 1480].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sine', 0.05), i * 70)); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.08), i * 90)); },
  hit() { this.tone(140, 0.45, 'sawtooth', 0.14, -90); setTimeout(() => this.tone(70, 0.5, 'square', 0.08, -30), 60); },
  click() { this.tone(420, 0.06, 'square', 0.03); },
};

// ============================================================
// Three.js setup
// ============================================================
const canvasHost = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const world = buildWorld(scene);
const sparkles = makeSparkles(scene);

// one reusable character per class for the game, plus a showcase row for the title and journal
const actors = Object.fromEntries(CLASSES.map((c) => [c, makeCharacter(c)]));
Object.values(actors).forEach((a) => { a.group.visible = false; scene.add(a.group); });
const SHOW_X = [-4.2, -2.1, 0, 2.1, 4.2];
const showcase = CLASSES.map((c, i) => {
  const a = makeCharacter(c); a.group.position.set(SHOW_X[i], 0, -8 + Math.abs(i - 2) * 0.6);
  a.group.lookAt(0, 0, 6); scene.add(a.group); return a;
});
const silhouette = makeSilhouette(); silhouette.group.visible = false; scene.add(silhouette.group);
const owl = makeOwl(); owl.group.position.set(0, 6.3, 0.05); scene.add(owl.group);

function resize() {
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 68 : 55; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// camera rigs, eased toward each frame
const cam = { pos: new THREE.Vector3(0, 3.6, 5), look: new THREE.Vector3(0, 1.6, -8), wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3(), shake: 0 };
let cameraMode = 'title', focusIndex = 2;
function setCameraTargets(t) {
  if (cameraMode === 'title') {
    const narrowT = camera.aspect < 0.8;
    cam.wantPos.set(Math.sin(t * 0.15) * 1.2, 2.6 + Math.sin(t * 0.21) * 0.2, narrowT ? 4 : 0.6);
    cam.wantLook.set(0, narrowT ? 1.2 : 2.2, -8);
  } else if (cameraMode === 'journal') {
    const p = showcase[focusIndex].group.position;
    const narrowJ = camera.aspect < 0.8; cam.wantPos.set(p.x + (narrowJ ? 0 : 0.5), narrowJ ? 2.6 : 2.3, p.z + (narrowJ ? 5.6 : 4.6)); cam.wantLook.set(p.x + (narrowJ ? 0 : 1.2), narrowJ ? 1.2 : 1.9, p.z);
  } else if (G.resolveMode && G.revealU !== null) {
    const a = G.actor.group.position, c = PATH.getPointAt(Math.max(0, G.revealU - 0.075));
    cam.wantPos.set(c.x, 2.6, c.z); cam.wantLook.set(a.x, 1.6, a.z);
  } else {
    const narrow = camera.aspect < 0.8;
    cam.wantPos.set(0, narrow ? 7 : 6.2, narrow ? 12 : 10); cam.wantLook.set(0, 1.2, -20);
  }
}

// ============================================================
// Game state
// ============================================================
const G = {
  state: 'title', night: 0, hearts: MAX_HEARTS, coins: 12, score: 0,
  upgrades: { lantern: 0, favor: false, draught: false },
  monster: null, progress: 0, cluesShown: 0, oracleShownAt: -1, queue: [], inNight: 0, paused: false,
  resolveTimer: 0, resolveMode: null, actor: null, attackFrom: null, u: 0.86, revealU: null, rushed: false,
  stats: { met: 0, right: 0, oracleRight: 0, oracleCalls: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, earlyWins: 0 },
};

function oracleCost() { return G.upgrades.favor ? 3 : ORACLE_COST; }
function clueDistances() { return CLUE_AT.map((d) => Math.min(PATH_METERS - 4, d + G.upgrades.lantern * 5)); }

function newGame() {
  Object.assign(G, { night: 0, hearts: MAX_HEARTS, coins: 12, score: 0, upgrades: { lantern: 0, favor: false, draught: false },
    stats: { met: 0, right: 0, oracleRight: 0, oracleCalls: 0, tricksMet: 0, tricksBeaten: 0, earned: 0, earlyWins: 0 } });
  showNightIntro();
}

function pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
function buildQueue(n) {
  const q = [], used = new Set(), cfg = NIGHTS[n];
  while (q.length < cfg.count) {
    const m = Math.random() < cfg.trick ? pick(TRICK_POOL) : pick(NORMAL_POOL);
    if (!used.has(m)) { used.add(m); q.push(m); }
  }
  return q;
}

function showNightIntro() {
  $('#introGo').textContent = `Start night ${G.night + 1}`;
  const cfg = NIGHTS[G.night];
  G.state = 'intro'; cameraMode = 'game'; showcase.forEach((a) => { a.group.visible = false; });
  world.setMood(cfg.mood);
  $('#introEyebrow').textContent = `Night ${G.night + 1} of ${NIGHTS.length}`;
  $('#introTitle').textContent = cfg.name;
  $('#introNote').textContent = cfg.note;
  $('#introFacts').innerHTML = `
    <div><dt>Monsters</dt><dd>${cfg.count}</dd></div>
    <div><dt>Walk time</dt><dd>${Math.round(cfg.walk * (G.upgrades.draught ? 1.15 : 1))} s</dd></div>
    <div><dt>Tricksters</dt><dd>${cfg.trick ? Math.round(cfg.trick * 100) + '%' : 'none'}</dd></div>`;
  $('#hud').hidden = false; updateHud(); resetCluePanel(); resetOracle(); setWeaponsEnabled(false);
  $('#distance').hidden = true;
  show('nightIntro');
  setTimeout(() => $('#introGo').focus(), 50);
}

function startNight() {
  G.queue = buildQueue(G.night); G.inNight = 0; G.state = 'play';
  hideScreens(); nextMonster();
}

function nextMonster() {
  if (G.queue.length === 0) return endNight();
  G.monster = G.queue.shift(); G.inNight++;
  G.progress = 0; G.cluesShown = 0; G.oracleShownAt = -1; G.resolveMode = null;
  silhouette.reset(); silhouette.group.visible = true;
  if (G.actor) G.actor.group.visible = false;
  resetCluePanel(); resetOracle(); setWeaponsEnabled(true);
  $('#distance').hidden = false; updateHud();
  placeOnPath(silhouette.group, 0);
}

function walkSeconds() { return NIGHTS[G.night].walk * (G.upgrades.draught ? 1.15 : 1); }
function placeOnPath(obj, progress) {
  const u = 0.86 - progress * 0.82;                              // from deep in the forest to just before the gate
  if (obj === silhouette.group) G.u = u;
  const p = PATH.getPointAt(Math.max(0, Math.min(1, u)));
  obj.position.set(p.x, 0, p.z);
  const ahead = PATH.getPointAt(Math.max(0, u - 0.01));
  obj.lookAt(ahead.x, 0, ahead.z);
}

// ---------- clues ----------
function resetCluePanel() {
  const d = clueDistances();
  $('#clues').innerHTML = ORACLE_MODEL.clue_order.map((k, i) => `
    <li class="clue" data-clue="${k}">
      <span class="clue-label">${CLUE_INFO[k].label}</span>
      <span class="clue-value">at ${d[i]} m</span>
    </li>`).join('');
}
function revealClue(i) {
  const k = ORACLE_MODEL.clue_order[i], m = G.monster, info = CLUE_INFO[k], li = $(`.clue[data-clue="${k}"]`);
  let text;
  if (k === 'color') {
    text = `<span class="swatch" style="background:${GLOW_COLORS[m.color]}"></span><span class="word">${m.color}</span>`;
    silhouette.setColor(m.color);
  } else {
    const v = m[info.field];
    text = `<span class="word">${clueWord(k, v)}</span><span class="num">${info.fmt(v)}</span>`;
    if (k === 'height') silhouette.setHeight(percentile('height', v));
    if (k === 'aura') silhouette.setAura(percentile('aura', v));
  }
  li.querySelector('.clue-value').innerHTML = text; li.classList.add('shown');
  Sound.clue();
  if (G.oracleShownAt >= 0) $('#oracleStale').hidden = false;
}

// ---------- Oracle ----------
function resetOracle() {
  $('#oracleResult').innerHTML = '<p class="oracle-idle">More clues, sharper answer.</p>';
  $('#oracleStale').hidden = true; updateOracleButton();
}
function updateOracleButton() {
  const b = $('#askOracle');
  b.textContent = `Ask · ${oracleCost()} coins`;
  b.disabled = G.state !== 'play' || G.resolveMode !== null || G.coins < oracleCost();
}
function askOracle() {
  if (G.state !== 'play' || G.resolveMode || G.coins < oracleCost()) return;
  G.coins -= oracleCost(); G.stats.oracleCalls++; G.oracleShownAt = G.cluesShown;
  const res = consult(ORACLE_MODEL, G.monster, G.cluesShown).slice(0, 3);
  const acc = Math.round(ORACLE_MODEL.stage_accuracy[G.cluesShown] * 100);
  $('#oracleResult').innerHTML = `
    <ol class="oracle-bars">${res.map((r) => `
      <li><span class="ob-name">${r.cls}</span><span class="ob-track"><span class="ob-fill" style="width:${Math.max(2, r.p * 100).toFixed(1)}%"></span></span><span class="ob-pct">${Math.round(r.p * 100)}%</span></li>`).join('')}
    </ol>
    <p class="oracle-note">${G.cluesShown}/6 clues · right ${acc}% of the time</p>`;
  $('#oracleStale').hidden = true;
  Sound.oracle(); owl.ask(); updateHud(); updateOracleButton();
}

// ---------- weapons ----------
function buildWeapons() {
  $('#weapons').innerHTML = CLASSES.map((c, i) => `
    <button class="weapon" data-cls="${c}" id="weapon-${c}" type="button">
      <span class="w-key">${i + 1}</span><span class="w-icon" aria-hidden="true">${WEAPONS[c].icon}</span>
      <span class="w-name">${WEAPONS[c].name}</span><span class="w-for">${c}</span>
    </button>`).join('');
  $$('.weapon').forEach((b) => b.addEventListener('click', () => choose(b.dataset.cls)));
}
function setWeaponsEnabled(on) { $$('.weapon').forEach((b) => { b.disabled = !on; b.classList.remove('picked', 'right', 'wrong'); }); }

function choose(cls) {
  if (G.state !== 'play' || G.resolveMode) return;
  Sound.click(); resolve(cls);
}

function resolve(choice) {
  const m = G.monster, right = choice === m.cls, hidden = 6 - G.cluesShown;
  const oracleTop = consult(ORACLE_MODEL, m, 6)[0].cls;
  G.stats.met++; if (oracleTop === m.cls) G.stats.oracleRight++;
  if (m.trickster) G.stats.tricksMet++;
  setWeaponsEnabled(false);
  if (choice) $(`#weapon-${choice}`).classList.add(right ? 'right' : 'wrong');
  if (!right) $(`#weapon-${m.cls}`).classList.add('picked');

  // swap the hooded shape for the real monster
  silhouette.group.visible = false;
  G.actor = actors[m.cls]; G.actor.reset(); G.actor.group.visible = true;
  G.actor.group.position.copy(silhouette.group.position);
  G.revealU = G.u; G.rushed = false;
  const camAt = PATH.getPointAt(Math.max(0, G.u - 0.075)); G.actor.group.lookAt(camAt.x, 0, camAt.z);
  sparkles.burst(G.actor.group.position, '#c9b6ff');

  let msg, sub = '';
  if (right) {
    const coins = 5 + hidden * 2, pts = 100 + hidden * 30;
    G.coins += coins; G.stats.earned += coins; G.score += pts; G.stats.right++;
    if (hidden >= 2) G.stats.earlyWins++;
    if (m.trickster) G.stats.tricksBeaten++;
    G.resolveMode = 'defeat';
    msg = `${m.cls}! The ${WEAPONS[m.cls].name.toLowerCase()} works.`;
    sub = `+${coins} coins`;
    Sound.win();
  } else {
    G.resolveMode = 'attack';
    msg = choice ? `${m.cls}! Wrong weapon.` : `Too late! The ${m.cls} hits the gate.`;
    sub = `Needed: ${WEAPONS[m.cls].name.toLowerCase()} · −1 lantern`;
  }
  if (m.trickster) sub += ` · Trickster: the Owl said ${oracleTop}`;
  toast(msg, sub, right ? 'good' : 'bad');
  G.resolveTimer = 0; $('#distance').hidden = true; updateHud(); updateOracleButton();
}

function afterResolve() {
  if (G.actor) G.actor.group.visible = false;
  G.actor = null; G.resolveMode = null; G.revealU = null;
  if (G.hearts <= 0) return endGame(false);
  nextMonster();
}

function endNight() {
  G.state = 'shop'; silhouette.group.visible = false; G.upgrades.draught = false;
  if (G.night === NIGHTS.length - 1) return endGame(true);
  G.night++;
  openShop();
}

// ---------- shop ----------
const SHOP = [
  { id: 'mend', name: 'Mend the gate', text: '+1 lantern', cost: 25, can: () => G.hearts < MAX_HEARTS, buy: () => { G.hearts++; } },
  { id: 'lantern', name: 'Brighter lantern', text: 'Clues 5 m sooner (max 2)', cost: 40, can: () => G.upgrades.lantern < 2, buy: () => { G.upgrades.lantern++; } },
  { id: 'favor', name: 'Feed the Owl', text: 'The Owl costs 3 coins, not 6', cost: 35, can: () => !G.upgrades.favor, buy: () => { G.upgrades.favor = true; } },
  { id: 'draught', name: 'Sleeping draught', text: 'Next night 15% slower', cost: 20, can: () => !G.upgrades.draught, buy: () => { G.upgrades.draught = true; } },
];
function openShop() {
  $('#hud').hidden = true; $('#toast').hidden = true;
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
  G.state = 'end'; silhouette.group.visible = false; $('#hud').hidden = true;
  const s = G.stats, pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const best = Math.max(Number(safeGet('boowho-best') || 0), G.score); safeSet('boowho-best', String(best));
  $('#endEyebrow').textContent = won ? 'Dawn breaks' : `Night ${G.night + 1} · ${NIGHTS[G.night].name}`;
  $('#endTitle').textContent = won ? 'The village is safe' : 'The gate has fallen';
  $('#endText').textContent = won ? 'You held the gate through Halloween.' : `The monsters broke through on night ${G.night + 1}.`;
  $('#endStats').innerHTML = `
    <div><dt>Score</dt><dd>${G.score.toLocaleString()}</dd></div>
    <div><dt>Stopped</dt><dd>${s.right}/${s.met}</dd></div>
    <div><dt>You</dt><dd>${pct(s.right, s.met)}%</dd></div>
    <div><dt>The Owl</dt><dd>${pct(s.oracleRight, s.met)}%</dd></div>`;
  $('#endVersus').textContent = !s.met ? '' : s.right > s.oracleRight ? 'You beat the Owl!'
    : s.right === s.oracleRight ? 'You tied with the Owl.' : 'The Owl did better. Wait for blood and rot.';
  $('#endVersus').insertAdjacentHTML('beforeend', `<span class="best">Best score: ${best.toLocaleString()}</span>`);
  $('#end').classList.toggle('won', won);
  show('end'); if (won) Sound.win(); else Sound.hit();
}

// ---------- HUD ----------
function updateHud() {
  $('#hudNight').textContent = `Night ${G.night + 1} · ${NIGHTS[G.night].name}`;
  $('#hudCount').textContent = G.state === 'play' || G.resolveMode ? `Monster ${G.inNight}/${NIGHTS[G.night].count}` : `${NIGHTS[G.night].count} monsters`;
  $('#hudCoins').textContent = G.coins;
  $('#hudScore').textContent = G.score.toLocaleString();
  $('#hearts').innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<span class="heart${i < G.hearts ? '' : ' lost'}"></span>`).join('');
  $('#hearts').setAttribute('aria-label', `Gate health ${G.hearts} of ${MAX_HEARTS}`);
  updateOracleButton();
}
function updateDistance() {
  const meters = Math.max(0, Math.round(PATH_METERS * (1 - G.progress)));
  $('#distanceText').textContent = `${meters} m`;
  $('#distanceFill').style.width = `${(G.progress * 100).toFixed(1)}%`;
  $('#distance').classList.toggle('close', meters <= 15);
}
let toastTimer;
function toast(title, sub, kind) {
  const t = $('#toast'); t.className = `toast ${kind}`; t.hidden = false;
  t.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3300);
}

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
    <p class="weapon-line"><span aria-hidden="true">${WEAPONS[c].icon}</span> Weapon: <b>${WEAPONS[c].name.toLowerCase()}</b></p>
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
function bind() {
  buildWeapons(); buildJournal();
  $('#playBtn').addEventListener('click', () => { Sound.init(); Sound.click(); newGame(); });
  $('#howBtn').addEventListener('click', () => { Sound.init(); show('howto'); });
  $('#journalBtn').addEventListener('click', () => { Sound.init(); cameraMode = 'journal'; openJournalPage(focusIndex); show('journal'); });
  $$('.back-title').forEach((b) => b.addEventListener('click', goTitle));
  $('#howPlay').addEventListener('click', () => { Sound.init(); newGame(); });
  $('#introGo').addEventListener('click', startNight);
  $('#shopGo').addEventListener('click', showNightIntro);
  $('#againBtn').addEventListener('click', newGame);
  $('#askOracle').addEventListener('click', askOracle);
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#resumeBtn').addEventListener('click', togglePause);
  $('#quitBtn').addEventListener('click', () => { G.paused = false; goTitle(); });
  $('#soundBtn').addEventListener('click', () => { Sound.init(); Sound.on = !Sound.on; $('#soundBtn').setAttribute('aria-pressed', String(!Sound.on)); $('#soundBtn').textContent = Sound.on ? 'Sound on' : 'Sound off'; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.state === 'play') { togglePause(); e.preventDefault(); } return; }
    if (G.state === 'play' && !G.paused) {
      const n = Number(e.key); if (n >= 1 && n <= 5) choose(CLASSES[n - 1]);
      if (e.key === 'o' || e.key === 'O') askOracle();
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
  silhouette.group.visible = false; if (G.actor) G.actor.group.visible = false; G.actor = null; G.resolveMode = null; G.revealU = null;
  showcase.forEach((a) => { a.group.visible = true; });
  $('#hud').hidden = true; $('#toast').hidden = true;
  const best = Number(safeGet('boowho-best') || 0);
  $('#bestLine').textContent = best ? `Best: ${best.toLocaleString()}` : '';
  show('title');
}

// ============================================================
// Main loop
// ============================================================
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * (window.__nightWatch?.timeScale || 1);
  elapsed += dt;
  const t = elapsed;

  if (G.state === 'play' && !G.paused) {
    if (!G.resolveMode) {
      G.progress += dt / walkSeconds();
      const meters = PATH_METERS * (1 - G.progress), d = clueDistances();
      while (G.cluesShown < 6 && meters <= d[G.cluesShown]) { revealClue(G.cluesShown); G.cluesShown++; }
      placeOnPath(silhouette.group, Math.min(1, G.progress)); silhouette.animate(t);
      updateDistance();
      if (G.progress >= 1) resolve(null);
    } else {
      G.resolveTimer += dt; const a = G.actor, rt = G.resolveTimer;
      if (G.resolveMode === 'defeat') {
        a.animate(t, 'idle');
        if (rt > 1.4) { const f = Math.max(0, 1 - (rt - 1.4) / 0.9); a.setFade(f); a.group.position.y += dt * 1.2; a.group.rotation.y += dt * 6; }
        if (rt > 1.4 && rt - dt <= 1.4) sparkles.burst(a.group.position, WEAPONS[a.cls].color);
      } else if (rt < 1.6) {
        a.animate(t, 'attack', 1.4);                                    // it roars where it was revealed
      } else {
        if (!G.rushed) {                                                // then rushes the gate
          G.rushed = true; G.revealU = null;
          const p = PATH.getPointAt(0.12); G.attackFrom = new THREE.Vector3(p.x, 0, p.z);
          a.group.position.copy(G.attackFrom); a.group.lookAt(0, 0, 8);
        }
        a.animate(t, rt < 2.4 ? 'attack' : 'idle', 1.6);
        if (rt < 2.4) { const k = Math.min(1, (rt - 1.6) / 0.8); a.group.position.lerpVectors(G.attackFrom, new THREE.Vector3(0, 0, -1.1), k * k); }
        if (rt >= 2.4 && rt - dt < 2.4) { G.hearts--; cam.shake = 0.6; Sound.hit(); flash(); updateHud(); }
      }
      if (rt > 3.5) afterResolve();
    }
  }

  showcase.forEach((a, i) => { if (a.group.visible) a.animate(t + i, 'idle'); });
  sparkles.update(dt);
  owl.update(t, dt, silhouette.group.visible ? silhouette.group.position : null);
  world.update(t);

  setCameraTargets(t);
  const ease = 1 - Math.pow(G.revealU !== null && G.resolveMode ? 0.003 : 0.02, dt);
  cam.pos.lerp(cam.wantPos, ease); cam.look.lerp(cam.wantLook, ease);
  camera.position.copy(cam.pos);
  if (cam.shake > 0) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.2); }
  camera.lookAt(cam.look);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function flash() { const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

bind(); goTitle();
$('#loading').hidden = true;
window.__nightWatchReady = true;
window.__nightWatch = { G, timeScale: 1 };   // handle for testing and tinkering in the browser console
requestAnimationFrame(frame);
