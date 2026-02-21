import type { AntoineLoss } from "../types/antoine";
import { clamp, finiteArray, vecNorm2 } from "../utils/tools";
import { robustWeight } from "./robust";

export type Vector3 = [number, number, number];
export type Matrix3 = [Vector3, Vector3, Vector3];

export interface LeastSquaresOptions {
  x0: Vector3;
  bounds: [Vector3, Vector3];
  maxNfev: number;
  loss: AntoineLoss;
  fScale: number;
  staticWeights: number[];
  residualFn: (params: Vector3) => number[];
  jacobianFn?: (params: Vector3) => number[][];
}

export interface LeastSquaresResult {
  x: Vector3;
  success: boolean;
  message: string;
  cost: number;
  nfev: number;
  residualBase: number[];
  residualWeighted: number[];
  jacobianWeighted: number[][];
}

interface EvalState {
  residualBase: number[];
  residualWeighted: number[];
  jacobianWeighted: number[][];
  cost: number;
}

const EPS = 1e-12;

/**
 * Compute `J^T r` for a 3-parameter Jacobian.
 * @param jac Jacobian matrix.
 * @param residual Residual vector.
 * @returns Product vector.
 */
export function transposeMul(jac: number[][], residual: number[]): Vector3 {
  let g0 = 0;
  let g1 = 0;
  let g2 = 0;
  for (let i = 0; i < jac.length; i += 1) {
    const row = jac[i];
    g0 += row[0] * residual[i];
    g1 += row[1] * residual[i];
    g2 += row[2] * residual[i];
  }
  return [g0, g1, g2];
}

/**
 * Compute `J^T J` for a 3-parameter Jacobian.
 * @param jac Jacobian matrix.
 * @returns Normal-equation matrix.
 */
export function transposeMulSelf(jac: number[][]): Matrix3 {
  let a00 = 0;
  let a01 = 0;
  let a02 = 0;
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;

  for (const row of jac) {
    const j0 = row[0];
    const j1 = row[1];
    const j2 = row[2];
    a00 += j0 * j0;
    a01 += j0 * j1;
    a02 += j0 * j2;
    a11 += j1 * j1;
    a12 += j1 * j2;
    a22 += j2 * j2;
  }

  return [
    [a00, a01, a02],
    [a01, a11, a12],
    [a02, a12, a22],
  ];
}

/**
 * Solve a 3x3 linear system with Gaussian elimination and partial pivoting.
 * @param a Coefficient matrix.
 * @param b Right-hand side vector.
 * @returns Solution vector or `null` if singular.
 */
export function solve3x3(a: Matrix3, b: Vector3): Vector3 | null {
  const m = [
    [a[0][0], a[0][1], a[0][2], b[0]],
    [a[1][0], a[1][1], a[1][2], b[1]],
    [a[2][0], a[2][1], a[2][2], b[2]],
  ];

  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    let maxAbs = Math.abs(m[col][col]);
    for (let row = col + 1; row < 3; row += 1) {
      const absVal = Math.abs(m[row][col]);
      if (absVal > maxAbs) {
        maxAbs = absVal;
        pivot = row;
      }
    }
    if (maxAbs < EPS) return null;

    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }

    const diag = m[col][col];
    for (let k = col; k < 4; k += 1) m[col][k] /= diag;

    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let k = col; k < 4; k += 1) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }

  return [m[0][3], m[1][3], m[2][3]];
}

/**
 * Invert a 3x3 matrix using adjugate/determinant formula.
 * @param a Input matrix.
 * @returns Inverse matrix or `null` if singular.
 */
export function invert3x3(a: Matrix3): Matrix3 | null {
  const c00 = a[1][1] * a[2][2] - a[1][2] * a[2][1];
  const c01 = -(a[1][0] * a[2][2] - a[1][2] * a[2][0]);
  const c02 = a[1][0] * a[2][1] - a[1][1] * a[2][0];
  const c10 = -(a[0][1] * a[2][2] - a[0][2] * a[2][1]);
  const c11 = a[0][0] * a[2][2] - a[0][2] * a[2][0];
  const c12 = -(a[0][0] * a[2][1] - a[0][1] * a[2][0]);
  const c20 = a[0][1] * a[1][2] - a[0][2] * a[1][1];
  const c21 = -(a[0][0] * a[1][2] - a[0][2] * a[1][0]);
  const c22 = a[0][0] * a[1][1] - a[0][1] * a[1][0];

  const det = a[0][0] * c00 + a[0][1] * c01 + a[0][2] * c02;
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;

  return [
    [c00 * invDet, c10 * invDet, c20 * invDet],
    [c01 * invDet, c11 * invDet, c21 * invDet],
    [c02 * invDet, c12 * invDet, c22 * invDet],
  ];
}

/**
 * Build numerical Jacobian using forward finite differences.
 * @param params Current parameter vector.
 * @param residualFn Residual callback.
 * @returns Numerical Jacobian matrix.
 */
function numericalJacobian(params: Vector3, residualFn: (params: Vector3) => number[]): number[][] {
  const baseR = residualFn(params);
  const jac = Array.from({ length: baseR.length }, () => [0, 0, 0]);
  for (let j = 0; j < 3; j += 1) {
    const stepped: Vector3 = [params[0], params[1], params[2]];
    const h = 1e-6 * (Math.abs(params[j]) + 1);
    stepped[j] += h;
    const plusR = residualFn(stepped);
    for (let i = 0; i < baseR.length; i += 1) {
      jac[i][j] = (plusR[i] - baseR[i]) / h;
    }
  }
  return jac;
}

/**
 * Evaluate weighted residuals/Jacobian and half-squared cost for LM iterations.
 * @param params Current parameter vector.
 * @param residualFn Residual callback.
 * @param jacobianFn Optional Jacobian callback.
 * @param staticWeights User-provided static weights.
 * @param loss Robust loss.
 * @param fScale Robust loss scaling.
 * @returns Evaluation state for one iteration.
 */
function evaluateState(
  params: Vector3,
  residualFn: (params: Vector3) => number[],
  jacobianFn: ((params: Vector3) => number[][]) | undefined,
  staticWeights: number[],
  loss: AntoineLoss,
  fScale: number,
): EvalState {
  const residualBase = residualFn(params);
  const jacBase = jacobianFn ? jacobianFn(params) : numericalJacobian(params, residualFn);

  const residualWeighted = new Array<number>(residualBase.length);
  const jacobianWeighted = Array.from({ length: residualBase.length }, () => [0, 0, 0]);
  let cost = 0;

  for (let i = 0; i < residualBase.length; i += 1) {
    const z = fScale > 0 ? residualBase[i] / fScale : 0.0;
    const wRob = robustWeight(loss, z);
    const scale = staticWeights[i] * Math.sqrt(Math.max(wRob, 0));
    const rw = residualBase[i] * scale;
    residualWeighted[i] = rw;
    jacobianWeighted[i][0] = jacBase[i][0] * scale;
    jacobianWeighted[i][1] = jacBase[i][1] * scale;
    jacobianWeighted[i][2] = jacBase[i][2] * scale;
    cost += 0.5 * rw * rw;
  }

  return { residualBase, residualWeighted, jacobianWeighted, cost };
}

/**
 * Solve bounded nonlinear least-squares using a lightweight LM/GN hybrid.
 * @param options Solver options and callbacks.
 * @returns Optimization result including parameters and diagnostics.
 */
export function leastSquares(options: LeastSquaresOptions): LeastSquaresResult {
  const {
    x0,
    bounds,
    maxNfev,
    loss,
    fScale,
    staticWeights,
    residualFn,
    jacobianFn,
  } = options;

  let x: Vector3 = [
    clamp(x0[0], bounds[0][0], bounds[1][0]),
    clamp(x0[1], bounds[0][1], bounds[1][1]),
    clamp(x0[2], bounds[0][2], bounds[1][2]),
  ];

  let lambda = 1e-2;
  let nfev = 0;
  let state = evaluateState(x, residualFn, jacobianFn, staticWeights, loss, fScale);
  nfev += 1;

  let success = false;
  let message = "Maximum iterations reached.";

  for (let iter = 0; iter < maxNfev; iter += 1) {
    const jtJ = transposeMulSelf(state.jacobianWeighted);
    const jtr = transposeMul(state.jacobianWeighted, state.residualWeighted);
    const gradNorm = vecNorm2(jtr);
    if (gradNorm < 1e-10) {
      success = true;
      message = "Gradient norm convergence.";
      break;
    }

    const h: Matrix3 = [
      [jtJ[0][0] + lambda, jtJ[0][1], jtJ[0][2]],
      [jtJ[1][0], jtJ[1][1] + lambda, jtJ[1][2]],
      [jtJ[2][0], jtJ[2][1], jtJ[2][2] + lambda],
    ];
    const rhs: Vector3 = [-jtr[0], -jtr[1], -jtr[2]];
    const step = solve3x3(h, rhs);

    if (step === null || !finiteArray(step)) {
      lambda *= 10;
      if (lambda > 1e16) {
        message = "Linear system became singular.";
        break;
      }
      continue;
    }

    const stepNorm = vecNorm2(step);
    if (stepNorm < 1e-12) {
      success = true;
      message = "Step norm convergence.";
      break;
    }

    const candidate: Vector3 = [
      clamp(x[0] + step[0], bounds[0][0], bounds[1][0]),
      clamp(x[1] + step[1], bounds[0][1], bounds[1][1]),
      clamp(x[2] + step[2], bounds[0][2], bounds[1][2]),
    ];

    const candidateState = evaluateState(candidate, residualFn, jacobianFn, staticWeights, loss, fScale);
    nfev += 1;

    if (candidateState.cost < state.cost) {
      const relImprovement = (state.cost - candidateState.cost) / Math.max(state.cost, 1.0);
      x = candidate;
      state = candidateState;
      lambda = Math.max(lambda / 2, 1e-12);
      if (relImprovement < 1e-12) {
        success = true;
        message = "Cost improvement convergence.";
        break;
      }
    } else {
      lambda = Math.min(lambda * 10, 1e16);
    }

    if (nfev >= maxNfev) {
      message = "Maximum function evaluations reached.";
      break;
    }
  }

  return {
    x,
    success,
    message,
    cost: state.cost,
    nfev,
    residualBase: state.residualBase,
    residualWeighted: state.residualWeighted,
    jacobianWeighted: state.jacobianWeighted,
  };
}
