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
          rootDir: '.',
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
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
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  
  // Fix haste module collisions from duplicate functions/ and SpartanAI/functions/
  // Ignore SpartanAI and spartan-ai directories to prevent duplicate package.json collisions
  testPathIgnorePatterns: [
    '/SpartanAI/',
    '/spartan-ai/',
    '/node_modules/',
  ],
  
  // Module name mapper to handle collisions and remap duplicates
  moduleNameMapper: {
    // Remap SpartanAI/* imports to functions/* to avoid collisions
    '^SpartanAI/(.*)$': '<rootDir>/functions/$1',
    // Map infrastructure/lib/* to spartan-ai/infrastructure/lib/* for TS2307 module not found
    '^infrastructure/lib/(.*)$': '<rootDir>/spartan-ai/infrastructure/lib/$1',
    // Map shared module
    '^spartan-ai-shared$': '<rootDir>/shared',
  },
  
  // Collect coverage from source files (excluding duplicates)
  collectCoverageFrom: [
    'functions/**/*.ts',
    'shared/**/*.ts',
    '!SpartanAI/**',
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Root directory
  rootDir: '.',
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Worker memory limit to prevent child process exceptions
  workerIdleMemoryLimit: '512MB',
  
  // Don't bail on first failure - run all tests
  bail: false,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Max workers to prevent memory issues
  maxWorkers: '50%',
};
