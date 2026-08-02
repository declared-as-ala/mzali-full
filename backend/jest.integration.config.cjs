/**
 * Integration tests: require the dev infrastructure from deploy/docker-compose
 * (MongoDB single-node replica set, Redis, MinIO). Configure via backend/.env
 * or environment variables; specs skip themselves when infra is unreachable.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@contracts$': '<rootDir>/src/contracts',
    '^@contracts/(.*)$': '<rootDir>/src/contracts/$1',
    // archiver@8 ships pure ESM; Jest's CJS runtime can't require() it.
    // Redirect to a CJS stub — see test/mocks/archiver.js for rationale.
    '^archiver$': '<rootDir>/test/mocks/archiver.js',
  },
  clearMocks: true,
  testTimeout: 30000,
};
