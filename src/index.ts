export type {
  AntoineBase,
  AntoineFitResult,
  AntoineLoss,
  EstimateCoefficientsOptions,
  FitAntoineOptions,
  OutlierReportItem,
  Pressure,
  PressureUnit,
  RegressionPressureUnit,
  RegressionTemperatureUnit,
  Temperature,
  TemperatureUnit,
} from "./types/antoine";
export { Antoine } from "./core/antoine";
export { calcVaporPressure, estimateCoefficients, estimateCoefficientsFromExperimentalData } from "./docs/antoine";
