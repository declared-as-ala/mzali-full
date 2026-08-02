/** Unit tests: colocated *.spec.ts under src/. No infrastructure required. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@contracts$': '<rootDir>/src/contracts',
    '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
  },
  clearMocks: true,
};
