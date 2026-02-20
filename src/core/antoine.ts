import { readFileSync } from "node:fs";
import type { Pressure } from "mozithermodb-settings";
import { invert3x3, leastSquares, transposeMulSelf, type Vector3 } from "@/solvers/leastSquares";
import { robustWeight } from "@/solvers/robust";
import type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  FitAntoineOptions,
  OutlierReportItem,
  PressureUnit,
  TemperatureUnit,
} from "@/types/antoine";
import { fromPa, toKelvin, toPa } from "@/utils/units";
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
const emptyResult = (base: AntoineBase = "log10", loss: AntoineLoss = "linear"): AntoineFitResult => ({
  A: null,
  B: null,
  C: null,
  base,
  pUnit: "Pa",
  TUnitInternal: "K",
  fitInLogSpace: true,
  success: false,
  message: "",
  cost: null,
  rmseLogP: null,
  maeLogP: null,
  r2LogP: null,
  rmseP: null,
  maeP: null,
  cov: null,
  warnings: [],
  TminK: null,
  TmaxK: null,
  loss,
  fScale: null,
});

/**
 * SECTION: Antoine vapor-pressure model operations: fitting, evaluation, diagnostics, and data loading.
 * TODO:
 */
export class Antoine {
  /**
   * Antoine logarithmic model: `A - B / (T + C)`.
   * @param params Antoine parameter tuple `[A, B, C]`.
   * @param tK Temperature values in Kelvin.
   * @returns Log-pressure model values.
   */
  private static modelLog(params: Vector3, tK: number[]): number[] {
    const [A, B, C] = params;
    return tK.map((t) => A - B / (t + C));
  }

  /**
   * NOTE: Build residual vector either in log-pressure space or pressure space.
   * @param params Antoine parameter tuple `[A, B, C]`.
   * @param tK Temperature values in Kelvin.
   * @param pPa Pressure values in Pascal.
   * @param base Logarithm base.
   * @param fitInLogSpace Whether residuals are computed in log space.
   * @returns Residual vector.
   */
  private static makeResidualBase(
    params: Vector3,
    tK: number[],
    pPa: number[],
    base: AntoineBase,
    fitInLogSpace: boolean,
  ): number[] {
    const yHat = Antoine.modelLog(params, tK);
    if (fitInLogSpace) {
      return yHat.map((v, i) => v - (base === "log10" ? Math.log10(pPa[i]) : Math.log(pPa[i])));
    }
    const pHat = yHat.map((v) => (base === "log10" ? 10 ** v : Math.exp(v)));
    return pHat.map((v, i) => v - pPa[i]);
  }

  /**
   * NOTE: Fit Antoine coefficients `(A, B, C)` to temperature/pressure data.
   * @param TData Temperature data points.
   * @param PData Pressure data points.
   * @param options Fit options.
   * @returns Structured fit result including coefficients and diagnostics.
   */
  static fitAntoine(TData: number[], PData: number[], options: FitAntoineOptions = {}): AntoineFitResult {
    const base = (options.base ?? "log10").toLowerCase() as AntoineBase;
    const loss = (options.loss ?? "linear").toLowerCase() as AntoineLoss;
    const fitInLogSpace = options.fitInLogSpace ?? true;
    const out = emptyResult(base, loss);
    out.fitInLogSpace = fitInLogSpace;

    const T = [...TData].map((x) => Number(x));
    const P = [...PData].map((x) => Number(x));
    if (T.length !== P.length || T.length < 3 || !finiteArray(T) || !finiteArray(P)) {
      out.message = "TData and PData must have same length and at least 3 finite points.";
      return out;
    }

    const TUnit = (options.TUnit ?? "K") as TemperatureUnit;
    const pUnit = (options.pUnit ?? "Pa") as PressureUnit;
    const tK = T.map((v) => toKelvin(v, TUnit));
    const pPa = P.map((v) => toPa(v, pUnit));
    if (!finiteArray(tK) || !finiteArray(pPa) || pPa.some((v) => v <= 0)) {
      out.message = "Failed to normalize units or pressure values are non-positive.";
      return out;
    }

    if (base !== "log10" && base !== "ln") {
      out.message = "base must be 'log10' or 'ln'.";
      return out;
    }

    const staticWeights = new Array<number>(tK.length).fill(1.0);
    if (options.weights !== undefined) {
      if (options.weights.length !== tK.length || !finiteArray(options.weights)) {
        out.message = "weights must have same length as data and be finite.";
        return out;
      }
      for (let i = 0; i < options.weights.length; i += 1) {
        staticWeights[i] = Math.sqrt(Math.max(options.weights[i], 0));
      }
    }

    const y = pPa.map((v) => (base === "log10" ? Math.log10(v) : Math.log(v)));
    let x0: Vector3;
    if (options.x0) {
      x0 = [options.x0[0], options.x0[1], options.x0[2]];
    } else {
      let C0 = -50.0;
      const minMarginKelvin = options.minMarginKelvin ?? 1.0;
      if (Math.min(...tK.map((v) => v + C0)) <= minMarginKelvin) C0 = -Math.min(...tK) + 10.0;

      const A0 = y.reduce((acc, v) => acc + v, 0) / y.length;
      const x = tK.map((v) => 1.0 / v);
      const xMean = x.reduce((acc, v) => acc + v, 0) / x.length;
      const yMean = y.reduce((acc, v) => acc + v, 0) / y.length;
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < x.length; i += 1) {
        sxy += (x[i] - xMean) * (y[i] - yMean);
        sxx += (x[i] - xMean) * (x[i] - xMean);
      }
      const m = sxx > 0 ? sxy / sxx : -2000;
      const tMean = tK.reduce((acc, v) => acc + v, 0) / tK.length;
      const ratio = ((tK.reduce((acc, v) => acc + (v + C0), 0) / tK.length) / tMean) ** 2;
      let B0 = Math.abs(m) * ratio;
      if (!Number.isFinite(B0) || B0 <= 1e-6) B0 = 2000.0;
      x0 = [A0, B0, C0];
    }

    const bounds = options.bounds ?? DEFAULT_BOUNDS;
    const maxNfev = options.maxNfev ?? 5000;

    let fScale = options.fScale;
    if (fScale === undefined || fScale === null) {
      if (loss !== "linear") {
        if (fitInLogSpace) {
          fScale = 0.02;
        } else {
          const sorted = [...pPa].sort((a, b) => a - b);
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
      residualFn: (params) => Antoine.makeResidualBase(params, tK, pPa, base, fitInLogSpace),
    });

    const [A, B, C] = solve.x;
    const yHat = Antoine.modelLog([A, B, C], tK);
    const pHat = yHat.map((v) => (base === "log10" ? 10 ** v : Math.exp(v)));
    const logRes = yHat.map((v, i) => v - y[i]);
    const pRes = pHat.map((v, i) => v - pPa[i]);

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
      const dof = Math.max(1, tK.length - 3);
      const sigma2 = (2.0 * solve.cost) / dof;
      cov = inv.map((row) => row.map((v) => v * sigma2));
    }

    const warnings: string[] = [];
    const validate = options.validate ?? true;
    const minMarginKelvin = options.minMarginKelvin ?? 1.0;
    if (validate) {
      const denomMin = Math.min(...tK.map((v) => v + C));
      if (denomMin <= minMarginKelvin) {
        warnings.push(
          `Risky fit: min(T + C) = ${denomMin.toPrecision(6)} K (<= ${minMarginKelvin} K). Denominator near zero can make the fit unstable.`,
        );
      }
      const idx = tK
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
      pUnit: "Pa",
      TUnitInternal: "K",
      fitInLogSpace,
      success: solve.success,
      message: solve.message,
      cost: solve.cost,
      rmseLogP,
      maeLogP,
      r2LogP,
      rmseP,
      maeP,
      cov,
      warnings,
      TminK: Math.min(...tK),
      TmaxK: Math.max(...tK),
      loss,
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
    const TUnit = options?.TUnit ?? "K";
    const pUnit = options?.pUnit ?? "Pa";
    const topN = options?.topN ?? 10;
    const residualDomain = (options?.residualDomain ?? "log").toLowerCase();

    const tK = TData.map((v) => toKelvin(v, TUnit));
    const pPa = PData.map((v) => toPa(v, pUnit));
    if (!finiteArray(tK) || !finiteArray(pPa) || pPa.some((v) => v <= 0)) return [];

    const yHat = Antoine.modelLog([fitReport.A, fitReport.B, fitReport.C], tK);
    const pHat = yHat.map((v) => (fitReport.base === "log10" ? 10 ** v : Math.exp(v)));
    const y = pPa.map((v) => (fitReport.base === "log10" ? Math.log10(v) : Math.log(v)));

    let r: number[];
    if (residualDomain === "log") {
      r = yHat.map((v, i) => v - y[i]);
    } else if (residualDomain === "p") {
      r = pHat.map((v, i) => v - pPa[i]);
    } else {
      return [];
    }

    const fScale = fitReport.fScale && fitReport.fScale > 0 ? fitReport.fScale : 1.0;
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
      TK: tK[i],
      PInputPa: pPa[i],
      PFitPa: pHat[i],
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
        pressuresPa.push(toPa(pVal, PUnit));
      }

      if (!finiteArray(temperaturesK) || !finiteArray(pressuresPa)) return { temperaturesK: [], pressuresPa: [] };
      return { temperaturesK, pressuresPa };
    } catch {
      return { temperaturesK: [], pressuresPa: [] };
    }
  }

  /**
   * NOTE: Calculate saturation pressure in Pascal using Antoine coefficients.
   * @param TValue Input temperature value.
   * @param TUnit Temperature unit.
   * @param A Antoine coefficient A.
   * @param B Antoine coefficient B.
   * @param C Antoine coefficient C.
   * @param base Logarithm base.
   * @returns Pressure in Pascal or `null` on invalid input.
   */
  static calc(
    TValue: number,
    TUnit: TemperatureUnit,
    A: number,
    B: number,
    C: number,
    base: AntoineBase = "log10",
  ): Pressure | null {
    if (![TValue, A, B, C].every((v) => Number.isFinite(v))) return null;
    if (base !== "log10" && base !== "ln") return null;

    try {
      const TK = toKelvin(TValue, TUnit);
      const logP = A - B / (TK + C);
      const vaporPressure = base === "log10" ? 10 ** logP : Math.exp(logP);
      if (!Number.isFinite(vaporPressure)) return null;
      return { value: vaporPressure, unit: "Pa" };
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
