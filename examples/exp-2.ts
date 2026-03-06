// import libs
import { Temperature } from "mozithermodb-settings";
import { toKelvin } from "../src";

// NOTE: Temperature
const tempC: Temperature = { value: 25, unit: "C" };
const tempK = toKelvin(tempC);
console.log(`Temperature: ${tempC} C = ${tempK} K`);