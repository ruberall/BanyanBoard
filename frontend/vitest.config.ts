import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import { resolve } from 'path'

const srcDir = resolve(__dirname, './src')

// Separate vite.config.ts (build) and vitest.config.ts (tests) to work around a version conflict
// between Vite 8 and Vitest 3. Vitest 3 bundles an older Vite; merging configs avoids import issues.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      alias: [{ find: '@', replacement: srcDir }],
      exclude: ['node_modules/**', 'e2e/**'],
    },
  }),
)
