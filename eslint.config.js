// ESLint flat config for the whole monorepo. Type errors are tsc's job (npm run typecheck);
// ESLint catches likely bugs and React hook mistakes.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-types/**", "**/node_modules/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Allow intentionally unused names when prefixed with _ (e.g. `(_label, input) => ...`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },

  {
    files: ["server/src/**/*.ts", "*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
