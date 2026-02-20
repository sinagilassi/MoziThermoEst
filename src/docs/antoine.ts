import type { Pressure, Temperature } from "mozithermodb-settings";
import { Antoine } from "../core/antoine";
import type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  PressureUnit,
  TemperatureUnit,
} from "../types/antoine";
import { normalizePressures, normalizeTemperatures, toKelvin } from "../utils/units";
import { isFiniteNumber } from "../utils/tools";

interface EstimateOptions {
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
}

/**
 * Estimate Antoine coefficients from typed temperature/pressure arrays.
 * @param temperatures Temperature input array.
 * @param pressures Pressure input array.
 * @param options Fit options.
 * @returns Fit result or `null` on validation/conversion failure.
 */
export function estimateCoefficients(
  temperatures: Temperature[],
  pressures: Pressure[],
  options: EstimateOptions = {},
): AntoineFitResult | null {
  if (!Array.isArray(temperatures) || !Array.isArray(pressures)) return null;
  if (temperatures.length !== pressures.length || temperatures.length < 3) return null;
  if (!temperatures.every((t) => isFiniteNumber(t?.value) && typeof t?.unit === "string")) return null;
  if (!pressures.every((p) => isFiniteNumber(p?.value) && typeof p?.unit === "string")) return null;

  const tK = normalizeTemperatures(temperatures);
  const pPa = normalizePressures(pressures);
  if (!tK || !pPa) return null;

  const result = Antoine.fitAntoine(tK, pPa, {
    ...options,
    TUnit: "K",
    pUnit: "Pa",
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

  const loaded = Antoine.loadExperimentalData(experimentalData, temperatureUnit, pressureUnit);
  if (loaded.temperaturesK.length === 0 || loaded.pressuresPa.length === 0) return null;

  const result = Antoine.fitAntoine(loaded.temperaturesK, loaded.pressuresPa, {
    ...options,
    TUnit: "K",
    pUnit: "Pa",
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
  const pressureUnit = options.pressureUnit ?? "Pa";

  let TK: number;
  try {
    TK = toKelvin(temperature.value, temperature.unit as TemperatureUnit);
  } catch {
    return null;
  }

  const calcRes = Antoine.calc(TK, "K", A, B, C, base);
  if (!calcRes) return null;

  let outputValue = calcRes.value;
  if (pressureUnit !== "Pa") {
    outputValue = Antoine.convertPressureFromPa(calcRes.value, pressureUnit);
  }

  return {
    value: outputValue,
    unit: pressureUnit,
  };
}
