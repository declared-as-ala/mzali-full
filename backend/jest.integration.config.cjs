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
  },
  clearMocks: true,
  testTimeout: 30000,
};
