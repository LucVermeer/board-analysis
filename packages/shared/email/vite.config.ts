import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'email',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
