module.exports = {
  // TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Transform TypeScript and JavaScript files
  transform: {
    '^.+\\.ts$': ['ts-jest', {
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
          paths: {
            '*': ['shared/*', 'functions/*', 'infrastructure/*', 'spartan-ai/infrastructure/lib/*'],
          },
        },
      },
    }],
    '^.+\\.js$': 'ts-jest',
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  
  // Fix haste module collisions from duplicate functions/ and SpartanAI/functions/
  // Ignore SpartanAI and spartan-ai directories to prevent duplicate package.json collisions
  testPathIgnorePatterns: [
    '/node_modules/',
    '/SpartanAI/',
    '/spartan-ai/',
    '/dist/',
    '/coverage/',
  ],
  
  // Module name mapper to handle collisions and remap duplicates
  moduleNameMapper: {
    // Remap SpartanAI/* imports to functions/* to avoid collisions
    '^SpartanAI/(.*)$': '<rootDir>/functions/$1',
    // Map shared module
    '^spartan-ai-shared$': '<rootDir>/shared',
    // Map infrastructure/lib/* to spartan-ai/infrastructure/lib/* for TS2307 module not found
    // Handles imports like '../../infrastructure/lib/cost-monitoring'
    '^.*infrastructure/lib/(.*)$': '<rootDir>/spartan-ai/infrastructure/lib/$1',
    // Also handle direct infrastructure/lib imports
    '^infrastructure/lib/(.*)$': '<rootDir>/spartan-ai/infrastructure/lib/$1',
  },
  
  // Collect coverage from source files (excluding duplicates)
  collectCoverageFrom: [
    'functions/**/*.ts',
    'shared/**/*.ts',
    'infrastructure/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/SpartanAI/**',
    '!**/spartan-ai/**',
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Root directory
  rootDir: '.',
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
};
