module.exports = {
  // TypeScript and JavaScript support
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  
  // Transform TypeScript and JavaScript files (including .tsx, .jsx)
  // Single pattern '^.+\\.[tj]sx?$' handles both .ts/.tsx and .js/.jsx files
  // Flat tsconfig object (no compilerOptions wrapper) fixes TS5023
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        strict: true,
        moduleResolution: 'node',
        allowJs: true,
        esModuleInterop: true,
        paths: {
          'infrastructure/lib/*': ['spartan-ai/infrastructure/lib/*'],
          '*': ['shared/*', 'functions/*'],
        },
      },
    }],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Test file patterns - focus on tests/ directory for better discovery
  testMatch: [
    '**/tests/**/*.test.ts',
  ],
  
  // Fix haste module collisions from duplicate functions/ and SpartanAI/functions/
  // Stronger ignore patterns to prevent duplicate package.json collisions
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
  
  // Snapshot serializers for circular JSON handling
  // Note: For circular structures in mocks (e.g., SNS/HTTP objects), use jest.spyOn()
  // instead of direct mocks to avoid "Converting circular structure to JSON" errors
  // Example: jest.spyOn(awsSdk, 'SNS').mockReturnValue({...}) instead of mocking entire objects
  snapshotSerializers: [],
  
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
