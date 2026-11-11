import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
  globalIgnores([
    '.tmp/**',
    '.next/**',
    'node_modules/**',
    'next-env.d.ts',
    'coverage/**',
    'public/vad/**',
  ]),
]);
