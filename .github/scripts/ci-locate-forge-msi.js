/**
 * CI-only: find exactly one WiX MSI under out/make (Windows package job only).
 */
const fs = require('fs');
const path = require('path');

const prefix = process.env.MSI_PREFIX;
if (!prefix) {
  console.error('::error::MSI_PREFIX is not set');
  process.exit(1);
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.isFile() && ent.name.endsWith('.msi')) acc.push(full);
  }
  return acc;
}

const root = path.join(process.cwd(), 'out', 'make');
let msis = walk(root)
  .filter((p) => path.basename(p).toLowerCase().endsWith('.msi'))
  .sort();

if (msis.length > 1) {
  const pref = msis.filter((p) =>
    path.basename(p).toLowerCase().startsWith(`${prefix.toLowerCase()}`),
  );
  if (pref.length === 1) msis = pref;
}

if (msis.length === 0) {
  console.error(`::error::No .msi under out/make (prefix hint: ${prefix})`);
  process.exit(1);
}
if (msis.length > 1) {
  console.error(`::error::Expected one .msi under out/make, found ${msis.length}:`);
  for (const m of msis) console.error(m);
  process.exit(1);
}

const msiPath = path.resolve(msis[0]);
const stem = path.basename(msiPath, '.msi');
const ghOut = process.env.GITHUB_OUTPUT;
if (!ghOut) {
  console.error('::error::GITHUB_OUTPUT is not set');
  process.exit(1);
}

const pathForOutput = msiPath.split(path.sep).join('/');
fs.appendFileSync(ghOut, `path=${pathForOutput}\n`);
fs.appendFileSync(ghOut, `stem=${stem}\n`);
