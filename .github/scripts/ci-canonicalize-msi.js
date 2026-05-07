/**
 * CI (see .github/workflows/ci.yml): copy the WiX MSI to the same public basename pattern as the ZIP:
 *   {MSI_PREFIX}-{ARTIFACT_SLUG}-{version}.msi
 * e.g. ExcalidrawX-win32-x64-0.1.5.msi
 *
 * electron-wix-msi names the file after the exe stem (e.g. ExcalidrawX.msi), which is easy to confuse
 * across platforms/releases; this matches the portable ZIP naming on the GitHub Release page.
 */
const fs = require('fs');
const path = require('path');

const src = process.env.FORGE_MSI_PATH;
const slug = process.env.ARTIFACT_SLUG;
const prefix = process.env.MSI_PREFIX;
if (!src || !slug || !prefix) {
  console.error('::error::FORGE_MSI_PATH, ARTIFACT_SLUG, and MSI_PREFIX must be set');
  process.exit(1);
}
const resolvedSrc = path.resolve(src);
if (!fs.existsSync(resolvedSrc)) {
  console.error(`::error::Source MSI not found: ${resolvedSrc}`);
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')).version;
const base = `${prefix}-${slug}-${version}.msi`;
const destDir = path.join(process.cwd(), 'out', 'gh-upload');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, base);
fs.copyFileSync(resolvedSrc, dest);

const stem = path.basename(dest, '.msi');
const ghOut = process.env.GITHUB_OUTPUT;
if (!ghOut) {
  console.error('::error::GITHUB_OUTPUT is not set');
  process.exit(1);
}
const pathForOutput = dest.split(path.sep).join('/');
fs.appendFileSync(ghOut, `path=${pathForOutput}\n`);
fs.appendFileSync(ghOut, `stem=${stem}\n`);
console.log(`Canonical MSI: ${pathForOutput}`);
