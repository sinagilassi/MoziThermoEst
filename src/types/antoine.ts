import type { Temperature } from "mozithermodb-settings";

export type AntoineBase = "log10" | "ln";

export type AntoineLoss = "linear" | "soft_l1" | "huber" | "cauchy" | "arctan";

export type TemperatureUnit = "K" | "C" | "F" | "R";

export type PressureUnit = "Pa" | "kPa" | "bar" | "atm" | "psi";

export type RegressionTemperatureUnit = TemperatureUnit;

export type RegressionPressureUnit = PressureUnit;

// Legacy: prefer EstimateCoefficientsOptions (Python-aligned).
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

export interface EstimateCoefficientsOptions {
  regression_temperature_unit?: RegressionTemperatureUnit;
  regression_pressure_unit?: RegressionPressureUnit;
  base?: AntoineBase;
  fit_in_log_space?: boolean;
  weights?: number[];
  x0?: [number, number, number] | null;
  bounds?: [[number, number, number], [number, number, number]] | null;
  max_nfev?: number;
  validate?: boolean;
  min_margin_kelvin?: number;
  loss?: AntoineLoss;
  f_scale?: number | null;
}

export interface AntoineFitResult {
  A: number | null;
  B: number | null;
  C: number | null;
  base: AntoineBase;
  p_unit: RegressionPressureUnit;
  T_unit_internal: RegressionTemperatureUnit;
  fit_in_log_space: boolean;
  pUnit: RegressionPressureUnit;
  TUnitInternal: RegressionTemperatureUnit;
  fitInLogSpace: boolean;
  success: boolean;
  message: string;
  cost: number | null;
  rmse_logP: number | null;
  mae_logP: number | null;
  r2_logP: number | null;
  rmse_P: number | null;
  mae_P: number | null;
  rmseLogP: number | null;
  maeLogP: number | null;
  r2LogP: number | null;
  rmseP: number | null;
  maeP: number | null;
  cov: number[][] | null;
  warnings: string[];
  Tmin: Temperature | null;
  Tmax: Temperature | null;
  loss: AntoineLoss;
  f_scale: number | null;
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

