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
    // Tauri desktop shell (Rust + generated bundle artifacts) and the
    // client distribution package are not part of the Next app's lint scope.
    'desktop/**',
    'dist-client/**',
  ]),
]);

export default eslintConfig;
