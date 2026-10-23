// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Edge Functions resolve bare imports through each function's deno.json; `deno check` verifies them.
    files: ['supabase/functions/**/*.ts'],
    rules: { 'import/no-unresolved': 'off' },
  },
]);
