module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testMatch: ['**/src/**/*.test.js', '**/scripts/**/*.test.cjs'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}
