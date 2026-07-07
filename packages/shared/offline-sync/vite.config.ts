import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'offline-sync',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
