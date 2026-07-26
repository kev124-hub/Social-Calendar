import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-handoff reference files. They are written against the repo but
    // are documentation, not build inputs — they import modules that only
    // exist once the redesign lands. Also excluded in tsconfig.json.
    "docs/**",
  ]),
]);

export default eslintConfig;
