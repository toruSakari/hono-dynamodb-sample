import { defineConfig } from "vite-plus";

// agent-ready-boilerplateのVite+設定から、Node APIに必要な検証だけを採用する。
export default defineConfig({
  fmt: {
    printWidth: 100,
    objectWrap: "preserve",
    endOfLine: "lf",
    insertFinalNewline: true,
    ignorePatterns: ["package-lock.json"],
  },
  lint: {
    plugins: ["typescript", "import"],
    rules: {
      "typescript/no-explicit-any": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-call": "error",
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", 10],
      "max-depth": ["error", 3],
      "max-nested-callbacks": ["error", 2],
      "no-nested-ternary": "error",
      curly: ["error", "all"],
      "array-callback-return": "error",
      "no-async-promise-executor": "error",
      "no-fallthrough": "error",
      "no-useless-catch": "error",
      "no-useless-return": "error",
      "prefer-const": "error",
      "no-unneeded-ternary": ["error", { defaultAssignment: false }],
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    },
    overrides: [
      {
        // クラスの各メソッドと違い、クロージャfactoryは操作群全体が1関数に数えられる。
        // 型ルールは緩めず、この構造だけ長さの警告基準を調整する。
        files: [
          "src/domain/entities/*.ts",
          "src/application/use-cases/*-service.ts",
          "src/infrastructure/dynamodb/repositories/*-repository.ts",
        ],
        rules: {
          "max-lines-per-function": [
            "warn",
            { max: 150, skipBlankLines: true, skipComments: true },
          ],
        },
      },
      {
        files: ["**/*.test.ts", "**/*.integration.ts"],
        rules: {
          "max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
          "max-lines-per-function": [
            "warn",
            { max: 150, skipBlankLines: true, skipComments: true },
          ],
          "max-nested-callbacks": ["error", 4],
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: "error",
    },
    ignorePatterns: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },
  run: {
    cache: true,
  },
});
