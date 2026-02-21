/// <reference types="node" />
import path from "path";
import { fileURLToPath } from "url";
import type { Pressure, Temperature } from "mozithermodb-settings";
import {
  Antoine,
  calcVaporPressureWithUnits,
  calcVaporPressure,
  estimateCoefficients,
  estimateCoefficientsFromExperimentalData,
  fitAntoine,
} from "../src/index";

const temperatures = [298, 308, 318, 328, 338, 348, 358, 368, 378, 388, 398, 408];
const pressures = [
  3392.900018, 5738.327528, 9332.604721, 14657.31121, 22310.8695, 33018.32269, 47638.5333, 67168.53995, 92744.96477,
  125642.5053, 167269.663, 219161.9542,
];

const T_unit = "K";
const P_unit = "Pa";

const Ts: Temperature[] = temperatures.map((value) => ({ value, unit: T_unit }));
const Ps: Pressure[] = pressures.map((value) => ({ value, unit: P_unit }));

const fit = fitAntoine(temperatures, pressures, {
  base: "log10",
  fit_in_log_space: true,
  loss: "soft_l1",
});

console.log("\n=== Canonical fitAntoine (K/Pa) ===");
console.log({
  A: fit.A,
  B: fit.B,
  C: fit.C,
  p_unit: fit.p_unit,
  T_unit_internal: fit.T_unit_internal,
  success: fit.success,
  message: fit.message,
  rmse_logP: fit.rmse_logP,
  r2_logP: fit.r2_logP,
  warnings: fit.warnings,
});

const predictedPa = Ts.map((t) => calcVaporPressure(t, fit.A, fit.B, fit.C, fit.base).vapor_pressure_Pa);
console.log("First five predicted pressures [Pa]:", predictedPa.slice(0, 5));

const predictedBar = calcVaporPressureWithUnits({ value: 373.15, unit: "K" }, fit.A, fit.B, fit.C, "bar", fit.base);
console.log("Prediction at 373.15 K [bar]:", predictedBar.vapor_pressure);

const compatFit = estimateCoefficients(Ts, Ps, {
  base: "log10",
  fitInLogSpace: true,
  loss: "soft_l1",
});

console.log("\n=== Compatibility wrapper estimateCoefficients ===");
if (!compatFit || compatFit.A === null || compatFit.B === null || compatFit.C === null) {
  console.log("Compatibility fit failed.");
} else {
  const outliers = Antoine.outlierReport(temperatures, pressures, compatFit, {
    TUnit: T_unit,
    pUnit: P_unit,
    topN: 5,
    residualDomain: "log",
  });
  console.log({
    A: compatFit.A,
    B: compatFit.B,
    C: compatFit.C,
    rmseLogP: compatFit.rmseLogP,
    outliers: outliers.slice(0, 3),
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const data2Path = path.resolve(__dirname, "../py-pkg/PyThermoEst-main/PyThermoEst-main/examples/antoine/data-2.csv");

console.log("\n=== CSV Antoine fit (data-2.csv) ===");
const fitFromCsv = estimateCoefficientsFromExperimentalData(data2Path, {
  temperatureUnit: T_unit,
  pressureUnit: P_unit,
  base: "log10",
});

if (!fitFromCsv || fitFromCsv.A === null || fitFromCsv.B === null || fitFromCsv.C === null) {
  console.log("CSV fit failed.");
} else {
  console.log({
    A: fitFromCsv.A,
    B: fitFromCsv.B,
    C: fitFromCsv.C,
    success: fitFromCsv.success,
    message: fitFromCsv.message,
    rmseLogP: fitFromCsv.rmseLogP,
    warnings: fitFromCsv.warnings,
  });
}
