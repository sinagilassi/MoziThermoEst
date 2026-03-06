import type { CustomProp, Pressure, Temperature } from "mozithermodb-settings";

export type AntoineBase = "log10" | "ln";

export type AntoineLoss = "linear" | "soft_l1" | "huber" | "cauchy" | "arctan";

export type TemperatureUnit = "K" | "C" | "F" | "R";

export type PressureUnit = "Pa" | "kPa" | "bar" | "atm" | "psi";

export type RegressionTemperatureUnit = "K";

export type RegressionPressureUnit = "Pa";

export interface FitAntoineOptions {
  base?: AntoineBase;
  fit_in_log_space?: boolean;
  weights?: number[];
  x0?: [number, number, number];
  bounds?: [[number, number, number], [number, number, number]];
  max_nfev?: number;
  validate?: boolean;
  min_margin_kelvin?: number;
  loss?: AntoineLoss;
  f_scale?: number;
  metadata?: CustomProp[];
}

export interface AntoineFitReport {
  A: number;
  B: number;
  C: number;
  base: AntoineBase;
  T_unit_internal: "K";
  p_unit: "Pa";
  fit_in_log_space: boolean;
  success: boolean;
  message: string;
  cost: number;
  rmse_logP: number;
  mae_logP: number;
  r2_logP: number;
  rmse_P: number;
  mae_P: number;
  cov: number[][] | null;
  warnings: string[];
  Tmin_K: number;
  Tmax_K: number;
  loss: AntoineLoss;
  f_scale: number;
}

export interface AntoineFitResultCompat extends Omit<AntoineFitReport, "A" | "B" | "C"> {
  A: number | null;
  B: number | null;
  C: number | null;
  pUnit: "Pa";
  TUnitInternal: "K";
  fitInLogSpace: boolean;
  rmseLogP: number | null;
  maeLogP: number | null;
  r2LogP: number | null;
  rmseP: number | null;
  maeP: number | null;
  TminK: number | null;
  TmaxK: number | null;
  fScale: number | null;
}

export interface CalcVaporPressureResult {
  temperature_K: number;
  vapor_pressure_Pa: number;
}

export interface CalcVaporPressureWithUnitsResult {
  temperature_K: number;
  vapor_pressure: number;
  unit: PressureUnit;
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

export interface OutlierReportOptions {
  topN?: number;
  residualDomain?: "log" | "P" | "p";
}

export interface EstimateOptions {
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
  metadata?: CustomProp[];
}

export type EstimateFromDatasetOptions = EstimateOptions;

export interface CalcVaporPressureOptions {
  base?: AntoineBase;
  pressureUnit?: PressureUnit;
}

export interface ExperimentalDataset {
  temperaturesK: number[];
  pressuresPa: number[];
}

export type TypedTemperature = Temperature;
export type TypedPressure = Pressure;
