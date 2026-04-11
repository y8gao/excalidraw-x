'use strict'

const js = require('@eslint/js')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const jestPlugin = require('eslint-plugin-jest')
const globals = require('globals')

const reactSourceFiles = ['src/**/*.{js,jsx}']

module.exports = [
  {
    ignores: ['build/**', 'out/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: [
      'main.js',
      'preload.js',
      'forge.config.js',
      'webpack.config.js',
      'jest.config.cjs',
      'babel.config.cjs',
      '.github/scripts/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: reactSourceFiles,
    ignores: ['**/*.test.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.jest,
        require: 'readonly',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      jest: jestPlugin,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...jestPlugin.configs['flat/recommended'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['jest.setup.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.jest },
    },
    plugins: { jest: jestPlugin },
    rules: jestPlugin.configs['flat/recommended'].rules,
  },
]
