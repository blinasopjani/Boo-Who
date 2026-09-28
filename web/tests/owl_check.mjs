// Checks that the browser any-order Owl gives the same probabilities as Python (notebook 03).
// Run from the notebooks folder: node ../web/tests/owl_check.mjs
import { readFileSync } from 'node:fs';
import { consultMask } from '../js/oracle.js';

const here = new URL('.', import.meta.url);
const model = JSON.parse(readFileSync(new URL('../data/oracle_model.json', here)));
const owl = JSON.parse(readFileSync(new URL('../data/owl_subsets.json', here)));
const check = JSON.parse(readFileSync('owl_check.json'));
let worst = 0, n = 0;
for (const [mask, rows] of Object.entries(check.expected)) {
  check.monsters.forEach((m, i) => {
    const got = consultMask(model, owl, m, Number(mask));
    got.forEach((p, k) => { worst = Math.max(worst, Math.abs(p - rows[i][k])); }); n++;
  });
}
console.log(`Compared ${n} predictions. Largest difference: ${worst.toExponential(2)}`);
console.log(worst < 1e-3 ? 'PASS: the browser Owl matches Python.' : 'FAIL');
