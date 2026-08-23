import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "out/**",
      "*.vsix"
    ]
  },
  {
    files: [
      "src/**/*.ts",
      "test/**/*.ts"
    ],
    extends: [
      tseslint.configs.recommendedTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          "checksVoidReturn": false
        }
      ]
    }
  },
  {
    files: [
      "test/**/*.ts"
    ],
    rules: {
      "@typescript-eslint/no-floating-promises": "off"
    }
  }
);
