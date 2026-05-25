import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    name: 'crypto',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      NODE_ENV: 'development',
    },
  },
});
