import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'playlist-generator',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
