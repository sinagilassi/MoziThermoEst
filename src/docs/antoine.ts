import type { Pressure, Temperature } from "mozithermodb-settings";
import { Antoine, assertUnitsMatch } from "@/core/antoine";
import type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  EstimateCoefficientsOptions,
  PressureUnit,
  RegressionPressureUnit,
  RegressionTemperatureUnit,
  TemperatureUnit,
} from "@/types/antoine";
import {
  convertUnit,
  normalizePressuresToUnit,
  normalizeTemperaturesToUnit,
} from "@/utils/units";
import { isFiniteNumber } from "@/utils/tools";

interface EstimateOptions extends EstimateCoefficientsOptions {
  base?: AntoineBase;
  fitInLogSpace?: boolean;
  weights?: number[];
  x0?: [number, number, number];
  bounds?: [[number, number, number], [number, number, number]];
  maxNfev?: number;
  validate?: boolean;
  minMarginKelvin?: number;
  loss?: AntoineLoss;
  fScale?: number;
}

interface EstimateFromFileOptions extends EstimateOptions {
  temperatureUnit?: TemperatureUnit;
  pressureUnit?: PressureUnit;
}

interface CalcVaporPressureOptions {
  base?: AntoineBase;
  pressureUnit?: PressureUnit;
  pressure_unit?: PressureUnit;
  regression_temperature_unit?: RegressionTemperatureUnit;
  regression_pressure_unit?: RegressionPressureUnit;
  fit?: AntoineFitResult;
}

/**
 * SECTION: Estimate Antoine coefficients from typed temperature/pressure arrays.
 * @param temperatures Temperature input array.
 * @param pressures Pressure input array.
 * @param options Fit options.
 * @returns Fit result or `null` on validation/conversion failure.
 */
export function estimateCoefficients(
  temperatures: Temperature[],
  pressures: Pressure[],
  regressionTemperatureUnit: TemperatureUnit,
  regressionPressureUnit: PressureUnit,
  options: EstimateOptions = {},
): AntoineFitResult | null {
  // NOTE: basic validation of input data; if any checks fail, return null
  if (!Array.isArray(temperatures) || !Array.isArray(pressures)) return null;
  if (temperatures.length !== pressures.length || temperatures.length < 3) return null;
  if (!temperatures.every((t) => isFiniteNumber(t?.value) && typeof t?.unit === "string")) return null;
  if (!pressures.every((p) => isFiniteNumber(p?.value) && typeof p?.unit === "string")) return null;

  // NOTE: regression units
  if (!regressionTemperatureUnit || !regressionPressureUnit) return null;

  // NOTE: init arrays for regression data in regression units; if normalization fails, return null
  let tReg: number[];
  let pReg: number[];

  // NOTE: normalize input data to regression units; if this fails, return null
  try {
    tReg = normalizeTemperaturesToUnit(temperatures, regressionTemperatureUnit);
    pReg = normalizePressuresToUnit(pressures, regressionPressureUnit);
  } catch {
    return null;
  }

  // NOTE: perform fit
  const result = Antoine.fitAntoine(tReg, pReg, {
    ...options,
    regression_temperature_unit: regressionTemperatureUnit,
    regression_pressure_unit: regressionPressureUnit,
  });
  return result.success || result.A !== null ? result : null;
}

/**
 * Estimate Antoine coefficients from CSV experimental data.
 * @param experimentalData CSV file path.
 * @param options File and fit options.
 * @returns Fit result or `null` when file load/fit fails.
 */
export function estimateCoefficientsFromExperimentalData(
  experimentalData: string,
  options: EstimateFromFileOptions = {},
): AntoineFitResult | null {
  const temperatureUnit = options.temperatureUnit ?? "K";
  const pressureUnit = options.pressureUnit ?? "Pa";
  const regressionTemperatureUnit = options.regression_temperature_unit;
  const regressionPressureUnit = options.regression_pressure_unit;
  if (!regressionTemperatureUnit || !regressionPressureUnit) return null;

  const loaded = Antoine.loadExperimentalData(experimentalData, temperatureUnit, pressureUnit);
  if (loaded.temperaturesK.length === 0 || loaded.pressuresPa.length === 0) return null;

  let tReg: number[];
  let pReg: number[];
  try {
    tReg = loaded.temperaturesK.map((v) => convertUnit(v, "K", regressionTemperatureUnit));
    pReg = loaded.pressuresPa.map((v) => convertUnit(v, "Pa", regressionPressureUnit));
  } catch {
    return null;
  }

  const result = Antoine.fitAntoine(tReg, pReg, {
    ...options,
    regression_temperature_unit: regressionTemperatureUnit,
    regression_pressure_unit: regressionPressureUnit,
  });
  return result.success || result.A !== null ? result : null;
}

/**
 * Calculate vapor pressure from temperature and Antoine coefficients.
 * @param temperature Input temperature object.
 * @param A Antoine coefficient A.
 * @param B Antoine coefficient B.
 * @param C Antoine coefficient C.
 * @param options Calculation options.
 * @returns Calculated pressure or `null` on failure.
 */
export function calcVaporPressure(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  options: CalcVaporPressureOptions = {},
): Pressure | null {
  if (!temperature || !isFiniteNumber(temperature.value) || typeof temperature.unit !== "string") return null;
  if (![A, B, C].every((v) => Number.isFinite(v))) return null;

  const base = options.base ?? "log10";
  const pressureUnit = options.pressure_unit ?? options.pressureUnit ?? "Pa";
  const fit = options.fit;
  const fitTUnit = fit?.T_unit_internal ?? fit?.TUnitInternal;
  const fitPUnit = fit?.p_unit ?? fit?.pUnit;

  const regressionTemperatureUnit = options.regression_temperature_unit ?? fitTUnit;
  const regressionPressureUnit = options.regression_pressure_unit ?? fitPUnit;
  if (!regressionTemperatureUnit || !regressionPressureUnit) return null;

  if (fit && fitTUnit && fitPUnit) {
    assertUnitsMatch(fit, regressionTemperatureUnit, regressionPressureUnit);
  }

  let TReg: number;
  try {
    TReg = convertUnit(temperature.value, temperature.unit, regressionTemperatureUnit);
  } catch {
    return null;
  }

  const calcRes = Antoine.calc(TReg, regressionTemperatureUnit, A, B, C, base, regressionPressureUnit);
  if (!calcRes) return null;

  let outputValue = calcRes.value;
  if (pressureUnit !== regressionPressureUnit) {
    outputValue = convertUnit(calcRes.value, regressionPressureUnit, pressureUnit);
  }

  return {
    value: outputValue,
    unit: pressureUnit,
  };
}
