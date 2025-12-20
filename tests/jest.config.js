const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname),
  testMatch: [
    '**/unit/**/*.test.ts'
  ],
  collectCoverageFrom: [
    '../functions/**/*.ts',
    '../shared/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  moduleNameMapper: {
    '^spartan-ai-shared$': '<rootDir>/../shared',
  },
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
  // For workspace setups, include both local and parent node_modules
  modulePaths: [
    '<rootDir>/node_modules',
    path.resolve(__dirname, '../node_modules'),
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Set NODE_PATH to help with module resolution in workspace
  testEnvironmentOptions: {
    NODE_PATH: path.resolve(__dirname, '../node_modules'),
  },
  // Ensure Jest can find all @jest packages from root node_modules
  resolver: undefined,
  // Use default test sequencer - this should prevent Jest from trying to resolve @jest/test-sequencer
  // If @jest/test-sequencer is missing, this will use Jest's built-in default
  testSequencer: undefined,
};

