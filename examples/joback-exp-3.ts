import { DEFAULT_JOBACK_TABLE, createJobackDocs, joback_heat_capacity_calc, joback_prop_calc } from "../src/index";

console.log("=== Joback properties-only and heat-capacity-only (Python exp-3 parity) ===");

const groups = {
  "-CH3": 2,
  "=CH- @ring": 3,
  "=C< @ring": 3,
  "-OH @phenol": 1,
};

const props = joback_prop_calc(groups, 18);
console.log("\nProperties-only result:");
console.log(props);

const heatCapacity = joback_heat_capacity_calc(groups, 18);
console.log("\nHeat capacity function result:");
console.log(heatCapacity);

if (heatCapacity?.value) {
  const cp300 = heatCapacity.value(300);
  console.log(`Heat capacity at 300 K: ${cp300} ${heatCapacity.unit}`);
}

const modifiedTable = DEFAULT_JOBACK_TABLE.map((row) => ({ ...row }));
modifiedTable[20].a += 5;
const injectedDocs = createJobackDocs(modifiedTable);
const injectedHeatCapacity = injectedDocs.jobackHeatCapacityCalc(groups, 18);

if (heatCapacity?.value && injectedHeatCapacity?.value) {
  console.log("\nDocs factory with injected table (modified -OH @phenol a by +5):");
  console.log({
    default_cp_300: heatCapacity.value(300),
    injected_cp_300: injectedHeatCapacity.value(300),
  });
}
