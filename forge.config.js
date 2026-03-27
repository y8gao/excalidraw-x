const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'excalidraw-x',
    asar: true,
    icon: undefined, // TODO: Add icon path when available
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
    // Windows-specific configurations
    win32metadata: {
      CompanyName: 'Excalidraw',
      ProductName: 'Excalidraw X',
    },
    // Code signing (optional, configure when you have a certificate)
    // windowsSign: {
    //   certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    //   certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    //   signingHashAlgorithms: ['sha256'],
    // },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'excalidraw-x',
        // Installer icon
        // iconUrl: 'https://example.com/icon.ico',
        // Setup icon
        // setupIcon: './assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses provide additional security hardening
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

