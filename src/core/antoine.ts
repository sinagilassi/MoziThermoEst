import { readFileSync } from "node:fs";
import type { Pressure, Temperature } from "mozithermodb-settings";
import { invert3x3, leastSquares, transposeMulSelf, type Vector3 } from "../solvers/leastSquares";
import { robustWeight } from "../solvers/robust";
import type {
  AntoineBase,
  AntoineFitReport,
  AntoineFitResultCompat,
  AntoineLoss,
  CalcVaporPressureResult,
  CalcVaporPressureWithUnitsResult,
  FitAntoineOptions,
  OutlierReportItem,
  OutlierReportOptions,
  PressureUnit,
  TemperatureUnit,
} from "../types/antoine";
import { finiteArray, parseCsvLine } from "../utils/tools";
import { fromPascal, toKelvin, toKelvinValue, toPa, toPascal } from "../utils/units";

const DEFAULT_BOUNDS: [[number, number, number], [number, number, number]] = [
  [-200.0, 1e-6, -1e4],
  [200.0, 1e7, 1e4],
];

const EPS = 1e-12;

export class AntoineError extends Error {
  /**
   * Creates a domain-specific Antoine error.
   *
   * @param message - Human-readable explanation of the failure.
   */
  constructor(message: string) {
    super(message);
    this.name = "AntoineError";
  }
}

/**
 * Computes the arithmetic mean of numeric values.
 *
 * @param values - Numeric vector with at least one item.
 * @returns Mean value of the input vector.
 */
const mean = (values: number[]): number => values.reduce((acc, value) => acc + value, 0) / values.length;

/**
 * Converts pressure values in Pascal to logarithmic target values.
 *
 * @param pressuresPa - Pressure observations in Pascal.
 * @param base - Logarithm base used by the Antoine model.
 * @returns Log-domain response vector used for fitting and metrics.
 */
const makeY = (pressuresPa: number[], base: AntoineBase): number[] =>
  pressuresPa.map((v) => (base === "log10" ? Math.log10(v) : Math.log(v)));

/**
 * Evaluates the Antoine equation in log-pressure form.
 *
 * @param params - Antoine parameter tuple `[A, B, C]`.
 * @param tK - Temperature vector in Kelvin.
 * @returns Predicted log-pressure values in the selected base domain.
 */
function modelLog(params: Vector3, tK: number[]): number[] {
  const [A, B, C] = params;
  return tK.map((t) => A - B / (t + C));
}

/**
 * Converts modeled log-pressure values to pressure in Pascal.
 *
 * @param yHat - Predicted log-pressure values.
 * @param base - Logarithm base used to encode `yHat`.
 * @returns Pressure predictions in Pascal.
 */
function toPressure(yHat: number[], base: AntoineBase): number[] {
  return yHat.map((v) => (base === "log10" ? 10 ** v : Math.exp(v)));
}

/**
 * Computes residuals in either log space or pressure space.
 *
 * @param params - Antoine parameter tuple `[A, B, C]`.
 * @param tK - Temperature observations in Kelvin.
 * @param pPa - Pressure observations in Pascal.
 * @param base - Logarithm base used by the model.
 * @param fitInLogSpace - Whether optimization residuals are defined in log domain.
 * @returns Residual vector for least-squares minimization.
 */
function makeResidualBase(
  params: Vector3,
  tK: number[],
  pPa: number[],
  base: AntoineBase,
  fitInLogSpace: boolean,
): number[] {
  const yHat = modelLog(params, tK);
  if (fitInLogSpace) {
    const y = makeY(pPa, base);
    return yHat.map((v, i) => v - y[i]);
  }
  const pHat = toPressure(yHat, base);
  return pHat.map((v, i) => v - pPa[i]);
}

/**
 * Calculates model quality metrics in both log-pressure and pressure domains.
 *
 * @param y - Observed log-pressure values.
 * @param yHat - Predicted log-pressure values.
 * @param pPa - Observed pressures in Pascal.
 * @param pHat - Predicted pressures in Pascal.
 * @returns Aggregate error metrics including RMSE/MAE and $R^2$ in log space.
 */
function calcMetrics(y: number[], yHat: number[], pPa: number[], pHat: number[]) {
  const logRes = yHat.map((v, i) => v - y[i]);
  const pRes = pHat.map((v, i) => v - pPa[i]);

  const rmseLogP = Math.sqrt(logRes.reduce((acc, v) => acc + v * v, 0) / logRes.length);
  const maeLogP = logRes.reduce((acc, v) => acc + Math.abs(v), 0) / logRes.length;
  const rmseP = Math.sqrt(pRes.reduce((acc, v) => acc + v * v, 0) / pRes.length);
  const maeP = pRes.reduce((acc, v) => acc + Math.abs(v), 0) / pRes.length;

  const yMean = mean(y);
  const ssRes = y.reduce((acc, v, i) => acc + (v - yHat[i]) ** 2, 0);
  const ssTot = y.reduce((acc, v) => acc + (v - yMean) ** 2, 0);
  const r2LogP = ssTot > 0 ? 1 - ssRes / ssTot : Number.NaN;

  return { rmseLogP, maeLogP, rmseP, maeP, r2LogP };
}

/**
 * Validates canonical input arrays prior to fitting.
 *
 * @param temperaturesK - Temperature data in Kelvin.
 * @param pressuresPa - Pressure data in Pascal.
 * @throws AntoineError When lengths mismatch, values are non-finite, or pressure is non-positive.
 */
function validateCanonicalInputs(temperaturesK: number[], pressuresPa: number[]): void {
  if (temperaturesK.length !== pressuresPa.length || temperaturesK.length < 3) {
    throw new AntoineError("TData and PData must have same length and at least 3 points.");
  }
  if (!finiteArray(temperaturesK) || !finiteArray(pressuresPa)) {
    throw new AntoineError("TData and PData must be finite numeric arrays.");
  }
  if (pressuresPa.some((v) => v <= 0)) {
    throw new AntoineError("Pressure values must be strictly positive in Pa.");
  }
}

/**
 * Resolves the initial parameter guess used by the nonlinear optimizer.
 *
 * If an explicit initial guess is supplied it is used as-is; otherwise a
 * heuristic seed is generated from transformed data statistics.
 *
 * @param tK - Temperature data in Kelvin.
 * @param y - Log-pressure target values.
 * @param x0 - Optional user-provided initial guess.
 * @param minMarginKelvin - Minimum allowed denominator margin for `T + C`.
 * @returns Initial parameter vector `[A0, B0, C0]`.
 */
function resolveInitialGuess(
  tK: number[],
  y: number[],
  x0: [number, number, number] | undefined,
  minMarginKelvin: number,
): Vector3 {
  if (x0) return [x0[0], x0[1], x0[2]];

  let C0 = -50.0;
  if (Math.min(...tK.map((v) => v + C0)) <= minMarginKelvin) {
    C0 = -Math.min(...tK) + 10.0;
  }

  const A0 = mean(y);
  const x = tK.map((v) => 1.0 / v);
  const xMean = mean(x);
  const yMean = mean(y);

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - xMean) * (y[i] - yMean);
    sxx += (x[i] - xMean) * (x[i] - xMean);
  }
  const slope = sxx > 0 ? sxy / sxx : -2000;

  const tMean = mean(tK);
  const ratio = (mean(tK.map((v) => v + C0)) / tMean) ** 2;
  let B0 = Math.abs(slope) * ratio;
  if (!Number.isFinite(B0) || B0 <= 1e-6) B0 = 2000.0;
  return [A0, B0, C0];
}

/**
 * Resolves robust-loss scale used for weighted residual handling.
 *
 * @param loss - Selected robust loss function.
 * @param fitInLogSpace - Whether optimization runs in log domain.
 * @param pPa - Observed pressures in Pascal.
 * @param userFScale - Optional user-provided scale override.
 * @returns Positive scale value suitable for robust weighting.
 */
function resolveFScale(loss: AntoineLoss, fitInLogSpace: boolean, pPa: number[], userFScale?: number): number {
  if (userFScale !== undefined && userFScale !== null) return Math.max(userFScale, EPS);
  if (loss === "linear") return 1.0;
  if (fitInLogSpace) return 0.02;
  const sorted = [...pPa].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  return Math.max(1.0, med * 0.02);
}

/**
 * Produces fit quality warnings based on physical and numerical heuristics.
 *
 * @param tK - Temperature data in Kelvin.
 * @param pHat - Predicted pressures in Pascal.
 * @param B - Antoine coefficient `B`.
 * @param C - Antoine coefficient `C`.
 * @param minMarginKelvin - Stability threshold for `T + C` denominator.
 * @returns A list of warning messages; empty when no warning condition is met.
 */
function getWarnings(tK: number[], pHat: number[], B: number, C: number, minMarginKelvin: number): string[] {
  const warnings: string[] = [];
  const denomMin = Math.min(...tK.map((v) => v + C));
  if (denomMin <= minMarginKelvin) {
    warnings.push(
      `Risky fit: min(T + C) = ${denomMin.toPrecision(6)} K (<= ${minMarginKelvin} K). Denominator near zero can make the fit unstable.`,
    );
  }

  const idx = tK
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t - b.t)
    .map((v) => v.i);

  for (let i = 1; i < idx.length; i += 1) {
    if (pHat[idx[i]] <= pHat[idx[i - 1]]) {
      warnings.push("Non-physical trend: fitted VaPr(T) is not strictly increasing over the data range.");
      break;
    }
  }
  if (B < 10.0) warnings.push("Unusually small B; data range may be too narrow or units may be inconsistent.");
  if (B > 1e6) warnings.push("Very large B; check units and outliers in experimental data.");
  return warnings;
}

/**
 * Approximates parameter covariance from weighted Jacobian information.
 *
 * @param cost - Final least-squares objective value.
 * @param nData - Number of fitted observations.
 * @param jacobianWeighted - Weighted Jacobian matrix from optimizer.
 * @returns $3 \times 3$ covariance matrix, or `null` if inversion fails.
 */
function covarianceFromJacobian(cost: number, nData: number, jacobianWeighted: number[][]): number[][] | null {
  const jtJ = transposeMulSelf(jacobianWeighted);
  const inv = invert3x3(jtJ);
  if (!inv) return null;
  const dof = Math.max(1, nData - 3);
  const sigma2 = (2.0 * cost) / dof;
  return inv.map((row) => row.map((v) => v * sigma2));
}

/**
 * Converts canonical fit report fields to the legacy compatibility shape.
 *
 * @param report - Canonical Antoine fit report.
 * @returns Backward-compatible report with duplicate camelCase aliases.
 */
function toCompatReport(report: AntoineFitReport): AntoineFitResultCompat {
  return {
    ...report,
    pUnit: report.p_unit,
    TUnitInternal: report.T_unit_internal,
    fitInLogSpace: report.fit_in_log_space,
    rmseLogP: report.rmse_logP,
    maeLogP: report.mae_logP,
    r2LogP: report.r2_logP,
    rmseP: report.rmse_P,
    maeP: report.mae_P,
    TminK: report.Tmin_K,
    TmaxK: report.Tmax_K,
    fScale: report.f_scale,
  };
}

/**
 * Builds a failed compatibility report populated with safe sentinel values.
 *
 * @param message - Failure message to expose to callers.
 * @param base - Logarithm base associated with the attempted fit.
 * @param loss - Loss function associated with the attempted fit.
 * @returns Compatibility report indicating unsuccessful estimation.
 */
function failedCompat(message: string, base: AntoineBase, loss: AntoineLoss): AntoineFitResultCompat {
  return {
    A: null,
    B: null,
    C: null,
    base,
    T_unit_internal: "K",
    p_unit: "Pa",
    fit_in_log_space: true,
    success: false,
    message,
    cost: Number.NaN,
    rmse_logP: Number.NaN,
    mae_logP: Number.NaN,
    r2_logP: Number.NaN,
    rmse_P: Number.NaN,
    mae_P: Number.NaN,
    cov: null,
    warnings: [],
    Tmin_K: Number.NaN,
    Tmax_K: Number.NaN,
    loss,
    f_scale: Number.NaN,
    pUnit: "Pa",
    TUnitInternal: "K",
    fitInLogSpace: true,
    rmseLogP: null,
    maeLogP: null,
    r2LogP: null,
    rmseP: null,
    maeP: null,
    TminK: null,
    TmaxK: null,
    fScale: null,
  };
}

/**
 * Fits Antoine coefficients from canonical SI-unit arrays.
 *
 * The routine validates inputs, prepares residuals in either log or pressure
 * space, runs bounded nonlinear least squares with optional robust loss, and
 * returns coefficients plus metrics and uncertainty estimates.
 *
 * @param TDataK - Temperature observations in Kelvin.
 * @param PDataPa - Pressure observations in Pascal.
 * @param options - Solver controls, bounds, weighting, and validation settings.
 * @returns Canonical fit report containing coefficients, diagnostics, and metadata.
 * @throws AntoineError When input validation or option constraints fail.
 */
export function fitAntoine(TDataK: number[], PDataPa: number[], options: FitAntoineOptions = {}): AntoineFitReport {
  const base = options.base ?? "log10";
  const fitInLogSpace = options.fit_in_log_space ?? true;
  const loss = options.loss ?? "linear";

  validateCanonicalInputs(TDataK, PDataPa);
  if (base !== "log10" && base !== "ln") {
    throw new AntoineError("base must be 'log10' or 'ln'.");
  }

  const minMarginKelvin = options.min_margin_kelvin ?? 1.0;
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const maxNfev = options.max_nfev ?? 5000;
  const staticWeights = new Array(TDataK.length).fill(1.0);

  if (options.weights) {
    if (options.weights.length !== TDataK.length || !finiteArray(options.weights)) {
      throw new AntoineError("weights must have same length as data and be finite.");
    }
    for (let i = 0; i < options.weights.length; i += 1) {
      staticWeights[i] = Math.sqrt(Math.max(options.weights[i], 0));
    }
  }

  const y = makeY(PDataPa, base);
  const x0 = resolveInitialGuess(TDataK, y, options.x0, minMarginKelvin);
  const fScale = resolveFScale(loss, fitInLogSpace, PDataPa, options.f_scale);

  const solve = leastSquares({
    x0,
    bounds,
    maxNfev,
    loss,
    fScale,
    staticWeights,
    residualFn: (params) => makeResidualBase(params, TDataK, PDataPa, base, fitInLogSpace),
  });

  const [A, B, C] = solve.x;
  const yHat = modelLog([A, B, C], TDataK);
  const pHat = toPressure(yHat, base);

  const metrics = calcMetrics(y, yHat, PDataPa, pHat);
  const warnings = options.validate === false ? [] : getWarnings(TDataK, pHat, B, C, minMarginKelvin);
  const cov = covarianceFromJacobian(solve.cost, TDataK.length, solve.jacobianWeighted);

  return {
    A,
    B,
    C,
    base,
    T_unit_internal: "K",
    p_unit: "Pa",
    fit_in_log_space: fitInLogSpace,
    success: solve.success,
    message: solve.message,
    cost: solve.cost,
    rmse_logP: metrics.rmseLogP,
    mae_logP: metrics.maeLogP,
    r2_logP: metrics.r2LogP,
    rmse_P: metrics.rmseP,
    mae_P: metrics.maeP,
    cov,
    warnings,
    Tmin_K: Math.min(...TDataK),
    Tmax_K: Math.max(...TDataK),
    loss,
    f_scale: fScale,
  };
}

/**
 * Evaluates vapor pressure at a given temperature using Antoine coefficients.
 *
 * @param temperature - Temperature value with unit descriptor.
 * @param A - Antoine coefficient `A`.
 * @param B - Antoine coefficient `B`.
 * @param C - Antoine coefficient `C`.
 * @param base - Logarithm base used by the Antoine equation.
 * @returns Vapor pressure result in Pascal with canonical temperature.
 * @throws AntoineError When coefficients are invalid, conversion fails, or computed pressure is invalid.
 */
export function calcVaporPressure(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  base: AntoineBase = "log10",
): CalcVaporPressureResult {
  if (![A, B, C].every((v) => Number.isFinite(v))) {
    throw new AntoineError("A, B and C must be finite.");
  }
  if (base !== "log10" && base !== "ln") {
    throw new AntoineError("base must be 'log10' or 'ln'.");
  }
  const temperatureK = toKelvin(temperature);
  if (!Number.isFinite(temperatureK)) {
    throw new AntoineError("Temperature conversion failed.");
  }
  const logP = A - B / (temperatureK + C);
  const pressurePa = base === "log10" ? 10 ** logP : Math.exp(logP);
  if (!Number.isFinite(pressurePa) || pressurePa <= 0) {
    throw new AntoineError("Calculated vapor pressure is invalid.");
  }
  return {
    temperature_K: temperatureK,
    vapor_pressure_Pa: pressurePa,
  };
}

/**
 * Evaluates Antoine vapor pressure and converts it to a target pressure unit.
 *
 * @param temperature - Temperature value with unit descriptor.
 * @param A - Antoine coefficient `A`.
 * @param B - Antoine coefficient `B`.
 * @param C - Antoine coefficient `C`.
 * @param pressureUnit - Desired output pressure unit.
 * @param base - Logarithm base used by the Antoine equation.
 * @returns Unit-aware vapor pressure result.
 */
export function calcVaporPressureWithUnits(
  temperature: Temperature,
  A: number,
  B: number,
  C: number,
  pressureUnit: PressureUnit = "Pa",
  base: AntoineBase = "log10",
): CalcVaporPressureWithUnitsResult {
  const calculated = calcVaporPressure(temperature, A, B, C, base);
  return {
    temperature_K: calculated.temperature_K,
    vapor_pressure: fromPascal(calculated.vapor_pressure_Pa, pressureUnit),
    unit: pressureUnit,
  };
}

/**
 * Loads and validates experimental temperature/pressure data from CSV.
 *
 * CSV input must include `Temperature` and `Pressure` headers. Parsed values
 * are converted to Kelvin and Pascal and validated for fitting suitability.
 *
 * @param experimentalDataPath - Path to CSV input file.
 * @param temperatureUnit - Unit of temperature values in the CSV.
 * @param pressureUnit - Unit of pressure values in the CSV.
 * @returns Canonical arrays `{ temperaturesK, pressuresPa }`.
 * @throws AntoineError When file format, parsing, or numeric validation fails.
 */
export function loadExperimentalData(
  experimentalDataPath: string,
  temperatureUnit: TemperatureUnit,
  pressureUnit: PressureUnit,
): { temperaturesK: number[]; pressuresPa: number[] } {
  const raw = readFileSync(experimentalDataPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new AntoineError("CSV must include a header and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const temperatureIndex = headers.findIndex((h) => h === "temperature");
  const pressureIndex = headers.findIndex((h) => h === "pressure");
  if (temperatureIndex < 0 || pressureIndex < 0) {
    throw new AntoineError("CSV must contain Temperature and Pressure headers.");
  }

  const temperaturesK: number[] = [];
  const pressuresPa: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(temperatureIndex, pressureIndex)) {
      throw new AntoineError(`Malformed CSV row at line ${i + 1}.`);
    }
    const tValue = Number(cols[temperatureIndex]);
    const pValue = Number(cols[pressureIndex]);
    if (!Number.isFinite(tValue) || !Number.isFinite(pValue)) {
      throw new AntoineError(`CSV row ${i + 1} contains non-numeric values.`);
    }
    temperaturesK.push(toKelvinValue(tValue, temperatureUnit));
    pressuresPa.push(toPa(pValue, pressureUnit));
  }

  validateCanonicalInputs(temperaturesK, pressuresPa);
  return { temperaturesK, pressuresPa };
}

/**
 * Compatibility class facade for legacy API consumers.
 *
 * Static methods in this class preserve old calling conventions and return
 * nullable/fallback outputs instead of propagating low-level errors.
 */
export class Antoine {
  /**
   * Legacy-compatible Antoine fitting entry point.
   *
   * Inputs are interpreted according to user-provided units and mapped to
   * canonical options before delegating to the modern fitter.
   *
   * @param TData - Temperature observations in user-provided unit.
   * @param PData - Pressure observations in user-provided unit.
   * @param options - Legacy fitting options and unit declarations.
   * @returns Compatibility fit report. On failure, returns an unsuccessful report with null coefficients.
   */
  static fitAntoine(
    TData: number[],
    PData: number[],
    options: {
      base?: AntoineBase;
      TUnit?: TemperatureUnit;
      pUnit?: PressureUnit;
      fitInLogSpace?: boolean;
      weights?: number[];
      x0?: [number, number, number];
      bounds?: [[number, number, number], [number, number, number]];
      maxNfev?: number;
      validate?: boolean;
      minMarginKelvin?: number;
      loss?: AntoineLoss;
      fScale?: number;
    } = {},
  ): AntoineFitResultCompat {
    const base = options.base ?? "log10";
    const loss = options.loss ?? "linear";
    try {
      const tUnit = options.TUnit ?? "K";
      const pUnit = options.pUnit ?? "Pa";
      const tK = TData.map((v) => toKelvinValue(v, tUnit));
      const pPa = PData.map((v) => toPa(v, pUnit));
      const report = fitAntoine(tK, pPa, {
        base,
        fit_in_log_space: options.fitInLogSpace,
        weights: options.weights,
        x0: options.x0,
        bounds: options.bounds,
        max_nfev: options.maxNfev,
        validate: options.validate,
        min_margin_kelvin: options.minMarginKelvin,
        loss,
        f_scale: options.fScale,
      });
      return toCompatReport(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fitting error.";
      return failedCompat(message, base, loss);
    }
  }

  /**
   * Produces an outlier ranking from an existing Antoine fit.
   *
   * Residuals can be ranked in log-pressure or pressure domain and are sorted
   * using robust weights and standardized residual magnitude.
   *
   * @param TData - Temperature observations in user-specified unit.
   * @param PData - Pressure observations in user-specified unit.
   * @param fitReport - Compatibility fit report containing valid coefficients.
   * @param options - Unit declarations and ranking controls.
   * @returns Ranked outlier report items; empty array if inputs are invalid or processing fails.
   */
  static outlierReport(
    TData: number[],
    PData: number[],
    fitReport: AntoineFitResultCompat,
    options?: { TUnit?: TemperatureUnit; pUnit?: PressureUnit } & OutlierReportOptions,
  ): OutlierReportItem[] {
    if (fitReport.A === null || fitReport.B === null || fitReport.C === null) return [];
    try {
      const TUnit = options?.TUnit ?? "K";
      const pUnit = options?.pUnit ?? "Pa";
      const topN = options?.topN ?? 10;
      const residualDomain = (options?.residualDomain ?? "log").toLowerCase();

      const tK = TData.map((v) => toKelvinValue(v, TUnit));
      const pPa = PData.map((v) => toPa(v, pUnit));
      validateCanonicalInputs(tK, pPa);

      const yHat = modelLog([fitReport.A, fitReport.B, fitReport.C], tK);
      const pHat = toPressure(yHat, fitReport.base);
      const y = makeY(pPa, fitReport.base);

      let residual: number[];
      if (residualDomain === "log") {
        residual = yHat.map((v, i) => v - y[i]);
      } else if (residualDomain === "p") {
        residual = pHat.map((v, i) => v - pPa[i]);
      } else {
        return [];
      }

      const fScale = fitReport.f_scale && fitReport.f_scale > 0 ? fitReport.f_scale : 1;
      const standardized = residual.map((v) => v / fScale);
      const robustWeights = standardized.map((z) => robustWeight(fitReport.loss, z));

      const ranked = residual
        .map((_, i) => i)
        .sort((ia, ib) => {
          if (robustWeights[ia] !== robustWeights[ib]) return robustWeights[ia] - robustWeights[ib];
          return Math.abs(standardized[ib]) - Math.abs(standardized[ia]);
        })
        .slice(0, Math.min(topN, residual.length));

      return ranked.map((i) => ({
        index: i,
        TK: tK[i],
        PInputPa: pPa[i],
        PFitPa: pHat[i],
        residual: residual[i],
        standardizedResidual: standardized[i],
        robustWeight: robustWeights[i],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Legacy-safe CSV loader that returns empty arrays instead of throwing.
   *
   * @param experimentalDataPath - Path to CSV input file.
   * @param TUnit - Unit of temperature values in the CSV.
   * @param PUnit - Unit of pressure values in the CSV.
   * @returns Canonical arrays on success, otherwise empty arrays.
   */
  static loadExperimentalData(
    experimentalDataPath: string,
    TUnit: TemperatureUnit,
    PUnit: PressureUnit,
  ): { temperaturesK: number[]; pressuresPa: number[] } {
    try {
      return loadExperimentalData(experimentalDataPath, TUnit, PUnit);
    } catch {
      return { temperaturesK: [], pressuresPa: [] };
    }
  }

  /**
   * Legacy pressure calculator returning Pascal pressure as typed object.
   *
   * @param TValue - Temperature scalar value.
   * @param TUnit - Unit for `TValue`.
   * @param A - Antoine coefficient `A`.
   * @param B - Antoine coefficient `B`.
   * @param C - Antoine coefficient `C`.
   * @param base - Logarithm base used by the Antoine equation.
   * @returns Pressure object in Pascal on success, otherwise `null`.
   */
  static calc(
    TValue: number,
    TUnit: TemperatureUnit,
    A: number,
    B: number,
    C: number,
    base: AntoineBase = "log10",
  ): Pressure | null {
    try {
      const result = calcVaporPressure({ value: TValue, unit: TUnit }, A, B, C, base);
      return { value: result.vapor_pressure_Pa, unit: "Pa" };
    } catch {
      return null;
    }
  }

  /**
   * Converts pressure from Pascal to a target pressure unit.
   *
   * @param valuePa - Pressure value in Pascal.
   * @param outputUnit - Desired output pressure unit.
   * @returns Converted pressure value.
   */
  static convertPressureFromPa(valuePa: number, outputUnit: PressureUnit): number {
    return fromPascal(valuePa, outputUnit);
  }

  /**
   * Converts typed pressure to Pascal.
   *
   * @param pressure - Typed pressure value.
   * @returns Pressure in Pascal.
   */
  static toPascal(pressure: Pressure): number {
    return toPascal(pressure);
  }

  /**
   * Converts typed temperature to Kelvin.
   *
   * @param temperature - Typed temperature value.
   * @returns Temperature in Kelvin.
   */
  static toKelvin(temperature: Temperature): number {
    return toKelvin(temperature);
  }
}
