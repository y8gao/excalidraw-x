const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const assetsIconBase = path.join(__dirname, 'assets', 'icon');

/** WiX v3 default layout: …\WiX Toolset v3.xx\bin\candle.exe */
function findWixBinDir() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || !/^WiX Toolset v3\./i.test(ent.name)) continue;
      const bin = path.join(root, ent.name, 'bin');
      if (fs.existsSync(path.join(bin, 'candle.exe')) && fs.existsSync(path.join(bin, 'light.exe'))) {
        return bin;
      }
    }
  }
  return null;
}

/** electron-wix-msi only resolves `candle` / `light` via PATH. */
function ensureWixOnPath() {
  if (process.platform !== 'win32') return;
  const bin = findWixBinDir();
  if (!bin) return;
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path');
  if (!pathKey) return;
  const cur = process.env[pathKey] || '';
  const sep = path.delimiter;
  const norm = (p) => path.resolve(p).toLowerCase();
  const binNorm = norm(bin);
  if (cur.split(sep).filter(Boolean).some((p) => norm(p) === binNorm)) return;
  process.env[pathKey] = `${bin}${sep}${cur}`;
}

function wixCliAvailable() {
  if (process.platform !== 'win32') return false;
  try {
    execSync('candle -?', { stdio: 'ignore' });
    execSync('light -?', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

ensureWixOnPath();
const includeWinMsi = wixCliAvailable();
if (process.platform === 'win32' && !includeWinMsi) {
  console.warn(
    '[forge] Skipping WiX MSI: WiX Toolset v3 (candle.exe / light.exe) not on PATH. ' +
      'ZIP will still be built. Install WiX v3 or add its bin folder to PATH to produce an MSI.',
  );
}

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

const makers = [
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin', 'linux', 'win32'],
  },
];
if (includeWinMsi) {
  makers.push({
    name: '@electron-forge/maker-wix',
    platforms: ['win32'],
    config: {
      name: 'ExcalidrawX',
      description: 'Excalidraw desktop client.',
      manufacturer: 'Excalidraw',
      exe: 'ExcalidrawX.exe',
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      // Comma-separated, no dots — registers .excalidraw with this app (not .json).
      associateExtensions: 'excalidraw',
      shortcutFolderName: 'Excalidraw',
      // Stable per product; reuse across releases so MSI upgrades replace the same product.
      upgradeCode: 'c4e8f0a2-9b1d-4e7c-8f3a-2d6e1b9c0a7f',
    },
  });
}

module.exports = {
  packagerConfig,
  rebuildConfig: {},
  makers,
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
