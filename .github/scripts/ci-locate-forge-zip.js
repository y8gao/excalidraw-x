/**
 * CI-only (see .github/workflows/ci.yml): find exactly one Forge ZIP under out/make
 * (e.g. ExcalidrawX-win32-x64-0.1.2.zip). Node avoids macOS bash 3.2 / cross-OS shell differences.
 */
const fs = require('fs');
const path = require('path');

const prefix = process.env.ZIP_PREFIX;
if (!prefix) {
  console.error('::error::ZIP_PREFIX is not set');
  process.exit(1);
}

function walkZipFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkZipFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith('.zip')) acc.push(full);
  }
  return acc;
}

const root = path.join(process.cwd(), 'out', 'make');
const zips = walkZipFiles(root)
  .filter((p) => {
    const base = path.basename(p);
    return base.startsWith(`${prefix}-`) && base.endsWith('.zip');
  })
  .sort();

if (zips.length === 0) {
  console.error(`::error::No ${prefix}-*.zip under out/make`);
  process.exit(1);
}
if (zips.length > 1) {
  console.error(`::error::Expected exactly one ${prefix}-*.zip, found ${zips.length}:`);
  for (const z of zips) console.error(z);
  process.exit(1);
}

const zipPath = path.resolve(zips[0]);
const stem = path.basename(zipPath, '.zip');
const ghOut = process.env.GITHUB_OUTPUT;
if (!ghOut) {
  console.error('::error::GITHUB_OUTPUT is not set');
  process.exit(1);
}

// Normalize for GITHUB_OUTPUT (forward slashes are accepted on all runners for paths)
const pathForOutput = zipPath.split(path.sep).join('/');
fs.appendFileSync(ghOut, `path=${pathForOutput}\n`);
fs.appendFileSync(ghOut, `stem=${stem}\n`);
