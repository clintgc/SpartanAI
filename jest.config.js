module.exports = {
  // TypeScript and JavaScript support
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  
  // Transform TypeScript and JavaScript files (including .tsx, .jsx)
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          strict: true,
          moduleResolution: 'node',
          allowJs: true,
          paths: {
            'infrastructure/lib/*': ['spartan-ai/infrastructure/lib/*'],
            '*': ['shared/*', 'functions/*'],
          },
        },
      },
    }],
    '^.+\\.jsx?$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          allowJs: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    }],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Test file patterns - focus on tests/ directory
  testMatch: [
    '**/tests/**/*.test.ts',
  ],
  
  // Fix haste module collisions from duplicate functions/ and SpartanAI/functions/
  // Ignore SpartanAI and spartan-ai directories to prevent duplicate package.json collisions
  testPathIgnorePatterns: [
    '/SpartanAI/',
    '/spartan-ai/',
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],
  
  // Module name mapper to handle collisions and remap duplicates
  moduleNameMapper: {
    // Remap SpartanAI/* imports to functions/* to avoid collisions
    '^SpartanAI/(.*)$': '<rootDir>/functions/$1',
    // Map infrastructure/lib/* to spartan-ai/infrastructure/lib/* for TS2307 module not found
    '^infrastructure/lib/(.*)$': '<rootDir>/spartan-ai/infrastructure/lib/$1',
  },
  
  // Collect coverage from source files (excluding duplicates)
  collectCoverageFrom: [
    'functions/**/*.ts',
    'shared/**/*.ts',
    'infrastructure/**/*.ts',
    '!**/SpartanAI/**',
    '!**/spartan-ai/**',
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Root directory
  rootDir: '.',
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Worker memory limit to prevent child process exceptions
  workerIdleMemoryLimit: '512MB',
  
  // Max workers to prevent memory issues and child process exceptions
  maxWorkers: '50%',
  
  // Don't bail on first failure - run all tests
  bail: false,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
};
