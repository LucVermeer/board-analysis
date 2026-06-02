import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'profile-stats',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
