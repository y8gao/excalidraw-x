import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve('.')

describe('desktop multi-instance policy', () => {
  it('does not install the Tauri single-instance plugin', () => {
    const cargoToml = fs.readFileSync(path.join(repoRoot, 'src-tauri', 'Cargo.toml'), 'utf8')
    const appLib = fs.readFileSync(path.join(repoRoot, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    const cargoLock = fs.readFileSync(path.join(repoRoot, 'src-tauri', 'Cargo.lock'), 'utf8')

    expect(cargoToml).not.toContain('tauri-plugin-single-instance')
    expect(appLib).not.toContain('tauri_plugin_single_instance')
    expect(cargoLock).not.toContain('name = "tauri-plugin-single-instance"')
  })
})