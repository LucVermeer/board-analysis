import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'i18n',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
