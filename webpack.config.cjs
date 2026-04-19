const path = require('path');

module.exports = (env, argv) => {
  const isDev = argv.mode !== 'production';
  return {
    mode: isDev ? 'development' : 'production',
    entry: './source/scripts/index.js',
    output: {
      path: path.resolve(__dirname, 'build/scripts'),
      filename: 'index.js',
      publicPath: 'scripts/',
    },
    devtool: isDev ? 'source-map' : false,
    target: 'web',
    module: {
      rules: [],
    },
    resolve: {
      extensions: ['.js'],
    },
  };
};
