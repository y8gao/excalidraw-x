const { getTauriLaunchSpec, resolveWindowsBuildEnv } = require('./windowsBuildEnv.cjs')

function createFs(entries) {
  const dirs = new Map()
  const files = new Set()

  const addDir = (dirPath) => {
    if (!dirs.has(dirPath)) dirs.set(dirPath, new Set())
  }

  for (const entry of entries) {
    const normalized = entry.replaceAll('/', '\\')
    const parts = normalized.split('\\')
    for (let i = 1; i < parts.length; i++) {
      const currentDir = parts.slice(0, i).join('\\')
      addDir(currentDir)
      if (i > 1) {
        const parentDir = parts.slice(0, i - 1).join('\\')
        addDir(parentDir)
        dirs.get(parentDir).add(parts[i - 1])
      }
    }
    if (normalized.endsWith('.exe') || normalized.endsWith('.lib') || normalized.endsWith('.h')) {
      files.add(normalized)
    } else {
      addDir(normalized)
    }
    const parent = parts.slice(0, -1).join('\\')
    if (parent) {
      addDir(parent)
      dirs.get(parent).add(parts.at(-1))
    }
  }

  return {
    existsSync(targetPath) {
      const normalized = targetPath.replaceAll('/', '\\')
      return files.has(normalized) || dirs.has(normalized)
    },
    readdirSync(targetPath) {
      const normalized = targetPath.replaceAll('/', '\\')
      return Array.from(dirs.get(normalized) || [])
    },
  }
}

describe('resolveWindowsBuildEnv', () => {
  it('builds PATH/LIB/INCLUDE for a discovered MSVC and Windows SDK install', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      PATH: 'C:\\Program Files\\Git\\usr\\bin',
    }
    const fs = createFs([
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64\\link.exe',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\lib\\x64\\vcruntime.lib',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64\\ucrt.lib',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64\\kernel32.lib',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\shared\\winerror.h',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\ucrt\\stdio.h',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um\\windows.h',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\winrt\\roapi.h',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\cppwinrt\\winrt\\base.h',
      'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\rc.exe',
      'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\mt.exe',
    ])

    const result = resolveWindowsBuildEnv({ env, fs, platform: 'win32' })

    expect(result.ok).toBe(true)
    expect(result.env.PATH.split(';').slice(0, 2)).toEqual([
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64',
      'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64',
    ])
    expect(result.env.LIB.split(';')).toEqual([
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\lib\\x64',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64',
    ])
    expect(result.env.INCLUDE.split(';')).toEqual([
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\ucrt',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\shared',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\winrt',
      'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\cppwinrt',
    ])
  })

  it('returns an actionable error when Windows SDK libraries are missing', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      PATH: 'C:\\Program Files\\Git\\usr\\bin',
    }
    const fs = createFs([
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64\\link.exe',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.42.34433\\lib\\x64\\vcruntime.lib',
    ])

    const result = resolveWindowsBuildEnv({ env, fs, platform: 'win32' })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Windows SDK/i)
  })
})

describe('getTauriLaunchSpec', () => {
  it('uses node plus the tauri.js entrypoint on Windows', () => {
    const spec = getTauriLaunchSpec({
      platform: 'win32',
      nodeExecPath: 'C:\\Program Files\\nodejs\\node.exe',
      repoRoot: 'C:\\Users\\y8gao\\Workspace\\excalidraw-x',
      args: ['build'],
    })

    expect(spec).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\Users\\y8gao\\Workspace\\excalidraw-x\\node_modules\\@tauri-apps\\cli\\tauri.js',
        'build',
      ],
    })
  })
})
