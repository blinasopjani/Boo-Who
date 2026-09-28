// Boo Who? Owl (the Oracle model): runs the trained neural networks in the browser.
// The model file (oracle_model.json) is exported by notebooks/02_modeling.ipynb.
// One small network per clue stage: stage k only uses the clues revealed so far.

// Turn a raw monster into the scaled feature vector the network expects.
function prepare(model, monster, features) {
  const row = {};
  for (const col of model.numeric) {
    const r = model.train_range[col];
    const v = Math.min(Math.max(monster[col], r.min), r.max); // stay inside what the model has seen
    row[col] = (v - model.scaler[col].mean) / model.scaler[col].std;
  }
  for (const c of model.colors) row[`color_${c}`] = monster.color === c ? 1 : 0;
  return features.map((f) => row[f]);
}

function forward(layers, x) {
  let a = x;
  layers.forEach((layer, i) => {
    const out = layer.b.slice();
    for (let j = 0; j < out.length; j++) {
      for (let k = 0; k < a.length; k++) out[j] += a[k] * layer.W[k][j];
    }
    a = i < layers.length - 1 ? out.map((v) => Math.max(0, v)) : out; // relu hidden, raw logits last
  });
  const m = Math.max(...a);
  const e = a.map((v) => Math.exp(v - m));
  const s = e.reduce((p, q) => p + q, 0);
  return e.map((v) => v / s); // softmax
}

// cluesShown = how many clues are visible (0 to model.clue_order.length).
// Returns [{cls, p}] sorted from most to least likely.
export function consult(model, monster, cluesShown) {
  let probs;
  if (cluesShown <= 0) {
    probs = model.prior.slice(); // no clues yet: only how common each class is
  } else {
    const stage = model.stages[Math.min(cluesShown, model.stages.length) - 1];
    probs = forward(stage.layers, prepare(model, monster, stage.features));
  }
  return model.classes
    .map((cls, i) => ({ cls, p: probs[i] }))
    .sort((a, b) => b.p - a.p);
}

// Any-order Owl (notebook 03): one network per combination of found clues.
// mask = bit i set when clue owl.clue_order[i] has been found. Returns probabilities in model.classes order.
export function consultMask(model, owl, monster, mask) {
  if (!mask) return owl.prior.slice();
  const net = owl.nets[String(mask)];
  return forward(net.layers, prepare(model, monster, net.features));
}
