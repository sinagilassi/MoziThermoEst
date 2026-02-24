import type { JobackGroupContributionFields } from "../src/index";
import { calcJoback } from "../src/index";

console.log("=== Example Joback Group Contributions Usage ===");

const fieldPayload: JobackGroupContributionFields = {
  methyl: { value: 10.5 },
  methylene: { value: 8.2 },
  tertiary_CH: { value: 0 },
};
console.log("\nField-name payload:");
console.log(fieldPayload);

const aliasPayload = {
  "-CH3": { value: 10.5 },
  "-CH2- @non-ring": { value: 8.2 },
  ">CH- @non-ring": { value: 0 },
};
console.log("\nAlias payload (canonical CSV aliases):");
console.log(aliasPayload);

const quickResult = calcJoback({ "-CH3": 2, "-CH2- @non-ring": 1 }, 8);
console.log("\nQuick calculation example:");
console.log({
  boiling_point_temperature: quickResult.boiling_point_temperature,
  critical_pressure: quickResult.critical_pressure,
});

