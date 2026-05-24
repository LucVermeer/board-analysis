import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'play-view',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
