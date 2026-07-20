// Ensures node-pty's `spawn-helper` binary keeps its executable bit.
//
// node-pty ships prebuilt binaries under node_modules/node-pty/prebuilds/<platform>-<arch>/.
// On macOS/Linux it must `exec` the `spawn-helper` companion binary to launch a shell; if the
// executable bit is missing the PTY spawn fails with "posix_spawnp failed". npm/prebuild
// extraction and some install flows drop that bit, so we restore it after install and before
// dev/build (which is also what gets copied into the packaged app's asarUnpack directory).
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prebuildsDir = path.join(root, 'node_modules', 'node-pty', 'prebuilds')

if (!existsSync(prebuildsDir)) {
  process.exit(0)
}

for (const entry of readdirSync(prebuildsDir)) {
  // Windows uses conpty.dll / winpty; only unix targets ship spawn-helper.
  if (entry.startsWith('win32')) continue
  const helper = path.join(prebuildsDir, entry, 'spawn-helper')
  if (!existsSync(helper)) continue
  const mode = statSync(helper).mode
  const executable = mode | 0o755
  if (mode !== executable) {
    chmodSync(helper, executable)
    console.log(`[fix-pty-permissions] chmod +x ${path.relative(root, helper)}`)
  }
}
