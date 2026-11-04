// ESLint's flat config. Deliberately thin: `vue-tsc --noEmit` already holds
// this code to a strict TypeScript contract (tsconfig.json has `strict`,
// `noUnusedLocals` and `noUnusedParameters`), so the type-aware lint rules
// would mostly restate what typecheck already fails on. What is left for
// ESLint is what the compiler cannot see — single-file-component rules, and
// the handful of correctness rules below.
//
// Run it with `npm run lint`; `npm run lint:fix` applies the fixable half.
import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import vueTs from "@vue/eslint-config-typescript";

export default [
  // Not in `extend-exclude` territory: these are directories ESLint should
  // never walk. `dist/` is Vite's local output; the plugin's static folder is
  // the built bundle, which lives outside web/ and so needs no entry here.
  { ignores: ["dist/**", "node_modules/**"] },

  js.configs.recommended,

  // `flat/essential`, not `flat/recommended`. The recommended tiers are mostly
  // template formatting — one attribute per line, a line break inside every
  // single-line element — and this repo has no formatter for `.vue` files to
  // apply them, so turning them on would mean either reformatting every
  // template by hand or running CI with warnings it ignores. Essential is the
  // tier that catches actual Vue mistakes, and CI runs it with
  // `--max-warnings 0` so nothing it reports can be ignored.
  ...pluginVue.configs["flat/essential"],

  // Parses `<script setup lang="ts">` blocks with the TypeScript parser and
  // turns off the core rules TypeScript itself owns (no-undef chief among
  // them, which cannot see type-only identifiers).
  ...vueTs(),

  {
    files: ["src/**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The bundle has no logging destination — nobody reads a browser
      // console on a met service's wall display — so a stray `console.log`
      // left in after debugging is noise that ships. `warn` and `error`
      // stay: they are how a real failure surfaces to whoever is looking.
      "no-console": ["error", { allow: ["warn", "error"] }],

      // The rule guards against a component name colliding with a current or
      // future HTML element, which matters for a library whose components are
      // registered globally into someone else's app. These are this app's own
      // and every one is imported by name in the file that uses it, where the
      // import binding wins over any element of the same name. `Rail` and
      // `Legend` are what the README calls them and what the layout calls
      // them; renaming them to satisfy a rule aimed at libraries would make
      // the code read worse.
      "vue/multi-word-component-names": "off",

      // Unused code is a typecheck failure for locals and parameters, but
      // not for an unused *import* alias or a caught error, so claim those
      // here. The argsIgnorePattern matches tsconfig's own convention of a
      // leading underscore for a parameter kept for its position.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

  // Vite's config and this file run in Node, not the browser.
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
