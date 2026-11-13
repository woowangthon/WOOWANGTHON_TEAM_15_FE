const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'artifacts/**'] },
  { files: ['scripts/**/*.mjs', 'tests/**/*.ts'], languageOptions: {
    globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', Response: 'readonly', AbortController: 'readonly' },
  } },
]);
