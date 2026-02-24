import { describe, expect, it } from "vitest";
import {
  Joback,
  JobackError,
  calcJoback,
  calcJobackHeatCapacity,
  calcJobackProperties,
  listAvailableJobackGroups,
  loadJobackTable,
} from "./joback";
import {
  jobackCalc,
  jobackGroupContributionCategory,
  jobackGroupContributionIds,
  jobackGroupContributionInfo,
  jobackGroupContributionNames,
  jobackHeatCapacityCalc,
  jobackPropCalc,
} from "../docs/joback";

describe("Joback canonical API", () => {
  it("parses the Joback CSV into 41 rows", () => {
    const rows = loadJobackTable();
    expect(rows).toHaveLength(41);
    expect(rows[0]).toHaveProperty("Tc");
    expect(rows[0]).toHaveProperty("EnVap");
    expect(rows[0]).toHaveProperty("ηa");
    expect(rows[0]).toHaveProperty("ηb");
  });

  it("lists available groups", () => {
    const groups = listAvailableJobackGroups();
    expect(groups).toHaveLength(41);
    expect(groups).toContain("-CH3");
    expect(groups).toContain("=CH- @ring");
    expect(groups).toContain("-OH @phenol");
  });

  it("supports alias-keyed numeric maps, GroupUnit maps, and field-name keyed objects", () => {
    const byNumber = calcJoback({ "-CH3": 2, "=CH- @ring": 3, "=C< @ring": 3, "-OH @phenol": 1 }, 18);
    const byGroupUnit = calcJoback(
      { "-CH3": { value: 2 }, "=CH- @ring": { value: 3 }, "=C< @ring": { value: 3 }, "-OH @phenol": { value: 1 } },
      18,
    );
    const byField = calcJoback({ methyl: { value: 2 }, vinyl_CH_ring: { value: 3 }, vinyl_C_ring: { value: 3 }, phenol_OH: { value: 1 } }, 18);

    expect(byNumber.boiling_point_temperature.value).toBeCloseTo(byGroupUnit.boiling_point_temperature.value as number, 12);
    expect(byNumber.boiling_point_temperature.value).toBeCloseTo(byField.boiling_point_temperature.value as number, 12);
    expect((byNumber.heat_capacity.value as (T: number) => number)(300)).toBeCloseTo((byField.heat_capacity.value as (T: number) => number)(300), 12);
  });

  it("normalizes Python shorthand aliases to canonical CSV aliases", () => {
    const aldehydeShort = calcJoback({ "O=CH-": 1 }, 3);
    const aldehydeCanonical = calcJoback({ "O=CH- @aldehyde": 1 }, 3);
    const acidShort = calcJoback({ "-COOH": 1 }, 5);
    const acidCanonical = calcJoback({ "-COOH @acid": 1 }, 5);
    const esterAlt = calcJoback({ "-COO- @ester": 1 }, 5);
    const esterCanonical = calcJoback({ "-COO-": 1 }, 5);
    const carbonylOtherAlt = calcJoback({ "=O @expect as above": 1 }, 2);
    const carbonylOtherCanonical = calcJoback({ "=O": 1 }, 2);

    expect(aldehydeShort.boiling_point_temperature.value).toBeCloseTo(aldehydeCanonical.boiling_point_temperature.value as number, 12);
    expect(acidShort.critical_pressure.value).toBeCloseTo(acidCanonical.critical_pressure.value as number, 12);
    expect(esterAlt.standard_enthalpy_of_vaporization.value).toBeCloseTo(
      esterCanonical.standard_enthalpy_of_vaporization.value as number,
      12,
    );
    expect((carbonylOtherAlt.heat_capacity.value as (T: number) => number)(300)).toBeCloseTo(
      (carbonylOtherCanonical.heat_capacity.value as (T: number) => number)(300),
      12,
    );
  });

  it("returns all expected properties and a callable heat capacity function", () => {
    const result = calcJoback({ "-CH3": 2, "=CH- @ring": 3, "=C< @ring": 3, "-OH @phenol": 1 }, 18);
    expect(result).toHaveProperty("freezing_point_temperature");
    expect(result).toHaveProperty("boiling_point_temperature");
    expect(result).toHaveProperty("critical_temperature");
    expect(result).toHaveProperty("critical_pressure");
    expect(result).toHaveProperty("critical_volume");
    expect(result).toHaveProperty("standard_enthalpy_of_formation_ideal_gas");
    expect(result).toHaveProperty("standard_gibbs_energy_of_formation_ideal_gas");
    expect(result).toHaveProperty("standard_enthalpy_of_fusion");
    expect(result).toHaveProperty("standard_enthalpy_of_vaporization");
    expect(result).toHaveProperty("heat_capacity");
    expect(typeof result.heat_capacity.value).toBe("function");
    const cp = (result.heat_capacity.value as (T: number) => number)(273);
    expect(Number.isFinite(cp)).toBe(true);
  });

  it("matches direct hand-calculation for a known phenol-like sample", () => {
    const sample = { "-CH3": 2, "=CH- @ring": 3, "=C< @ring": 3, "-OH @phenol": 1 } as const;
    const result = calcJoback(sample, 18);
    const rows = new Map(loadJobackTable().map((row) => [row.group, row]));
    const counts = Object.entries(sample) as Array<[string, number]>;
    const sigmaTb = counts.reduce((acc, [alias, count]) => acc + count * rows.get(alias as never)!.Tb, 0);
    const sigmaPc = counts.reduce((acc, [alias, count]) => acc + count * rows.get(alias as never)!.Pc, 0);
    const tbExpected = 198.2 + sigmaTb;
    const pcExpected = (0.113 + 0.0032 * 18 - sigmaPc) ** -2;

    expect(result.boiling_point_temperature.value).toBeCloseTo(tbExpected, 12);
    expect(result.critical_pressure.value).toBeCloseTo(pcExpected, 12);
  });

  it("exposes class API parity methods", () => {
    const instance = new Joback({ methyl: { value: 2 }, phenol_OH: { value: 1 }, vinyl_CH_ring: { value: 3 }, vinyl_C_ring: { value: 3 } }, 18);
    expect(instance.listAvailableGroups()).toHaveLength(41);
    expect(Object.keys(instance.groupContributionIndex)).toHaveLength(41);
    expect(instance.validGroups.length).toBeGreaterThan(0);
    expect(instance.calcProperties().boiling_point_temperature.value).toBeTypeOf("number");
    expect(typeof instance.calcHeatCapacity().value).toBe("function");
    expect(instance.calc().heat_capacity.symbol).toBe("Cp_IG");
  });

  it("throws JobackError for invalid inputs", () => {
    expect(() => calcJoback({ unknown_group: 1 }, 5)).toThrow(JobackError);
    expect(() => calcJoback({ "-CH3": -1 }, 5)).toThrow(JobackError);
    expect(() => calcJoback({ "-CH3": 1 }, 0)).toThrow(JobackError);
    expect(() => calcJoback({ "-CH3": Number.NaN }, 5)).toThrow(JobackError);
    expect(() => calcJoback({}, 5)).toThrow(JobackError);
  });

  it("supports props-only and heat-capacity-only canonical functions", () => {
    const props = calcJobackProperties({ "-CH3": 1, "-CH2- @non-ring": 1 }, 8);
    const heatCapacity = calcJobackHeatCapacity({ "-CH3": 1, "-CH2- @non-ring": 1 }, 8);
    expect(props).not.toHaveProperty("heat_capacity");
    expect(typeof heatCapacity.value).toBe("function");
    expect((heatCapacity.value as (T: number) => number)(300)).toBeTypeOf("number");
  });
});

describe("Joback docs compatibility wrappers", () => {
  it("returns group info/name/id arrays with 41 items", () => {
    const [names, ids] = jobackGroupContributionInfo();
    expect(names).toHaveLength(41);
    expect(ids).toHaveLength(41);
    expect(jobackGroupContributionNames()).toEqual(names);
    expect(jobackGroupContributionIds()).toEqual(ids);
  });

  it("returns categories preserving source labels and totaling 41 groups", () => {
    const category = jobackGroupContributionCategory();
    const total = Object.values(category).reduce((acc, items) => acc + items.length, 0);
    expect(total).toBe(41);
    expect(category).toHaveProperty("hologen increments");
  });

  it("returns null on invalid inputs instead of throwing", () => {
    expect(jobackCalc({ bad_key: 1 }, 5)).toBeNull();
    expect(jobackPropCalc({ bad_key: 1 }, 5)).toBeNull();
    expect(jobackHeatCapacityCalc({ bad_key: 1 }, 5)).toBeNull();
  });
});

