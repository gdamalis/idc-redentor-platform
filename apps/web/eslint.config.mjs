import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: [
      "scripts/**/*.js",
      "src/**/__generated",
      ".next/**",
      "node_modules/**",
      ".claude/**",
      "coverage/**",
    ],
  },
];

export default eslintConfig;
