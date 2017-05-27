const path = require('path');
const SRC = path.resolve(__dirname, 'src');

const config = {
  context: SRC,
  entry: {
    app: './index.js'
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  devServer: {
    open: true,
    contentBase: SRC,
  },
  module: {
    rules: [
      { test: /\.js$/,
        loader: 'babel-loader',
        query: {
          retainLines: true,
          presets: [
            "babel-preset-es2015", "react"
          ],
          plugins: [
            [ "babel-root-import", { "rootPathSuffix": "src" } ]
          ]
        }
      },
      { test: /\.(sass|scss)$/,
        use: [ 'style-loader', 'css-loader', 'sass-loader' ]
      }
    ]
  },
  devtool: "eval-source-map"
};

if (process.env.NODE_ENV === "production") {
  config.devtool = "source-map";
  // TODO
  // JSUglify plugin
  // Offline plugin
  // Bundle styles seperatly using plugins etc,
}

module.exports = config;
