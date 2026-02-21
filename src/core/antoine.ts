import { readFileSync } from "node:fs";
import type { Pressure } from "mozithermodb-settings";
import { invert3x3, leastSquares, transposeMulSelf, type Vector3 } from "@/solvers/leastSquares";
import { robustWeight } from "@/solvers/robust";
import type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  EstimateCoefficientsOptions,
  FitAntoineOptions,
  OutlierReportItem,
  PressureUnit,
  RegressionPressureUnit,
  RegressionTemperatureUnit,
  TemperatureUnit,
} from "@/types/antoine";
import { convertUnit, fromPa, toKelvin } from "@/utils/units";
import { finiteArray, parseCsvLine } from "@/utils/tools";

const DEFAULT_BOUNDS: [[number, number, number], [number, number, number]] = [
  [-200.0, 1e-6, -1e4],
  [200.0, 1e7, 1e4],
];

const EPS = 1e-12;

/**
 * NOTE: Build an empty Antoine fit result with failure defaults.
 * @param base Logarithm base used by Antoine model.
 * @param loss Robust loss used during fitting.
 * @returns Initialized failure result object.
 */
const emptyResult = (
  base: AntoineBase = "log10",
  loss: AntoineLoss = "linear",
  regressionTemperatureUnit: RegressionTemperatureUnit,
  regressionPressureUnit: RegressionPressureUnit,
  fitInLogSpace = true,
): AntoineFitResult => ({
  A: null,
  B: null,
  C: null,
  base,
  p_unit: regressionPressureUnit,
  T_unit_internal: regressionTemperatureUnit,
  fit_in_log_space: fitInLogSpace,
  pUnit: regressionPressureUnit,
  TUnitInternal: regressionTemperatureUnit,
  fitInLogSpace,
  success: false,
  message: "",
  cost: null,
  rmse_logP: null,
  mae_logP: null,
  r2_logP: null,
  rmse_P: null,
  mae_P: null,
  rmseLogP: null,
  maeLogP: null,
  r2LogP: null,
  rmseP: null,
  maeP: null,
  cov: null,
  warnings: [],
  Tmin: null,
  Tmax: null,
  TminK: null,
  TmaxK: null,
  loss,
  f_scale: null,
  fScale: null,
});

type ResolvedFitOptions = {
  regressionTemperatureUnit: RegressionTemperatureUnit;
  regressionPressureUnit: RegressionPressureUnit;
  base: AntoineBase;
  loss: AntoineLoss;
  fitInLogSpace: boolean;
  weights?: number[];
  x0?: [number, number, number] | null;
  bounds?: [[number, number, number], [number, number, number]] | null;
  maxNfev: number;
  validate: boolean;
  minMarginKelvin: number;
  fScale?: number | null;
};

const resolveFitOptions = (
  options: FitAntoineOptions | EstimateCoefficientsOptions = {},
): ResolvedFitOptions => {
  const legacy = options as FitAntoineOptions;
  const modern = options as EstimateCoefficientsOptions;
  const regressionTemperatureUnit = modern.regression_temperature_unit;
  const regressionPressureUnit = modern.regression_pressure_unit;

  if (!regressionTemperatureUnit || !regressionPressureUnit) {
    throw new Error("regression_temperature_unit and regression_pressure_unit are required.");
  }

  const base = (modern.base ?? legacy.base ?? "log10").toLowerCase() as AntoineBase;
  const loss = (modern.loss ?? legacy.loss ?? "linear").toLowerCase() as AntoineLoss;
  const fitInLogSpace = modern.fit_in_log_space ?? legacy.fitInLogSpace ?? true;
  const maxNfev = modern.max_nfev ?? legacy.maxNfev ?? 5000;
  const minMarginKelvin = modern.min_margin_kelvin ?? legacy.minMarginKelvin ?? 1.0;
  const validate = modern.validate ?? legacy.validate ?? true;

  const x0 =
    modern.x0 !== undefined ? modern.x0 : legacy.x0 !== undefined ? legacy.x0 : null;
  const bounds =
    modern.bounds !== undefined ? modern.bounds : legacy.bounds !== undefined ? legacy.bounds : null;
  const fScale =
    modern.f_scale !== undefined ? modern.f_scale : legacy.fScale !== undefined ? legacy.fScale : null;
  const weights = modern.weights ?? legacy.weights;

  return {
    regressionTemperatureUnit,
    regressionPressureUnit,
    base,
    loss,
    fitInLogSpace,
    weights,
    x0,
    bounds,
    maxNfev,
    validate,
    minMarginKelvin,
    fScale,
  };
};

export const assertUnitsMatch = (
  fitReport: AntoineFitResult,
  regressionTemperatureUnit: RegressionTemperatureUnit,
  regressionPressureUnit: RegressionPressureUnit,
): void => {
  const tUnit = fitReport.T_unit_internal ?? fitReport.TUnitInternal;
  const pUnit = fitReport.p_unit ?? fitReport.pUnit;
  if (tUnit !== regressionTemperatureUnit || pUnit !== regressionPressureUnit) {
    throw new Error(
      `Regression unit mismatch: coefficients were fitted with ${tUnit}/${pUnit}, but ${regressionTemperatureUnit}/${regressionPressureUnit} was requested.`,
    );
  }
};

/**
 * SECTION: Antoine vapor-pressure model operations: fitting, evaluation, diagnostics, and data loading.
 */
export class Antoine {
  /**
   * NOTE: Antoine logarithmic model: `A - B / (T + C)`.
   * @param params Antoine parameter tuple `[A, B, C]`.
   * @param t Temperature values in regression temperature units.
   * @returns Log-pressure model values.
   */
  private static modelLog(params: Vector3, t: number[]): number[] {
    const [A, B, C] = params;
    return t.map((value) => A - B / (value + C));
  }

  /**
   * NOTE: Build residual vector either in log-pressure space or pressure space.
   * @param params Antoine parameter tuple `[A, B, C]`.
   * @param t Temperature values in regression temperature units.
   * @param p Pressure values in regression pressure units.
   * @param base Logarithm base.
   * @param fitInLogSpace Whether residuals are computed in log space.
   * @returns Residual vector.
   */
  private static makeResidualBase(
    params: Vector3,
    t: number[],
    p: number[],
    base: AntoineBase,
    fitInLogSpace: boolean,
  ): number[] {
    // calculate predicted logP and convert to residuals in the appropriate domain
    const yHat = Antoine.modelLog(params, t);

    // if fitInLogSpace, residuals are logP_pred - logP_exp; else residuals are P_pred - P_exp
    if (fitInLogSpace) {
      return yHat.map((v, i) => v - (base === "log10" ? Math.log10(p[i]) : Math.log(p[i])));
    }

    // convert predicted logP to P and calculate residuals in pressure space
    const pHat = yHat.map((v) => (base === "log10" ? 10 ** v : Math.exp(v)));

    // return residuals in pressure space
    return pHat.map((v, i) => v - p[i]);
  }

  /**
   * NOTE: Fit Antoine coefficients `(A, B, C)` to temperature/pressure data.
   * @param TData Temperature data points.
   * @param PData Pressure data points.
   * @param options Fit options.
   * @returns Structured fit result including coefficients and diagnostics.
   */
  static fitAntoine(
    TData: number[],
    PData: number[],
    options: FitAntoineOptions | EstimateCoefficientsOptions = {},
  ): AntoineFitResult {
    // NOTE: resolve and validate options; if resolution fails, return failure result
    const resolved = resolveFitOptions(options);

    // NOTE: extract resolved options and set up result object with defaults
    const {
      regressionTemperatureUnit,
      regressionPressureUnit,
      base,
      loss,
      fitInLogSpace,
      maxNfev,
      minMarginKelvin,
      validate,
      x0: x0Input,
      bounds: boundsInput,
      fScale: fScaleInput,
      weights,
    } = resolved;
    const out = emptyResult(base, loss, regressionTemperatureUnit, regressionPressureUnit, fitInLogSpace);

    // SECTION: validate and normalize input data; if any checks fail, return failure result
    const T = [...TData].map((x) => Number(x));
    const P = [...PData].map((x) => Number(x));

    // NOTE: basic validation of input data; if any checks fail, return failure result
    if (T.length !== P.length || T.length < 3 || !finiteArray(T) || !finiteArray(P)) {
      out.message = "TData and PData must have same length and at least 3 finite points.";
      return out;
    }

    if (base !== "log10" && base !== "ln") {
      out.message = "base must be 'log10' or 'ln'.";
      return out;
    }

    const tReg = T;
    const pReg = P;
    if (!finiteArray(tReg) || !finiteArray(pReg) || pReg.some((v) => v <= 0)) {
      out.message = "Failed to normalize units or pressure values are non-positive.";
      return out;
    }

    const staticWeights = new Array<number>(tReg.length).fill(1.0);
    if (weights !== undefined) {
      if (weights.length !== tReg.length || !finiteArray(weights)) {
        out.message = "weights must have same length as data and be finite.";
        return out;
      }
      for (let i = 0; i < weights.length; i += 1) {
        staticWeights[i] = Math.sqrt(Math.max(weights[i], 0));
      }
    }

    const y = pReg.map((v) => (base === "log10" ? Math.log10(v) : Math.log(v)));
    let x0: Vector3;
    if (x0Input) {
      x0 = [x0Input[0], x0Input[1], x0Input[2]];
    } else {
      let C0 = -50.0;
      if (Math.min(...tReg.map((v) => v + C0)) <= minMarginKelvin) C0 = -Math.min(...tReg) + 10.0;

      const A0 = y.reduce((acc, v) => acc + v, 0) / y.length;
      const x = tReg.map((v) => 1.0 / v);
      const xMean = x.reduce((acc, v) => acc + v, 0) / x.length;
      const yMean = y.reduce((acc, v) => acc + v, 0) / y.length;
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < x.length; i += 1) {
        sxy += (x[i] - xMean) * (y[i] - yMean);
        sxx += (x[i] - xMean) * (x[i] - xMean);
      }
      const m = sxx > 0 ? sxy / sxx : -2000;
      const tMean = tReg.reduce((acc, v) => acc + v, 0) / tReg.length;
      const ratio = ((tReg.reduce((acc, v) => acc + (v + C0), 0) / tReg.length) / tMean) ** 2;
      let B0 = Math.abs(m) * ratio;
      if (!Number.isFinite(B0) || B0 <= 1e-6) B0 = 2000.0;
      x0 = [A0, B0, C0];
    }

    const bounds = boundsInput ?? DEFAULT_BOUNDS;

    let fScale = fScaleInput;
    if (fScale === undefined || fScale === null) {
      if (loss !== "linear") {
        if (fitInLogSpace) {
          fScale = 0.02;
        } else {
          const sorted = [...pReg].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          fScale = Math.max(1.0, med * 0.02);
        }
      } else {
        fScale = 1.0;
      }
    }
    fScale = Math.max(fScale, EPS);

    const solve = leastSquares({
      x0,
      bounds,
      maxNfev,
      loss,
      fScale,
      staticWeights,
      residualFn: (params) => Antoine.makeResidualBase(params, tReg, pReg, base, fitInLogSpace),
    });

    const [A, B, C] = solve.x;
    const yHat = Antoine.modelLog([A, B, C], tReg);
    const pHat = yHat.map((v) => (base === "log10" ? 10 ** v : Math.exp(v)));
    const logRes = yHat.map((v, i) => v - y[i]);
    const pRes = pHat.map((v, i) => v - pReg[i]);

    const rmseLogP = Math.sqrt(logRes.reduce((acc, v) => acc + v * v, 0) / logRes.length);
    const maeLogP = logRes.reduce((acc, v) => acc + Math.abs(v), 0) / logRes.length;
    const rmseP = Math.sqrt(pRes.reduce((acc, v) => acc + v * v, 0) / pRes.length);
    const maeP = pRes.reduce((acc, v) => acc + Math.abs(v), 0) / pRes.length;
    const yMean = y.reduce((acc, v) => acc + v, 0) / y.length;
    const ssRes = y.reduce((acc, v, i) => acc + (v - yHat[i]) ** 2, 0);
    const ssTot = y.reduce((acc, v) => acc + (v - yMean) ** 2, 0);
    const r2LogP = ssTot > 0 ? 1 - ssRes / ssTot : Number.NaN;

    let cov: number[][] | null = null;
    const jtJ = transposeMulSelf(solve.jacobianWeighted);
    const inv = invert3x3(jtJ);
    if (inv) {
      const dof = Math.max(1, tReg.length - 3);
      const sigma2 = (2.0 * solve.cost) / dof;
      cov = inv.map((row) => row.map((v) => v * sigma2));
    }

    const warnings: string[] = [];
    if (validate) {
      const denomMin = Math.min(...tReg.map((v) => v + C));
      if (denomMin <= minMarginKelvin) {
        warnings.push(
          `Risky fit: min(T + C) = ${denomMin.toPrecision(6)} (<= ${minMarginKelvin}). Denominator near zero can make the fit unstable.`,
        );
      }
      const idx = tReg
        .map((t, i) => ({ t, i }))
        .sort((a, b) => a.t - b.t)
        .map((x) => x.i);
      for (let i = 1; i < idx.length; i += 1) {
        if (pHat[idx[i]] <= pHat[idx[i - 1]]) {
          warnings.push("Non-physical trend: fitted VaPr(T) is not strictly increasing over the data range.");
          break;
        }
      }
      if (B < 10.0) warnings.push("Unusually small B; data range may be too narrow or units may be inconsistent.");
      if (B > 1e6) warnings.push("Very large B; check units and outliers in experimental data.");
    }

    return {
      A,
      B,
      C,
      base,
      p_unit: regressionPressureUnit,
      T_unit_internal: regressionTemperatureUnit,
      fit_in_log_space: fitInLogSpace,
      pUnit: regressionPressureUnit,
      TUnitInternal: regressionTemperatureUnit,
      fitInLogSpace,
      success: solve.success,
      message: solve.message,
      cost: solve.cost,
      rmse_logP: rmseLogP,
      mae_logP: maeLogP,
      r2_logP: r2LogP,
      rmse_P: rmseP,
      mae_P: maeP,
      rmseLogP,
      maeLogP,
      r2LogP,
      rmseP,
      maeP,
      cov,
      warnings,
      Tmin: {
        value: Math.min(...tReg),
        unit: regressionTemperatureUnit,
      },
      Tmax: {
        value: Math.max(...tReg),
        unit: regressionTemperatureUnit,
      },
      loss,
      f_scale: fScale,
      fScale,
    };
  }

  /**
   * NOTE: Rank likely outliers using standardized residuals and robust weights.
   * @param TData Temperature data points.
   * @param PData Pressure data points.
   * @param fitReport Antoine fit report.
   * @param options Outlier-report options.
   * @returns Ranked outlier entries.
   */
  static outlierReport(
    TData: number[],
    PData: number[],
    fitReport: AntoineFitResult,
    options?: {
      TUnit?: TemperatureUnit;
      pUnit?: PressureUnit;
      topN?: number;
      residualDomain?: "log" | "P" | "p";
    },
  ): OutlierReportItem[] {
    if (fitReport.A === null || fitReport.B === null || fitReport.C === null) return [];
    const fitTUnit = (fitReport.T_unit_internal ?? fitReport.TUnitInternal ?? "K") as RegressionTemperatureUnit;
    const fitPUnit = (fitReport.p_unit ?? fitReport.pUnit ?? "Pa") as RegressionPressureUnit;
    const inputTUnit = options?.TUnit ?? fitTUnit ?? "K";
    const inputPUnit = options?.pUnit ?? fitPUnit ?? "Pa";
    const topN = options?.topN ?? 10;
    const residualDomain = (options?.residualDomain ?? "log").toLowerCase();

    const tReg = TData.map((v) => convertUnit(v, inputTUnit, fitTUnit));
    const pReg = PData.map((v) => convertUnit(v, inputPUnit, fitPUnit));
    if (!finiteArray(tReg) || !finiteArray(pReg) || pReg.some((v) => v <= 0)) return [];

    const yHat = Antoine.modelLog([fitReport.A, fitReport.B, fitReport.C], tReg);
    const pHat = yHat.map((v) => (fitReport.base === "log10" ? 10 ** v : Math.exp(v)));
    const y = pReg.map((v) => (fitReport.base === "log10" ? Math.log10(v) : Math.log(v)));

    let r: number[];
    if (residualDomain === "log") {
      r = yHat.map((v, i) => v - y[i]);
    } else if (residualDomain === "p") {
      r = pHat.map((v, i) => v - pReg[i]);
    } else {
      return [];
    }

    const fScaleValue = fitReport.f_scale ?? fitReport.fScale;
    const fScale = fScaleValue && fScaleValue > 0 ? fScaleValue : 1.0;
    const z = r.map((v) => v / fScale);
    const wRob = z.map((zi) => robustWeight(fitReport.loss, zi));

    const ranked = r
      .map((_, i) => i)
      .sort((ia, ib) => {
        const wa = wRob[ia];
        const wb = wRob[ib];
        if (wa !== wb) return wa - wb;
        return Math.abs(z[ib]) - Math.abs(z[ia]);
      })
      .slice(0, Math.min(topN, r.length));

    return ranked.map((i) => ({
      index: i,
      TK: convertUnit(tReg[i], fitTUnit, "K"),
      PInputPa: convertUnit(pReg[i], fitPUnit, "Pa"),
      PFitPa: convertUnit(pHat[i], fitPUnit, "Pa"),
      residual: r[i],
      standardizedResidual: z[i],
      robustWeight: wRob[i],
    }));
  }

  /**
   * NOTE: Load experimental temperature/pressure CSV data and normalize to `K`/`Pa`.
   * @param experimentalDataPath CSV path.
   * @param TUnit Input temperature unit.
   * @param PUnit Input pressure unit.
   * @returns Normalized temperature and pressure arrays.
   */
  static loadExperimentalData(
    experimentalDataPath: string,
    TUnit: TemperatureUnit,
    PUnit: PressureUnit,
  ): { temperaturesK: number[]; pressuresPa: number[] } {
    try {
      const raw = readFileSync(experimentalDataPath, "utf8");
      const lines = raw
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      if (lines.length < 2) return { temperaturesK: [], pressuresPa: [] };

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const tempIdx = headers.findIndex((h) => h === "temperature");
      const presIdx = headers.findIndex((h) => h === "pressure");
      if (tempIdx < 0 || presIdx < 0) return { temperaturesK: [], pressuresPa: [] };

      const temperaturesK: number[] = [];
      const pressuresPa: number[] = [];
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length <= Math.max(tempIdx, presIdx)) return { temperaturesK: [], pressuresPa: [] };
        const tVal = Number(cols[tempIdx]);
        const pVal = Number(cols[presIdx]);
        if (!Number.isFinite(tVal) || !Number.isFinite(pVal)) return { temperaturesK: [], pressuresPa: [] };
        temperaturesK.push(toKelvin(tVal, TUnit));
        pressuresPa.push(convertUnit(pVal, PUnit, "Pa"));
      }

      if (!finiteArray(temperaturesK) || !finiteArray(pressuresPa)) return { temperaturesK: [], pressuresPa: [] };
      return { temperaturesK, pressuresPa };
    } catch {
      return { temperaturesK: [], pressuresPa: [] };
    }
  }

  /**
   * NOTE: Calculate saturation pressure in regression pressure units using Antoine coefficients.
   * @param TValue Input temperature value.
   * @param TUnit Temperature unit.
   * @param A Antoine coefficient A.
   * @param B Antoine coefficient B.
   * @param C Antoine coefficient C.
   * @param base Logarithm base.
   * @returns Pressure in regression pressure units or `null` on invalid input.
   */
  static calc(
    TValue: number,
    TUnit: TemperatureUnit,
    A: number,
    B: number,
    C: number,
    base: AntoineBase = "log10",
    pressureUnit: RegressionPressureUnit,
  ): Pressure | null {
    if (![TValue, A, B, C].every((v) => Number.isFinite(v))) return null;
    if (base !== "log10" && base !== "ln") return null;

    try {
      const logP = A - B / (TValue + C);
      const vaporPressure = base === "log10" ? 10 ** logP : Math.exp(logP);
      if (!Number.isFinite(vaporPressure)) return null;
      return { value: vaporPressure, unit: pressureUnit };
    } catch {
      return null;
    }
  }

  /**
   * NOTE: Convert pressure from Pascal to any supported pressure unit.
   * @param valuePa Pressure value in Pascal.
   * @param outputUnit Target pressure unit.
   * @returns Converted pressure value.
   */
  static convertPressureFromPa(valuePa: number, outputUnit: PressureUnit): number {
    return fromPa(valuePa, outputUnit);
  }
}
