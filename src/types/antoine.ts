import type { Temperature } from "mozithermodb-settings";

export type AntoineBase = "log10" | "ln";

export type AntoineLoss = "linear" | "soft_l1" | "huber" | "cauchy" | "arctan";

export type TemperatureUnit = "K" | "C" | "F" | "R";

export type PressureUnit = "Pa" | "kPa" | "bar" | "atm" | "psi";
