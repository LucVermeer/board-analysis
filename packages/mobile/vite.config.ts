import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mobile',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
