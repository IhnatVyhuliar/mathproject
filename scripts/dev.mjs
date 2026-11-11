import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import electronPath from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ root })
await server.listen()
const url = server.resolvedUrls.local[0]
console.log(`Vite: ${url}`)

const child = spawn(electronPath, ['.'], {
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
  stdio: 'inherit',
})
const stop = () => child.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
