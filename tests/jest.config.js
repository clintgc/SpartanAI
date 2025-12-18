const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname),
  roots: ['<rootDir>'],
  testMatch: ['<rootDir>/unit/**/*.test.ts'],
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
};

