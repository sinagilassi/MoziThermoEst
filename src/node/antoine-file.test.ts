import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Antoine, loadExperimentalData } from "./antoine-file";

describe("Node Antoine file loader", () => {
  it("loads canonical arrays from CSV file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "antoine-node-test-"));
    const csvPath = join(dir, "data.csv");
    writeFileSync(csvPath, "Temperature,Pressure\n300,1000\n310,1300\n320,1700\n");

    const loaded = loadExperimentalData(csvPath, "K", "Pa");
    expect(loaded.temperaturesK).toEqual([300, 310, 320]);
    expect(loaded.pressuresPa).toEqual([1000, 1300, 1700]);

    const compat = Antoine.loadExperimentalData(csvPath, "K", "Pa");
    expect(compat.temperaturesK).toEqual([300, 310, 320]);
    expect(compat.pressuresPa).toEqual([1000, 1300, 1700]);

    rmSync(dir, { recursive: true, force: true });
  });
});
