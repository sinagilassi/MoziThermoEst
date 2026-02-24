import type { JobackGroupContributionFields } from "../src/index";
import { joback_calc } from "../src/index";

console.log("=== Joback full property calculation (Python exp-2 parity) ===");

const aliasPayload = {
  "-CH3": { value: 2 },
  "=CH- @ring": { value: 3 },
  "=C< @ring": { value: 3 },
  "-OH @phenol": { value: 1 },
};
console.log("\nAlias payload:");
console.log(aliasPayload);

const fieldPayload: JobackGroupContributionFields = {
  methyl: { value: 2 },
  vinyl_CH_ring: { value: 3 },
  vinyl_C_ring: { value: 3 },
  phenol_OH: { value: 1 },
};
console.log("\nField-name payload:");
console.log(fieldPayload);

const groups = {
  "-CH3": 2,
  "=CH- @ring": 3,
  "=C< @ring": 3,
  "-OH @phenol": 1,
};

const result = joback_calc(groups, 18);
console.log("\nJoback result:");
console.log(result);

if (result?.heat_capacity.value) {
  const cp273 = result.heat_capacity.value(273);
  console.log(`Heat capacity at 273 K: ${cp273} ${result.heat_capacity.unit}`);
}

