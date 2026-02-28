import { builtinModules } from "node:module";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import tsconfigPaths from "rollup-plugin-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };

const externalDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);

const isExternal = (id) => {
    if (id.startsWith(".") || id.startsWith("/") || id.startsWith("@/")) {
        return false;
    }

    const [scopeOrName, maybeName] = id.split("/");
    const packageName = scopeOrName.startsWith("@") && maybeName
        ? `${scopeOrName}/${maybeName}`
        : scopeOrName;

    return externalDeps.has(id) || externalDeps.has(packageName);
};

const jsPlugins = [
    tsconfigPaths(),
    nodeResolve({ extensions: [".mjs", ".js", ".json", ".ts"] }),
    typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
    }),
];

export default [
    {
        input: "src/index.ts",
        external: isExternal,
        plugins: jsPlugins,
        output: [
            {
                file: "dist/index.mjs",
                format: "es",
                sourcemap: true,
            },
            {
                file: "dist/index.cjs",
                format: "cjs",
                exports: "named",
                sourcemap: true,
            },
            {
                file: "dist/index.browser.mjs",
                format: "es",
                sourcemap: true,
            },
        ],
    },
    {
        input: "src/index.ts",
        external: isExternal,
        plugins: [tsconfigPaths(), dts({ tsconfig: "./tsconfig.json" })],
        output: {
            file: "dist/index.d.ts",
            format: "es",
        },
    },
];