'use strict'

const { spawnSync } = require('child_process')
const { getTauriLaunchSpec, resolveWindowsBuildEnv } = require('./windowsBuildEnv.cjs')

function fail(message) {
  console.error(`[tauri-runner] ${message}`)
  process.exit(1)
}

const resolved = resolveWindowsBuildEnv()
if (!resolved.ok) {
  fail(resolved.message)
}

const launch = getTauriLaunchSpec({ args: process.argv.slice(2) })
const result = spawnSync(launch.command, launch.args, {
  stdio: 'inherit',
  env: resolved.env,
})

if (result.error) {
  if (result.error.code === 'ENOENT') {
    fail('Tauri CLI was not found. Run npm install before invoking this script.')
  }
  throw result.error
}

process.exit(result.status == null ? 1 : result.status)
