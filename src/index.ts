export type {
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
} from "./types/antoine";
export { Antoine } from "./core/antoine";
export { calcVaporPressure, estimateCoefficients, estimateCoefficientsFromExperimentalData } from "./docs/antoine";
