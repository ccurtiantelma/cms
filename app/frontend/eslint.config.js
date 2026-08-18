import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    // Generato da `openapi-typescript` (script `openapi:types`) — stile di
    // quoting non controllabile dal nostro Prettier, va rigenerato mai lintato a mano.
    // `blocks.types.ts` è generato allo stesso modo da `blocks:export`/`blocks:types`
    // (PLAN-F02-blocchi.md T6): stessa ragione, stesso trattamento.
    ignores: ['src/types/api.types.ts', 'src/types/blocks.types.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // `eslint-plugin-react-hooks` v7 include le regole "React Compiler" (più
      // severe delle classiche rules-of-hooks/exhaustive-deps) nel preset
      // `recommended`. Disabilitate qui perché generano falsi positivi sui
      // pattern legittimi e diffusi in questa base (setState in un effect per
      // sincronizzare stato da localStorage/token al mount, redirect via
      // `window.location.href` dentro handler async dopo un await): non sono
      // bug, sono l'implementazione voluta di `useAuth`, `useColorScheme`,
      // `usePaginatedList` e dei flussi di logout/impersonificazione.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'prettier/prettier': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/jsx-key': 'error',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
];
