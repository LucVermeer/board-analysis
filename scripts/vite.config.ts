import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    name: 'scripts',
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
