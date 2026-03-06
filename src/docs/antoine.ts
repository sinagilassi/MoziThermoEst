// import libs
import type { Pressure, Temperature } from "mozithermodb-settings";
// ! LOCALS
import {
  Antoine,
  calcVaporPressure as calcVaporPressureCanonical,
  calcVaporPressureWithUnits as calcVaporPressureWithUnitsCanonical,
  fitAntoine as fitAntoineCanonical,
  loadExperimentalDataFromCsvText,
} from "@/core/antoine";
import type {
  AntoineFitResultCompat,
  CalcVaporPressureOptions,
  EstimateFromFileOptions,
  EstimateOptions,
} from "@/types/antoine";
import { fromPascal, normalizePressures, normalizeTemperatures } from "@/utils/units";
import { isFiniteNumber } from "@/utils/tools";

/**
 * Maps public camelCase estimate options to the canonical option shape
 * expected by the core Antoine fitting implementation.
 *
 * This adapter is intentionally local to keep compatibility helpers in this
 * module decoupled from internal naming conventions.
 *
 * @param options - Optional fitting controls provided by external callers.
 * @returns Canonical fitting options object with snake_case keys where required.
 */
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
 * Estimates Antoine coefficients from typed temperature and pressure arrays.
 *
 * Input values are normalized to Kelvin and Pascal before fitting. The function
 * preserves legacy compatibility by returning `null` rather than throwing for
 * common validation and unit-conversion failures.
 *
 * @param temperatures - Experimental temperatures with explicit units.
 * @param pressures - Experimental pressures with explicit units.
 * @param options - Optional solver and robustness configuration.
 * @returns A compatibility fit report when estimation succeeds, otherwise `null`.
 *
 * Notes:
 * - Temperature and pressure values are converted to `Kelvin` and `Pascal`, respectively, before fitting.
 */
export function estimateCoefficients(
  temperatures: Temperature[],
  pressures: Pressure[],
  options: EstimateOptions = {},
): AntoineFitResultCompat | null {
  // SECTION: Input validation
  // NOTE: check temperature and pressure values and units
  if (!Array.isArray(temperatures) || !Array.isArray(pressures)) return null;
  if (temperatures.length !== pressures.length || temperatures.length < 3) return null;
  if (!temperatures.every((t) => isFiniteNumber(t?.value) && typeof t?.unit === "string")) return null;
  if (!pressures.every((p) => isFiniteNumber(p?.value) && typeof p?.unit === "string")) return null;

  // SECTION: Normalization
  // NOTE: temperature to Kelvin [K]
  const tK = normalizeTemperatures(temperatures);
  // NOTE: pressure to Pascal [Pa]
  const pPa = normalizePressures(pressures);

  // >> check normalization success
  if (!tK || !pPa) return null;

  // SECTION: Fitting
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

  // res
  return report.success || report.A !== null ? report : null;
}

/**
 * Estimates Antoine coefficients from serialized experimental data.
 *
 * The input payload is parsed with the configured source units, converted to
 * canonical SI units, and then fitted by the core Antoine routine. Exceptions
 * from parsing, conversion, or fitting are swallowed to preserve the legacy
 * contract of returning `null` on failure.
 *
 * @param experimentalData - Serialized experimental dataset (for example CSV text).
 * @param options - Data-loading units and optional fitting configuration.
 * @returns A compatibility fit report on success, otherwise `null`.
 */
export function estimateCoefficientsFromExperimentalData(
  experimentalData: string,
  options: EstimateFromFileOptions = {},
): AntoineFitResultCompat | null {
  // SECTION: Determine source units with defaults
  // NOTE: default to Kelvin for temperature and Pascal for pressure if not provided
  const temperatureUnit = options.temperatureUnit ?? "K";
  const pressureUnit = options.pressureUnit ?? "Pa";

  // SECTION: Load, normalize, and fit
  try {
    // NOTE: load data
    const loaded = loadExperimentalDataFromCsvText(experimentalData, temperatureUnit, pressureUnit);

    // NOTE: fitting with the canonical routine, which expects Kelvin and Pascal
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

    // res
    return compat.success || compat.A !== null ? compat : null;
  } catch {
    return null;
  }
}

/**
 * Computes vapor pressure from Antoine coefficients for a single temperature.
 *
 * This wrapper provides strict argument validation and graceful failure for
 * compatibility-focused consumers. The canonical calculation is performed in
 * Pascal, then converted to the requested output pressure unit.
 *
 * @param temperature - Temperature value and unit used for evaluation.
 * @param A - Antoine coefficient `A`.
 * @param B - Antoine coefficient `B`.
 * @param C - Antoine coefficient `C`.
 * @param options - Logarithm base and desired output pressure unit.
 * @returns A typed pressure result in the requested unit, or `null` if invalid input or calculation failure occurs.
 */
export function calcVaporPressure(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  options: CalcVaporPressureOptions = {},
): Pressure | null {
  // SECTION: Input validation
  // NOTE: check temperature
  if (!temperature || !isFiniteNumber(temperature.value) || typeof temperature.unit !== "string") return null;
  // NOTE: check coefficients
  if (![A, B, C].every((value) => Number.isFinite(value))) return null;

  // SECTION: Calculation with graceful failure
  try {
    const base = options.base ?? "log10";
    const pressureUnit = options.pressureUnit ?? "Pa";

    // NOTE: calculate vapor pressure in Pascal using the canonical routine, then convert to the requested unit
    const calculated = calcVaporPressureCanonical(temperature, A, B, C, base);

    // >> set output pressure with unit conversion as needed
    const vaporPressure = pressureUnit === "Pa" ? calculated.vapor_pressure_Pa : fromPascal(calculated.vapor_pressure_Pa, pressureUnit);

    // res
    return {
      value: vaporPressure,
      unit: pressureUnit,
    };
  } catch {
    return null;
  }
}

/**
 * Canonical unit-aware Antoine vapor pressure calculator.
 *
 * Unlike the compatibility wrapper, this function delegates directly to the
 * canonical implementation and surfaces its return structure, which includes
 * converted pressure and canonicalized temperature details.
 *
 * @param temperature - Temperature value and unit to evaluate.
 * @param A - Antoine coefficient `A`.
 * @param B - Antoine coefficient `B`.
 * @param C - Antoine coefficient `C`.
 * @param options - Logarithm base and target pressure unit for conversion.
 * @returns Canonical Antoine vapor pressure result with unit-aware fields.
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
 * Fits Antoine coefficients using typed, unit-aware datasets.
 *
 * Temperatures and pressures are normalized to Kelvin and Pascal and then
 * passed to the canonical fitting function. This API throws if normalization
 * fails, making it suitable for strict-callers that prefer explicit errors.
 *
 * @param temperatures - Experimental temperatures with declared units.
 * @param pressures - Experimental pressures with declared units.
 * @param options - Optional fitting controls and robust-loss settings.
 * @returns Canonical fit result from the core Antoine solver.
 * @throws Error When typed arrays cannot be normalized to canonical units.
 */
export function fitAntoine(temperatures: Temperature[], pressures: Pressure[], options: EstimateOptions = {}) {
  // SECTION: Input validation
  if (!Array.isArray(temperatures) || !Array.isArray(pressures)) {
    throw new Error("Temperatures and pressures must be arrays.");
  }
  if (temperatures.length !== pressures.length || temperatures.length < 3) {
    throw new Error("Temperature and pressure arrays must have the same length and contain at least three points.");
  }
  if (!temperatures.every((t) => isFiniteNumber(t?.value) && typeof t?.unit === "string")) {
    throw new Error("Each temperature must have a finite numeric value and a string unit.");
  }
  if (!pressures.every((p) => isFiniteNumber(p?.value) && typeof p?.unit === "string")) {
    throw new Error("Each pressure must have a finite numeric value and a string unit.");
  }

  // SECTION: Normalization to canonical units (Kelvin and Pascal)
  const tK = normalizeTemperatures(temperatures);
  const pPa = normalizePressures(pressures);

  // >> check normalization success
  if (!tK || !pPa) {
    throw new Error("Failed to normalize typed temperature/pressure arrays.");
  }

  // SECTION: Fit with the canonical routine using mapped options
  return fitAntoineCanonical(tK, pPa, mapEstimateOptions(options));
}
