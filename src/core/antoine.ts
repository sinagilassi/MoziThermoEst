import { readFileSync } from "node:fs";
import type { Pressure } from "mozithermodb-settings";
import { invert3x3, leastSquares, transposeMulSelf, type Vector3 } from "@/solvers/leastSquares";
import { robustWeight } from "@/solvers/robust";


const DEFAULT_BOUNDS: [[number, number, number], [number, number, number]] = [
  [-200.0, 1e-6, -1e4],
  [200.0, 1e7, 1e4],
];

const EPS = 1e-12;
