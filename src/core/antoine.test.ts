import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  Antoine,
  AntoineError,
  calcVaporPressure,
  calcVaporPressureWithUnits,
  fitAntoine,
  loadExperimentalData,
} from "./antoine";

const temperaturesK = [298, 308, 318, 328, 338, 348, 358, 368, 378, 388];
const pressuresPa = [3157.9, 5623.4, 9557.6, 15529.2, 24280.2, 36788.2, 54134.1, 77631.5, 108775.9, 149380.3];

describe("Antoine canonical API", () => {
  it("produces near-identical coefficients for equivalent (K,Pa) and (C,bar) datasets", () => {
    const fitKP = fitAntoine(temperaturesK, pressuresPa, { base: "log10", loss: "soft_l1", fit_in_log_space: true });
    const fitCB = Antoine.fitAntoine(
      temperaturesK.map((t) => t - 273.15),
      pressuresPa.map((p) => p / 1e5),
      { base: "log10", TUnit: "C", pUnit: "bar", loss: "soft_l1", fitInLogSpace: true },
    );

    expect(fitCB.A).not.toBeNull();
    expect(Math.abs(fitKP.A - (fitCB.A as number))).toBeLessThan(1e-6);
    expect(Math.abs(fitKP.B - (fitCB.B as number))).toBeLessThan(1e-2);
    expect(Math.abs(fitKP.C - (fitCB.C as number))).toBeLessThan(1e-6);
  });

  it("throws for non-positive pressure inputs", () => {
    expect(() => fitAntoine([300, 310, 320], [1000, 0, 1400])).toThrow(AntoineError);
  });

  it("predicts monotonically increasing vapor pressure with temperature", () => {
    const fit = fitAntoine(temperaturesK, pressuresPa, { base: "log10" });
    const predicted = temperaturesK
      .map((t) => calcVaporPressure({ value: t, unit: "K" }, fit.A, fit.B, fit.C, fit.base).vapor_pressure_Pa);
    for (let i = 1; i < predicted.length; i += 1) {
      expect(predicted[i]).toBeGreaterThan(predicted[i - 1]);
    }
  });

  it("emits warning when denominator approaches zero margin", () => {
    const fit = fitAntoine(temperaturesK, pressuresPa, { min_margin_kelvin: 1000 });
    expect(fit.warnings.some((w) => w.includes("Risky fit: min(T + C)"))).toBe(true);
  });

  it("supports both log10 and ln bases", () => {
    const fit10 = fitAntoine(temperaturesK, pressuresPa, { base: "log10" });
    const fitLn = fitAntoine(temperaturesK, pressuresPa, { base: "ln" });

    const p10 = calcVaporPressure({ value: 350, unit: "K" }, fit10.A, fit10.B, fit10.C, "log10");
    const pLn = calcVaporPressure({ value: 350, unit: "K" }, fitLn.A, fitLn.B, fitLn.C, "ln");
    expect(Number.isFinite(p10.vapor_pressure_Pa)).toBe(true);
    expect(Number.isFinite(pLn.vapor_pressure_Pa)).toBe(true);
  });

  it("throws for CSV files missing Temperature/Pressure headers", () => {
    const dir = mkdtempSync(join(tmpdir(), "antoine-test-"));
    const badCsv = join(dir, "bad.csv");
    writeFileSync(badCsv, "T,P\n300,1000\n");
    expect(() => loadExperimentalData(badCsv, "K", "Pa")).toThrow(AntoineError);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns converted units from calcVaporPressureWithUnits", () => {
    const fit = fitAntoine(temperaturesK, pressuresPa);
    const out = calcVaporPressureWithUnits({ value: 350, unit: "K" }, fit.A, fit.B, fit.C, "bar");
    expect(out.unit).toBe("bar");
    expect(out.vapor_pressure).toBeGreaterThan(0);
  });
});
