import { builtinModules } from "node:module";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import tsconfigPaths from "rollup-plugin-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };

const isProduction = (process.env.BUILD ?? "production") === "production";

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
        sourceMap: !isProduction,
    }),
];

const onwarn = (warning, warn) => {
    if (warning.code === "CIRCULAR_DEPENDENCY") {
        throw new Error(`Circular dependency detected: ${warning.message}`);
    }
    warn(warning);
};

const baseOutput = {
    sourcemap: !isProduction,
    compact: isProduction,
    minifyInternalExports: isProduction,
    generatedCode: {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
    },
};

export default [
    {
        input: "src/index.ts",
        external: isExternal,
        onwarn,
        plugins: jsPlugins,
        treeshake: {
            moduleSideEffects: false,
            propertyReadSideEffects: false,
            tryCatchDeoptimization: false,
        },
        output: [
            {
                ...baseOutput,
                file: "dist/index.mjs",
                format: "es",
            },
            {
                ...baseOutput,
                file: "dist/index.cjs",
                format: "cjs",
                exports: "named",
            },
            {
                ...baseOutput,
                file: "dist/index.browser.mjs",
                format: "es",
            },
        ],
    },
    {
        input: "src/index.ts",
        external: isExternal,
        onwarn,
        plugins: [tsconfigPaths(), dts({ tsconfig: "./tsconfig.json" })],
        output: {
            file: "dist/index.d.ts",
            format: "es",
        },
    },
];
