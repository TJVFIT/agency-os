import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Workspace extras:
    'supabase/**',
    'coverage/**',
    // Desktop shell is a separate Tauri/Rust project (its dist is plain HTML
    // and target/ holds generated build artifacts) — not part of the app lint.
    'desktop/**',
  ]),
]);

export default eslintConfig;
