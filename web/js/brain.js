// Boo Who? · the Owl's brain (notebooks/05_owl_brain.ipynb).
// One neural network with masked inputs: it answers for any set of questions (rot, blood, height, color).
// It runs with ONNX Runtime Web (WebAssembly) when that loads, and falls back to the same maths in JavaScript.
// Globals from the build: OWL_BRAIN (weights, policy, stats), OWL_ONNX (the .onnx file, base64).

const Brain = (() => {
  const B = OWL_BRAIN, QS = B.questions, N = B.n_inputs;
  const state = { engine: 'JavaScript', session: null, ort: null, parity: null, error: null, ready: false };

  // A monster (with the questions asked so far, as a bit mask) -> the 11 numbers the network reads.
  function encode(m, mask) {
    const x = new Float32Array(N);
    ['rot', 'blood', 'height'].forEach((q, i) => {
      if (mask >> QS.indexOf(q) & 1) x[i] = (m[B.field[q]] - B.scale[q].mean) / B.scale[q].std;
    });
    if (mask >> QS.indexOf('color') & 1) x[3 + B.colors.indexOf(m.color)] = 1;
    QS.forEach((q, i) => { if (mask >> i & 1) x[7 + i] = 1; });
    return x;
  }

  function forwardJS(x) {
    let a = Array.from(x);
    B.weights.forEach((layer, li) => {
      const out = layer.b.slice();
      for (let j = 0; j < out.length; j++) for (let k = 0; k < a.length; k++) out[j] += a[k] * layer.W[k][j];
      a = li < B.weights.length - 1 ? out.map((v) => Math.max(0, v)) : out;
    });
    const mx = Math.max(...a), e = a.map((v) => Math.exp(v - mx)), s = e.reduce((p, q) => p + q, 0);
    return e.map((v) => v / s);
  }

  // Many inputs at once. Uses ONNX Runtime when it is ready.
  async function run(xs) {
    if (state.session) {
      try {
        const flat = new Float32Array(xs.length * N); xs.forEach((x, i) => flat.set(x, i * N));
        const out = await state.session.run({ monster: new state.ort.Tensor('float32', flat, [xs.length, N]) }, ['probabilities']);
        const p = out.probabilities.data, C = B.classes.length;
        return xs.map((_, i) => Array.from(p.slice(i * C, (i + 1) * C)));
      } catch (e) { state.error = String(e); }
    }
    return xs.map(forwardJS);
  }
  const predictSync = (m, mask) => forwardJS(encode(m, mask));
  const predict = async (m, mask) => (await run([encode(m, mask)]))[0];

  // The game does not meet monsters as often as the data has them (fewer Zombies), so shift the belief with Bayes' rule.
  function toGame(p, weights) {
    const q = p.map((v, i) => v * (weights[B.classes[i]] || 0) / B.train_prior[i]), s = q.reduce((a, b) => a + b, 0) || 1;
    return q.map((v) => v / s);
  }

  // Exact Shapley values: every subset of the asked questions goes through the network (at most 16 runs).
  async function explain(m, mask, cls) {
    const subs = []; for (let s = 0; s < 16; s++) if ((s & mask) === s) subs.push(s);
    const probs = await run(subs.map((s) => encode(m, s)));
    const P = {}; subs.forEach((s, i) => { P[s] = probs[i]; });
    const players = QS.map((_, i) => i).filter((i) => mask >> i & 1), k = players.length, fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
    const c = B.classes.indexOf(cls), phi = [0, 0, 0, 0];
    for (const i of players) for (const s of subs) {
      if (s >> i & 1) continue;
      const r = players.filter((j) => s >> j & 1).length;
      phi[i] += (fact(r) * fact(k - r - 1) / fact(k)) * (P[s | (1 << i)][c] - P[s][c]);
    }
    return { phi, full: P[mask], prior: P[0] };
  }

  // Expected information gain for the next question (worked out in notebook 05 for all 625 states).
  // levels: the level seen for each question, or -1 when not asked.
  function advise(levels) {
    const idx = levels.reduce((a, l, i) => a + (l + 1) * 5 ** i, 0), st = B.policy[idx];
    let best = null;
    st.gain.forEach((g, i) => { if (g !== null && (best === null || g > st.gain[best])) best = i; });
    return best === null ? null : { q: QS[best], bits: st.gain[best], share: st.h > 0 ? st.gain[best] / st.h : 0, gains: st.gain, h: st.h };
  }

  // Load ONNX Runtime Web in the background and check it agrees with the JavaScript maths.
  async function init() {
    try {
      const ort = await import('onnxruntime-web');
      let base = null; try { base = new URL('.', import.meta.resolve('onnxruntime-web')).href; } catch { /* old browser */ }
      if (base) ort.env.wasm.wasmPaths = base;
      ort.env.wasm.numThreads = 1;
      const bytes = Uint8Array.from(atob(OWL_ONNX), (ch) => ch.charCodeAt(0));
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      const test = []; for (let i = 0; i < 64; i++) test.push(encode(MONSTERS[(i * 97) % MONSTERS.length], i % 16));
      const flat = new Float32Array(test.length * N); test.forEach((x, i) => flat.set(x, i * N));
      const out = await session.run({ monster: new ort.Tensor('float32', flat, [test.length, N]) }, ['probabilities']);
      let diff = 0; test.forEach((x, i) => forwardJS(x).forEach((v, c) => { diff = Math.max(diff, Math.abs(v - out.probabilities.data[i * 5 + c])); }));
      state.parity = diff;
      if (diff > 1e-3) throw new Error(`ONNX and JavaScript disagree by ${diff}`);
      Object.assign(state, { ort, session, engine: 'ONNX Runtime Web · WebAssembly' });
    } catch (e) { state.error = String(e && e.message || e); console.warn('[Owl] ONNX Runtime not available, using the JavaScript engine:', state.error); }
    state.ready = true;
    document.dispatchEvent(new CustomEvent('owl-brain', { detail: state }));
    return state;
  }

  return { B, QS, state, encode, run, predict, predictSync, toGame, explain, advise, init };
})();
