// const { calcJoback } = require("mozithermoest") as typeof import("mozithermoest");
import { calcJoback } from "mozithermoest";

console.log("=== pkg-test :: Joback default data (TS) ===");

const groups: Record<string, number> = {
  "-CH3": 2,
  "=CH- @ring": 3,
  "=C< @ring": 3,
  "-OH @phenol": 1,
};

const result = calcJoback(groups, 18);
const cp300 = result.heat_capacity.value ? result.heat_capacity.value(300) : null;

console.log({
  boiling_point_temperature: result.boiling_point_temperature,
  critical_temperature: result.critical_temperature,
  critical_pressure: result.critical_pressure,
  cp300,
});
