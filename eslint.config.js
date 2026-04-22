import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions are Deno edge functions — different runtime, globals, and
  // import syntax (esm.sh URLs). They must not be linted by the browser ESLint config.
  { ignores: ["dist", "supabase/functions/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler rules (eslint-plugin-react-hooks 7.x). Production code
      // has been cleaned up so these are now enforced — keeps future regressions
      // out of main. Each remaining violation must be addressed with a code fix
      // or a narrow eslint-disable-next-line with a documented reason.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      // Still warn — shadcn/ui generated components export helpers alongside
      // components, and cleaning them up would diverge from upstream.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // @ts-ignore has no place in new code — use @ts-expect-error.
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      // Pre-existing test-code patterns — kept as warnings scoped to the test
      // override below so that production code is held to a stricter bar.
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty-pattern": "error",
      "no-useless-assignment": "error",
    },
  },
  {
    // Test code is held to a looser bar: fixtures, mocks, and spec helpers
    // frequently rely on `any`, empty destructure patterns (Playwright
    // fixtures), and throwaway assignments. Errors here would just produce
    // noise without improving runtime safety.
    files: [
      "**/*.{spec,test}.{ts,tsx}",
      "**/__tests__/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty-pattern": "off",
      "no-useless-assignment": "off",
    },
  },
);
