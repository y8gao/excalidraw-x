/**
 * CI (see .github/workflows/ci.yml): copy the Forge-built ZIP to a predictable public name:
 *   {ZIP_PREFIX}-{ARTIFACT_SLUG}-{version}.zip
 * e.g. ExcalidrawX-win32-x64-0.1.3.zip
 *
 * Forge's own name uses the packaged folder basename; this step guarantees unique,
 * platform-clear filenames on the GitHub Release page.
 */
const fs = require('fs');
const path = require('path');

const src = process.env.FORGE_ZIP_PATH;
const slug = process.env.ARTIFACT_SLUG;
const prefix = process.env.ZIP_PREFIX;
if (!src || !slug || !prefix) {
  console.error('::error::FORGE_ZIP_PATH, ARTIFACT_SLUG, and ZIP_PREFIX must be set');
  process.exit(1);
}
const resolvedSrc = path.resolve(src);
if (!fs.existsSync(resolvedSrc)) {
  console.error(`::error::Source ZIP not found: ${resolvedSrc}`);
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')).version;
const base = `${prefix}-${slug}-${version}.zip`;
const destDir = path.join(process.cwd(), 'out', 'gh-upload');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, base);
fs.copyFileSync(resolvedSrc, dest);

const stem = path.basename(dest, '.zip');
const ghOut = process.env.GITHUB_OUTPUT;
if (!ghOut) {
  console.error('::error::GITHUB_OUTPUT is not set');
  process.exit(1);
}
const pathForOutput = dest.split(path.sep).join('/');
fs.appendFileSync(ghOut, `path=${pathForOutput}\n`);
fs.appendFileSync(ghOut, `stem=${stem}\n`);
console.log(`Canonical ZIP: ${pathForOutput}`);
