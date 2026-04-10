const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const assetsIconBase = path.join(__dirname, 'assets', 'icon');

const packagerConfig = {
  name: 'ExcalidrawX',
  asar: true,
  icon: assetsIconBase,
  // Explicit ignore rules (overrides .gitignore so 'build/' is included)
  ignore: [
    /^\/src$/,
    /^\/src\//,
    /^\/public$/,
    /^\/public\//,
    /^\/\.gitignore$/,
    /^\/\.git($|\/)/,
    /^\/webpack\.config\.js$/,
    /^\/index\.html$/,
    /^\/\.env/,
    /^\/README\.md$/,
    /^\/\.copilot($|\/)/,
    /\.map$/,
  ],
  win32metadata: {
    CompanyName: 'Excalidraw',
    ProductName: 'Excalidraw X',
  },
};

if (process.env.WINDOWS_CERTIFICATE_FILE) {
  packagerConfig.windowsSign = {
    certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD || '',
    signingHashAlgorithms: ['sha256'],
  };
}

module.exports = {
  packagerConfig,
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
