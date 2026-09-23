import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const scope = {
  basePath: fileURLToPath(new URL('../../../', import.meta.url)),
  files: ['apps/server/src/modules/YoulinSecurity/revocationGate.ts'],
};

// Explicitly isolated strict rules, not the repository's full LobeHub preset.
export default [
  ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, ...scope })),
  {
    ...scope,
    // This runtime boundary deliberately defends against malformed JS values.
    // The root preset removes inline suppressions for this inactive root rule;
    // keep the narrow exception here instead of deleting runtime guards.
    rules: { '@typescript-eslint/no-unnecessary-condition': 'off' },
    languageOptions: {
      parserOptions: {
        project: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
        tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
      },
    },
  },
];
