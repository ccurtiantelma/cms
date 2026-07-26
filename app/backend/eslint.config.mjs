import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import jsdocPlugin from 'eslint-plugin-jsdoc';

export default [
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      jsdoc: jsdocPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],
      // Enforcement policy JSDoc dello starter-kit (CLAUDE.md: "Ogni funzione pubblica con commento JSDoc")
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: false,
          },
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-type': 'off', // Gestito da TypeScript
      'jsdoc/require-returns-type': 'off',
    },
  },
];
