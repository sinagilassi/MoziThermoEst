// const { DEFAULT_JOBACK_TABLE, createJobackDocs, joback_calc } = require("mozithermoest") as typeof import("mozithermoest");
import { DEFAULT_JOBACK_TABLE, createJobackDocs, joback_calc } from "mozithermoest";

console.log("=== pkg-test :: Joback docs API (default vs calibrated, TS) ===");

const groups: Record<string, number> = {
  "-CH3": 2,
  "=CH- @ring": 3,
  "=C< @ring": 3,
  "-OH @phenol": 1,
};

const defaultResult = joback_calc(groups, 18);

const tunedTable = DEFAULT_JOBACK_TABLE.map((row) => ({ ...row }));
const phenolOH = tunedTable.find((row) => row.group === "-OH @phenol");
if (!phenolOH) throw new Error("Missing -OH @phenol row in DEFAULT_JOBACK_TABLE");

phenolOH.a += 5;
const docs = createJobackDocs(tunedTable);
const injectedResult = docs.jobackCalc(groups, 18);

const defaultCp300 = defaultResult?.heat_capacity.value ? defaultResult.heat_capacity.value(300) : null;
const injectedCp300 = injectedResult?.heat_capacity.value ? injectedResult.heat_capacity.value(300) : null;

console.log({
  default_cp_300: defaultCp300,
  injected_cp_300: injectedCp300,
});
