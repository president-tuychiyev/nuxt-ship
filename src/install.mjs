import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ok, warn } from './utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const stubsDir = join(__dirname, '..', 'stubs')

const STUBS = [
    'Dockerfile',
    '.dockerignore',
    'docker-compose-prod.yml',
    '.env.prod.example',
    'deploy.sh',
]

export function install(projectRoot) {
    for (const f of STUBS) {
        const src = join(stubsDir, f)
        const dst = join(projectRoot, f)
        if (existsSync(dst)) { warn(`${f} already exists, skipping`); continue }
        if (!existsSync(src)) { warn(`stub ${f} not found in package`); continue }
        copyFileSync(src, dst)
        ok(`created ${f}`)
    }
    console.log()
    console.log('Next steps:')
    console.log('  1) Edit .env.prod.example with your env vars')
    console.log('  2) Adjust Dockerfile / docker-compose-prod.yml if needed')
    console.log('  3) ship --user root --ip 1.2.3.4 --tag v1')
}
