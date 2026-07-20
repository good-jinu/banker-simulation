import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: [
            "@babel/plugin-syntax-jsx",
            ["@babel/plugin-syntax-typescript", { isTSX: true }],
          ],
        },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
      },
    },
  },
];
