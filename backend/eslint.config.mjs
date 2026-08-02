// Minimal flat config: TypeScript recommended rules, no stylistic noise
// (formatting is not enforced here; keep the diff surface small).
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.cjs', '*.mjs'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Decorated Nest providers commonly use empty constructors for DI
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
);
