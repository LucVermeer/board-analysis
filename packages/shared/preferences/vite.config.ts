import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'preferences',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
