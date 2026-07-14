import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Next.js ESLint configs are CommonJS modules.
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

/** Shared flat-config base for every @idcr app/package. */
export const eslintBase = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Allow require() in JavaScript config files
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintBase;
