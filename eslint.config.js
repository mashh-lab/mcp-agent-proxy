import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.mastra/',
      'examples/mastra-server-with-mcp.ts',
      'mastra-mcp-server.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommended, eslintPluginPrettierRecommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    rules: {
      // You can add custom rules here if needed
      // e.g. '@typescript-eslint/no-unused-vars': 'warn'
    },
  },
  {
    // More lenient rules for test files
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests for mocking
    },
  },
)
