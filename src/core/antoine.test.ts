import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Pressure, Temperature } from "mozithermodb-settings";
import { Antoine } from "./antoine";
import { calcVaporPressure, estimateCoefficients, estimateCoefficientsFromExperimentalData } from "../docs/antoine";

function makeSyntheticData(): { T: number[]; P: number[]; A: number; B: number; C: number } {
  const A = 10;
  const B = 2500;
  const C = -30;
  const T = [290, 300, 310, 320, 330, 340, 350, 360];
  const P = T.map((t) => 10 ** (A - B / (t + C)));
  return { T, P, A, B, C };
}

describe("Antoine core", () => {
  it("fit remains numerically stable on reference Antoine dataset", () => {
    const temperatures = [298, 308, 318, 328, 338, 348, 358, 368, 378, 388, 398, 408];
    const pressures = [
      3392.900018, 5738.327528, 9332.604721, 14657.31121, 22310.8695, 33018.32269, 47638.5333, 67168.53995, 92744.96477,
      125642.5053, 167269.663, 219161.9542,
    ];
    const res = Antoine.fitAntoine(temperatures, pressures, { base: "log10", loss: "soft_l1" });
    expect(res.A).not.toBeNull();
    expect(res.B).not.toBeNull();
    expect(res.C).not.toBeNull();
    expect(res.rmseLogP as number).toBeLessThan(1e-4);
  });

  it("calc works for log10 and ln", () => {
    const p1 = Antoine.calc(300, "K", 10, 2500, -30, "log10");
    const p2 = Antoine.calc(300, "K", Math.log(10 ** 10), 2500, -30, "ln");
    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect((p1 as Pressure).value).toBeGreaterThan(0);
    expect((p1 as Pressure).unit).toBe("Pa");
    expect((p2 as Pressure).value).toBeGreaterThan(0);
    expect((p2 as Pressure).unit).toBe("Pa");
  });

  it("fit recovers synthetic coefficients", () => {
    const syn = makeSyntheticData();
    const res = Antoine.fitAntoine(syn.T, syn.P, {
      base: "log10",
      fitInLogSpace: true,
      maxNfev: 2000,
    });
    expect(res.A).not.toBeNull();
    expect(res.B).not.toBeNull();
    expect(res.C).not.toBeNull();
    expect(Math.abs((res.A as number) - syn.A)).toBeLessThan(0.5);
    expect(Math.abs((res.B as number) - syn.B)).toBeLessThan(150);
    expect(Math.abs((res.C as number) - syn.C)).toBeLessThan(25);
  });

  it("robust loss handles outlier better than linear", () => {
    const syn = makeSyntheticData();
    const noisy = [...syn.P];
    noisy[3] *= 8;

    const linear = Antoine.fitAntoine(syn.T, noisy, { loss: "linear" });
    const robust = Antoine.fitAntoine(syn.T, noisy, { loss: "soft_l1" });

    expect(linear.A).not.toBeNull();
    expect(robust.A).not.toBeNull();
    expect(Math.abs((robust.A as number) - syn.A)).toBeLessThan(Math.abs((linear.A as number) - syn.A));
  });

  it("respects bounds", () => {
    const syn = makeSyntheticData();
    const res = Antoine.fitAntoine(syn.T, syn.P, {
      bounds: [[9.5, 2000, -100], [10.5, 3000, 0]],
    });
    expect((res.A as number) >= 9.5).toBe(true);
    expect((res.A as number) <= 10.5).toBe(true);
    expect((res.B as number) >= 2000).toBe(true);
    expect((res.B as number) <= 3000).toBe(true);
  });

  it("outlier report returns ranked items", () => {
    const syn = makeSyntheticData();
    const fit = Antoine.fitAntoine(syn.T, syn.P, { loss: "soft_l1" });
    const outliers = Antoine.outlierReport(syn.T, syn.P, fit, { topN: 3 });
    expect(outliers.length).toBe(3);
    expect(outliers[0]).toHaveProperty("index");
    expect(outliers[0]).toHaveProperty("robustWeight");
  });

  it("loads CSV experimental data and rejects malformed input", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "antoine-test-"));
    try {
      const good = path.join(dir, "good.csv");
      writeFileSync(good, "temperature,pressure\n300,101325\n310,120000\n");
      const loaded = Antoine.loadExperimentalData(good, "K", "Pa");
      expect(loaded.temperaturesK.length).toBe(2);
      expect(loaded.pressuresPa.length).toBe(2);

      const bad = path.join(dir, "bad.csv");
      writeFileSync(bad, "temp,pres\n300,1\n");
      const malformed = Antoine.loadExperimentalData(bad, "K", "Pa");
      expect(malformed.temperaturesK.length).toBe(0);
      expect(malformed.pressuresPa.length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Antoine docs wrappers", () => {
  it("estimateCoefficients works with typed input", () => {
    const syn = makeSyntheticData();
    const Ts: Temperature[] = syn.T.map((v) => ({ value: v, unit: "K" }));
    const Ps: Pressure[] = syn.P.map((v) => ({ value: v, unit: "Pa" }));
    const res = estimateCoefficients(Ts, Ps);
    expect(res).not.toBeNull();
    expect((res as { A: number | null }).A).not.toBeNull();
  });

  it("estimateCoefficientsFromExperimentalData returns null for invalid path", () => {
    const res = estimateCoefficientsFromExperimentalData("not-found.csv");
    expect(res).toBeNull();
  });

  it("calcVaporPressure converts output unit", () => {
    const p = calcVaporPressure({ value: 300, unit: "K" }, 10, 2500, -30, {
      base: "log10",
      pressureUnit: "bar",
    });
    expect(p).not.toBeNull();
    expect((p as Pressure).unit).toBe("bar");
    expect((p as Pressure).value).toBeGreaterThan(0);
  });
});
