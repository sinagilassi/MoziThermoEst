/// <reference types="node" />
import path from "path";
import { fileURLToPath } from "url";
import type { Pressure, Temperature } from "mozithermodb-settings";
import {
  Antoine,
  calcVaporPressure,
  estimateCoefficients,
  estimateCoefficientsFromExperimentalData,
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

const fit = estimateCoefficients(Ts, Ps, {
  base: "log10",
  fitInLogSpace: true,
  loss: "soft_l1",
  regression_temperature_unit: T_unit,
  regression_pressure_unit: P_unit,
});

console.log("\n=== In-memory Antoine fit ===");
if (!fit || fit.A === null || fit.B === null || fit.C === null) {
  console.log("Fit failed.");
} else {
  console.log({
    A: fit.A,
    B: fit.B,
    C: fit.C,
    p_unit: fit.p_unit,
    T_unit_internal: fit.T_unit_internal,
    success: fit.success,
    message: fit.message,
    rmseLogP: fit.rmseLogP,
    r2LogP: fit.r2LogP,
    warnings: fit.warnings,
  });

  const predicted = Ts.map((t) =>
    calcVaporPressure(t, fit.A as number, fit.B as number, fit.C as number, {
      base: fit.base,
      fit,
      pressureUnit: P_unit,
    }),
  )
    .filter((x): x is Pressure => x !== null)
    .map((x) => x.value);

  console.log("First five predicted pressures [Pa]:", predicted.slice(0, 5));

  const outliers = Antoine.outlierReport(
    temperatures,
    pressures,
    fit,
    {
      TUnit: T_unit,
      pUnit: P_unit,
      topN: 5,
      residualDomain: "log",
    },
  );
  console.log("Top outlier rows:", outliers);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const data2Path = path.resolve(__dirname, "../py-pkg/PyThermoEst-main/PyThermoEst-main/examples/antoine/data-2.csv");

console.log("\n=== CSV Antoine fit (data-2.csv) ===");
const fitFromCsv = estimateCoefficientsFromExperimentalData(data2Path, {
  temperatureUnit: T_unit,
  pressureUnit: P_unit,
  base: "log10",
  regression_temperature_unit: T_unit,
  regression_pressure_unit: P_unit,
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
