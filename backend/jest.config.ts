import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          module: 'commonjs',
          esModuleInterop: true,
          outDir: 'dist',
          rootDir: 'src',
        },
      },
    ],
  },
  // Collect coverage from source files only — not tests, not generated dist
  collectCoverageFrom: ['src/**/*.ts', '!src/__tests__/**', '!src/server.ts'],
  // Each test file gets a clean module registry so env-var manipulation is safe
  resetModules: false,
  // Increase timeout for integration tests that hit a real DB
  testTimeout: 15000,
};

export default config;
