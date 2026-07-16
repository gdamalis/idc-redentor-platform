import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/service/database.service.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='db'][arguments.length=0]",
          message:
            "Bare client.db() is banned in apps/admin — use getAdminDb() (asserted) or an explicit client.db(\"website\").",
        },
      ],
    },
  },
];

export default eslintConfig;
