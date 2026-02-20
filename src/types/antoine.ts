export type AntoineBase = "log10" | "ln";

export type AntoineLoss = "linear" | "soft_l1" | "huber" | "cauchy" | "arctan";

export type TemperatureUnit = "K" | "C" | "F" | "R";

export type PressureUnit = "Pa" | "kPa" | "bar" | "atm" | "psi";

export interface FitAntoineOptions {
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
}

export interface AntoineFitResult {
  A: number | null;
  B: number | null;
  C: number | null;
  base: AntoineBase;
  pUnit: "Pa";
  TUnitInternal: "K";
  fitInLogSpace: boolean;
  success: boolean;
  message: string;
  cost: number | null;
  rmseLogP: number | null;
  maeLogP: number | null;
  r2LogP: number | null;
  rmseP: number | null;
  maeP: number | null;
  cov: number[][] | null;
  warnings: string[];
  TminK: number | null;
  TmaxK: number | null;
  loss: AntoineLoss;
  fScale: number | null;
}

export interface OutlierReportItem {
  index: number;
  TK: number;
  PInputPa: number;
  PFitPa: number;
  residual: number;
  standardizedResidual: number;
  robustWeight: number;
}

