import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'board-react',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
