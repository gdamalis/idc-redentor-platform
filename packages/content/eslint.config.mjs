import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: ["node_modules/**"],
  },
];

export default eslintConfig;
