module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testMatch: ['**/src/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}
