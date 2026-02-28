# MoziThermoEst 🧪📈

[![npm version](https://img.shields.io/npm/v/mozithermoest?style=flat-square)](https://www.npmjs.com/package/mozithermoest)
[![npm downloads](https://img.shields.io/npm/dm/mozithermoest?color=brightgreen&style=flat-square)](https://www.npmjs.com/package/mozithermoest)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)

MoziThermoEst is a TypeScript toolkit for estimating thermodynamic properties with:

- Antoine vapor-pressure fitting and prediction 🌡️
- Joback group-contribution property estimation 🧬
- Unit-aware typed inputs (via `mozithermodb-settings`) 📦
- Compatibility wrappers for nullable/legacy flows 🔁

## Highlights ✨

- Canonical Antoine fitting from SI arrays (`K`, `Pa`)
- Typed Antoine wrappers with automatic unit normalization
- Robust fitting losses (`linear`, `soft_l1`, `huber`, `cauchy`, `arctan`)
- Joback table-backed calculations for 41 contribution groups
- Full Joback properties + heat-capacity function output

## Installation 📥

```bash
npm install mozithermoest
```

## Quick Start

### 1) Antoine fit + vapor pressure 🧊➡️💨

```ts
import { fitAntoine, calcVaporPressureWithUnits } from "mozithermoest";

const T_K = [298, 308, 318, 328, 338, 348];
const P_Pa = [3392.9, 5738.33, 9332.6, 14657.31, 22310.87, 33018.32];

const fit = fitAntoine(T_K, P_Pa, {
  base: "log10",
  fit_in_log_space: true,
  loss: "soft_l1",
});

const pBar = calcVaporPressureWithUnits(
  { value: 373.15, unit: "K" },
  fit.A,
  fit.B,
  fit.C,
  "bar",
  fit.base,
);

console.log(fit.A, fit.B, fit.C, pBar.vapor_pressure, pBar.unit);
```

### 2) Joback full properties 🧬

```ts
import { calcJoback } from "mozithermoest";

const groups = {
  "-CH3": 2,
  "=CH- @ring": 3,
  "=C< @ring": 3,
  "-OH @phenol": 1,
};

const result = calcJoback(groups, 18);
console.log(result.boiling_point_temperature);
console.log(result.critical_pressure);

if (result.heat_capacity.value) {
  console.log(result.heat_capacity.value(300), result.heat_capacity.unit);
}
```

## API Overview 🧭

### Antoine (canonical)

- `fitAntoine(TDataK, PDataPa, options)`
- `calcVaporPressure(temperature, A, B, C, base?)`
- `calcVaporPressureWithUnits(temperature, A, B, C, pressureUnit?, base?)`
- `loadExperimentalData(csvPath, temperatureUnit, pressureUnit)`
- `AntoineError`

### Antoine (compatibility wrappers)

- `estimateCoefficients(temperatures, pressures, options)` -> nullable result
- `estimateCoefficientsFromExperimentalData(path, options)` -> nullable result
- `calcVaporPressure(...)` / `calcVaporPressureWithUnits(...)` (legacy aliases exported too)
- `Antoine` class (legacy facade):
  - `Antoine.fitAntoine(...)`
  - `Antoine.outlierReport(...)`
  - `Antoine.calc(...)`
  - `Antoine.loadExperimentalData(...)`

### Joback (canonical)

- `loadJobackTable()`
- `listAvailableJobackGroups()`
- `calcJobackProperties(groups, totalAtomsNumber)`
- `calcJobackHeatCapacity(groups, totalAtomsNumber)`
- `calcJoback(groups, totalAtomsNumber)`
- `Joback` class and `JobackError`

### Joback (compatibility wrappers)

- `jobackCalc` / `joback_calc`
- `jobackPropCalc` / `joback_prop_calc`
- `jobackHeatCapacityCalc` / `joback_heat_capacity_calc`
- `jobackGroupContributionInfo` / `_info`
- `jobackGroupContributionNames` / `_names`
- `jobackGroupContributionIds` / `_ids`
- `jobackGroupContributionCategory` / `_category`

## Supported Units 📐

- Temperature: `K`, `C`, `F`, `R`
- Pressure: `Pa`, `kPa`, `bar`, `atm`, `psi`

Canonical Antoine fitting is always solved internally in `K` and `Pa`.

## Running Local Examples ▶️

From project root:

```bash
npx tsx examples/exp-1.ts
npx tsx examples/joback-exp-0.ts
npx tsx examples/joback-exp-1.ts
npx tsx examples/joback-exp-2.ts
npx tsx examples/joback-exp-3.ts
```

Notes:

- `examples/exp-1.ts` includes a CSV-path demo that points to an external local path; update that path before running that section.
- Joback examples show alias-keyed and field-name-keyed group payloads.

## 📄 License

Licensed under the Apache-2.0 License. See `LICENSE`.

## ❓ FAQ

For questions, contact Sina Gilassi on [LinkedIn](https://www.linkedin.com/in/sina-gilassi/).

## 👨‍💻 Author

- [@sinagilassi](https://github.com/sinagilassi)
