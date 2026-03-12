const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.jsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
    publicPath: '/',
    clean: true,
  },
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    compress: true,
    static: {
      directory: path.resolve(__dirname, 'public'),
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html',
      inject: 'body',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'public', 'fonts'),
          to: path.resolve(__dirname, 'build', 'fonts'),
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.css'],
    modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
    conditionNames: ['import', 'module', 'production', 'browser'],
    alias: {
      'roughjs/bin/rough': path.resolve(__dirname, 'node_modules/roughjs/bin/rough.js'),
      'roughjs/bin/generator': path.resolve(__dirname, 'node_modules/roughjs/bin/generator.js'),
      'roughjs/bin/math': path.resolve(__dirname, 'node_modules/roughjs/bin/math.js'),
      'roughjs/bin/renderer': path.resolve(__dirname, 'node_modules/roughjs/bin/renderer.js'),
      'roughjs/bin/canvas': path.resolve(__dirname, 'node_modules/roughjs/bin/canvas.js'),
      'roughjs/bin/svg': path.resolve(__dirname, 'node_modules/roughjs/bin/svg.js'),
      'roughjs/bin/geometry': path.resolve(__dirname, 'node_modules/roughjs/bin/geometry.js'),
      'roughjs': path.resolve(__dirname, 'node_modules/roughjs/bundled/rough.esm.js'),
    },
  },
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};
