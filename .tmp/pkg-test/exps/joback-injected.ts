// const { DEFAULT_JOBACK_TABLE, calcJoback, createJobackCalculator } = require("mozithermoest") as typeof import("mozithermoest");
import { DEFAULT_JOBACK_TABLE, calcJoback, createJobackCalculator } from "mozithermoest";

console.log("=== pkg-test :: Joback injected data (TS) ===");

const groups: Record<string, number> = { "-CH3": 2, "-CH2- @non-ring": 1 };

const baseline = calcJoback(groups, 8);

const tunedTable = DEFAULT_JOBACK_TABLE.map((row) => ({ ...row }));
const methyl = tunedTable.find((row) => row.group === "-CH3");
if (!methyl) throw new Error("Missing -CH3 row in DEFAULT_JOBACK_TABLE");

methyl.Tb += 10;
const injected = createJobackCalculator(tunedTable).calcJoback(groups, 8);

console.log({
  default_boiling_point_temperature: baseline.boiling_point_temperature,
  injected_boiling_point_temperature: injected.boiling_point_temperature,
});
