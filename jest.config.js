module.exports = {
  // TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  
  // Fix haste module collisions from duplicate functions/ and SpartanAI/functions/
  // Ignore SpartanAI directory to prevent duplicate package.json collisions
  testPathIgnorePatterns: [
    '/node_modules/',
    '/SpartanAI/',
    '/spartan-ai/',
    '/coverage/',
  ],
  
  // Module name mapper to handle collisions and remap duplicates
  moduleNameMapper: {
    // Remap SpartanAI/* imports to functions/* to avoid collisions
    '^SpartanAI/(.*)$': '<rootDir>/functions/$1',
    // Map shared module
    '^spartan-ai-shared$': '<rootDir>/shared',
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
  
  // TypeScript configuration
  globals: {
    'ts-jest': {
      // Use root tsconfig.json if it exists, otherwise use inline config
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['es2020'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
    },
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Root directory
  rootDir: '.',
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
};
