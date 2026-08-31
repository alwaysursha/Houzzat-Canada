const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(__dirname, '../..');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  projectRoot,
  watchFolders: [
    monorepoRoot,
  ],
  resolver: {
    useWatchman: false,
    sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs', 'mjs'],
    nodeModulesPaths: [
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
  server: {
    enhanceMiddleware: (middleware) => middleware,
  },
};

module.exports = mergeConfig(defaultConfig, config);









