import type { Pressure, Temperature } from "mozithermodb-settings";
import {
  Antoine,
  calcVaporPressure as calcVaporPressureCanonical,
  calcVaporPressureWithUnits as calcVaporPressureWithUnitsCanonical,
  fitAntoine as fitAntoineCanonical,
  loadExperimentalData,
} from "../core/antoine";
import type {
  AntoineFitResultCompat,
  CalcVaporPressureOptions,
  EstimateFromFileOptions,
  EstimateOptions,
} from "../types/antoine";
import { fromPascal, normalizePressures, normalizeTemperatures } from "../utils/units";
import { isFiniteNumber } from "../utils/tools";

function mapEstimateOptions(options: EstimateOptions) {
  return {
    base: options.base,
    fit_in_log_space: options.fitInLogSpace,
    weights: options.weights,
    x0: options.x0,
    bounds: options.bounds,
    max_nfev: options.maxNfev,
    validate: options.validate,
    min_margin_kelvin: options.minMarginKelvin,
    loss: options.loss,
    f_scale: options.fScale,
    metadata: options.metadata,
  };
}

/**
 * Estimate Antoine coefficients from typed temperature/pressure arrays.
 * Returns null on validation or conversion failure for compatibility.
 */
export function estimateCoefficients(
  temperatures: Temperature[],
  pressures: Pressure[],
  options: EstimateOptions = {},
): AntoineFitResultCompat | null {
  if (!Array.isArray(temperatures) || !Array.isArray(pressures)) return null;
  if (temperatures.length !== pressures.length || temperatures.length < 3) return null;
  if (!temperatures.every((t) => isFiniteNumber(t?.value) && typeof t?.unit === "string")) return null;
  if (!pressures.every((p) => isFiniteNumber(p?.value) && typeof p?.unit === "string")) return null;

  const tK = normalizeTemperatures(temperatures);
  const pPa = normalizePressures(pressures);
  if (!tK || !pPa) return null;

  const report = Antoine.fitAntoine(tK, pPa, {
    base: options.base,
    fitInLogSpace: options.fitInLogSpace,
    weights: options.weights,
    x0: options.x0,
    bounds: options.bounds,
    maxNfev: options.maxNfev,
    validate: options.validate,
    minMarginKelvin: options.minMarginKelvin,
    loss: options.loss,
    fScale: options.fScale,
  });
  return report.success || report.A !== null ? report : null;
}

/**
 * Estimate Antoine coefficients from experimental CSV file.
 * Returns null for compatibility on load/fit failure.
 */
export function estimateCoefficientsFromExperimentalData(
  experimentalData: string,
  options: EstimateFromFileOptions = {},
): AntoineFitResultCompat | null {
  const temperatureUnit = options.temperatureUnit ?? "K";
  const pressureUnit = options.pressureUnit ?? "Pa";

  try {
    const loaded = loadExperimentalData(experimentalData, temperatureUnit, pressureUnit);
    const compat = Antoine.fitAntoine(loaded.temperaturesK, loaded.pressuresPa, {
      base: options.base,
      TUnit: "K",
      pUnit: "Pa",
      fitInLogSpace: options.fitInLogSpace,
      weights: options.weights,
      x0: options.x0,
      bounds: options.bounds,
      maxNfev: options.maxNfev,
      validate: options.validate,
      minMarginKelvin: options.minMarginKelvin,
      loss: options.loss,
      fScale: options.fScale,
    });
    return compat.success || compat.A !== null ? compat : null;
  } catch {
    return null;
  }
}

/**
 * Legacy-compatible vapor pressure calculator returning typed Pressure or null.
 */
export function calcVaporPressure(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  options: CalcVaporPressureOptions = {},
): Pressure | null {
  if (!temperature || !isFiniteNumber(temperature.value) || typeof temperature.unit !== "string") return null;
  if (![A, B, C].every((value) => Number.isFinite(value))) return null;

  try {
    const base = options.base ?? "log10";
    const pressureUnit = options.pressureUnit ?? "Pa";
    const calculated = calcVaporPressureCanonical(temperature, A, B, C, base);
    return {
      value:
        pressureUnit === "Pa" ? calculated.vapor_pressure_Pa : fromPascal(calculated.vapor_pressure_Pa, pressureUnit),
      unit: pressureUnit,
    };
  } catch {
    return null;
  }
}

/**
 * Canonical typed wrapper returning converted unit plus canonical temperature.
 */
export function calcVaporPressureWithUnits(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  options: CalcVaporPressureOptions = {},
) {
  const base = options.base ?? "log10";
  const pressureUnit = options.pressureUnit ?? "Pa";
  return calcVaporPressureWithUnitsCanonical(temperature, A, B, C, pressureUnit, base);
}

/**
 * Canonical fit wrapper for typed unit-aware arrays.
 */
export function fitAntoine(temperatures: Temperature[], pressures: Pressure[], options: EstimateOptions = {}) {
  const tK = normalizeTemperatures(temperatures);
  const pPa = normalizePressures(pressures);
  if (!tK || !pPa) {
    throw new Error("Failed to normalize typed temperature/pressure arrays.");
  }
  return fitAntoineCanonical(tK, pPa, mapEstimateOptions(options));
}
