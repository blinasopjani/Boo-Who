// Checks that the browser Oracle (web/js/oracle.js) gives the same probabilities
// as the Python networks, for 1,000 test monsters at every clue stage.
// Run from the notebooks folder: node ../web/tests/parity_check.mjs
import { readFileSync } from 'node:fs';
import { consult } from '../js/oracle.js';

const here = new URL('.', import.meta.url);
const model = JSON.parse(readFileSync(new URL('../data/oracle_model.json', here)));
const check = JSON.parse(readFileSync('parity_check.json'));

let worst = 0, sameTop = 0, total = 0;
check.monsters.forEach((m, i) => {
  model.stages.forEach((_, s) => {
    const got = consult(model, m, s + 1);
    const exp = check.expected[i][s];
    for (const { cls, p } of got) worst = Math.max(worst, Math.abs(p - exp[model.classes.indexOf(cls)]));
    const expTop = model.classes[exp.indexOf(Math.max(...exp))];
    if (got[0].cls === expTop) sameTop++;
    total++;
  });
});
console.log(`Compared ${total} predictions (1,000 monsters x ${model.stages.length} stages).`);
console.log(`Same top class as Python: ${sameTop} of ${total}`);
console.log(`Largest probability difference: ${worst.toExponential(2)}`);
console.log(worst < 1e-4 ? 'PASS: the browser Oracle matches Python.' : 'FAIL: check the export.');
