'use strict'

const path = require('path')

function listDirectories(fs, dirPath) {
  if (!fs.existsSync(dirPath)) return []
  return fs.readdirSync(dirPath).filter((name) => fs.existsSync(path.win32.join(dirPath, name)))
}

function sortDescending(values) {
  return [...values].sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }))
}

function prependEnvPath(currentValue, values) {
  const current = (currentValue || '').split(path.delimiter).filter(Boolean)
  return [...new Set([...values.filter(Boolean), ...current])].join(path.delimiter)
}

function findLatestMsvc(fs, env) {
  const roots = [
    env.ProgramFiles && path.win32.join(env.ProgramFiles, 'Microsoft Visual Studio'),
    env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'Microsoft Visual Studio'),
  ].filter(Boolean)

  for (const root of roots) {
    for (const year of sortDescending(listDirectories(fs, root))) {
      const yearRoot = path.win32.join(root, year)
      for (const edition of sortDescending(listDirectories(fs, yearRoot))) {
        const toolsRoot = path.win32.join(yearRoot, edition, 'VC', 'Tools', 'MSVC')
        for (const version of sortDescending(listDirectories(fs, toolsRoot))) {
          const versionRoot = path.win32.join(toolsRoot, version)
          const linkDir = path.win32.join(versionRoot, 'bin', 'Hostx64', 'x64')
          const linkPath = path.win32.join(linkDir, 'link.exe')
          const libDir = path.win32.join(versionRoot, 'lib', 'x64')
          if (fs.existsSync(linkPath) && fs.existsSync(libDir)) {
            return { linkDir, linkPath, libDir, version }
          }
        }
      }
    }
  }

  return null
}

function findLatestWindowsSdk(fs, env) {
  const kitsRoot = env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'Windows Kits', '10')
  if (!kitsRoot) return null

  const libRoot = path.win32.join(kitsRoot, 'Lib')
  const includeRoot = path.win32.join(kitsRoot, 'Include')
  const binRoot = path.win32.join(kitsRoot, 'bin')

  for (const version of sortDescending(listDirectories(fs, libRoot))) {
    const ucrtLibDir = path.win32.join(libRoot, version, 'ucrt', 'x64')
    const umLibDir = path.win32.join(libRoot, version, 'um', 'x64')
    const includeDirs = [
      path.win32.join(includeRoot, version, 'ucrt'),
      path.win32.join(includeRoot, version, 'shared'),
      path.win32.join(includeRoot, version, 'um'),
      path.win32.join(includeRoot, version, 'winrt'),
      path.win32.join(includeRoot, version, 'cppwinrt'),
    ].filter((dirPath) => fs.existsSync(dirPath))
    const binDir = path.win32.join(binRoot, version, 'x64')

    if (
      fs.existsSync(path.win32.join(ucrtLibDir, 'ucrt.lib')) &&
      fs.existsSync(path.win32.join(umLibDir, 'kernel32.lib')) &&
      fs.existsSync(path.win32.join(binDir, 'rc.exe')) &&
      fs.existsSync(path.win32.join(binDir, 'mt.exe')) &&
      includeDirs.length >= 3
    ) {
      return { version, ucrtLibDir, umLibDir, includeDirs, binDir }
    }
  }

  return null
}

function resolveWindowsBuildEnv({ env = process.env, fs = require('fs'), platform = process.platform } = {}) {
  if (platform !== 'win32') {
    return { ok: true, env }
  }

  const msvc = findLatestMsvc(fs, env)
  if (!msvc) {
    return {
      ok: false,
      message: 'Microsoft C++ Build Tools were not found. Install Visual Studio Build Tools with the Desktop development with C++ workload.',
    }
  }

  const sdk = findLatestWindowsSdk(fs, env)
  if (!sdk) {
    return {
      ok: false,
      message: 'Windows SDK libraries/tools were not found. Install the Windows 10/11 SDK so kernel32.lib, rc.exe, and mt.exe are available.',
    }
  }

  const nextEnv = { ...env }
  nextEnv.PATH = prependEnvPath(env.PATH, [msvc.linkDir, sdk.binDir])
  nextEnv.LIB = prependEnvPath(env.LIB, [msvc.libDir, sdk.ucrtLibDir, sdk.umLibDir])
  nextEnv.INCLUDE = prependEnvPath(env.INCLUDE, sdk.includeDirs)

  return {
    ok: true,
    env: nextEnv,
    details: { msvc, sdk },
  }
}

function getTauriLaunchSpec({
  platform = process.platform,
  nodeExecPath = process.execPath,
  repoRoot = path.resolve(__dirname, '..'),
  args = [],
} = {}) {
  if (platform === 'win32') {
    return {
      command: nodeExecPath,
      args: [path.win32.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args],
    }
  }

  return {
    command: nodeExecPath,
    args: [path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args],
  }
}

module.exports = {
  findLatestMsvc,
  findLatestWindowsSdk,
  getTauriLaunchSpec,
  resolveWindowsBuildEnv,
}
