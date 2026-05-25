import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'climb-filters',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
