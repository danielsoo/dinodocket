import { generateInstance, TRAIN_SEEDS, TEST_SEEDS } from "../src/lib/engine/generator";
import { evaluateStrategy, validate } from "../src/lib/engine/evaluate";
import { schedule } from "../src/lib/engine/scheduler";
import { BASELINE, mutate } from "../src/lib/engine/strategy";

const train = TRAIN_SEEDS.map(generateInstance);
const test = TEST_SEEDS.map(generateInstance);
const b = evaluateStrategy(BASELINE, train);
console.log("baseline train", b.mean.toFixed(2), b.feasibleRate, b.components);
let bad = 0;
for (const i of [...train, ...test]) { const v = validate(i, schedule(i, BASELINE)); if (v.length) { bad++; console.log(i.id, v.slice(0,3)); } }
console.log("instances with violations:", bad);
// quick hill-climb to check headroom
let best = BASELINE, bestScore = b.mean;
for (let k = 0; k < 300; k++) {
  const c = mutate(best, k + 7, 1.2);
  const e = evaluateStrategy(c, train);
  if (e.mean > bestScore) { best = c; bestScore = e.mean; }
}
console.log("hillclimb train", bestScore.toFixed(2), "test base", evaluateStrategy(BASELINE, test).mean.toFixed(2), "test best", evaluateStrategy(best, test).mean.toFixed(2));
console.log(JSON.stringify(best));
console.log(evaluateStrategy(best, train).components);
