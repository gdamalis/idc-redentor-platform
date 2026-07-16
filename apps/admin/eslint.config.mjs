import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
