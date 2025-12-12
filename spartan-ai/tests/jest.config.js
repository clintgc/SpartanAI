module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/../'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'functions/**/*.ts',
    'shared/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  moduleNameMapper: {
    '^spartan-ai-shared$': '<rootDir>/../shared',
  },
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
};

