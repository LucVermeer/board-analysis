import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'playback-react',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
