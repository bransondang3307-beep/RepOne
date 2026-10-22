/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'Node16', moduleResolution: 'Node16', isolatedModules: true } }],
  },
};
