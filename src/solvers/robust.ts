import type { AntoineLoss } from "../types/antoine";

/**
 * Compute robust IRLS-like weight from standardized residual `z = r / fScale`.
 * @param loss Robust loss type.
 * @param z Standardized residual.
 * @returns Robust weight.
 */
export function robustWeight(loss: AntoineLoss, z: number): number {
  const a = Math.abs(z);
  if (loss === "linear") return 1.0;
  if (loss === "soft_l1") return 1.0 / Math.sqrt(1.0 + z * z);
  if (loss === "huber") return a <= 1.0 ? 1.0 : 1.0 / a;
  if (loss === "cauchy" || loss === "arctan") return 1.0 / (1.0 + z * z);
  return 1.0;
}
