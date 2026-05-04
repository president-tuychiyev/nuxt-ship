import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from './install.mjs'
import { ship } from './ship.mjs'
import { parseArgs } from './utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')

function getVersion() {
    try { return JSON.parse(readFileSync(pkgPath, 'utf8')).version } catch { return '0.0.0' }
}

function usage() {
    console.log(`
nuxt-ship — Build, ship and run a Docker image on your server.

Usage:
  ship install
        Copy stub files (Dockerfile, docker-compose-prod.yml, .env.prod.example,
        deploy.sh, .dockerignore) into the current project.

  ship --user <user> --ip <ip> [options]
        Build the image, ship it to the server, run it via docker compose.

Options:
  -u, --user <user>          SSH user (required)
      --ip <ip>              Server IP / hostname (required)
  -P, --port <port>          SSH port (default: 22)
  -p, --path <path>          Remote app directory (default: /opt/app)
  -t, --tag <tag>            Docker image tag (default: latest)
  -i, --image <name>         Image name (default: package.json "name")
  -c, --container <name>     Container name (default: same as image)
      --no-control-master    Disable SSH ControlMaster multiplexing
  -h, --help                 Show this help
  -v, --version              Print version

Examples:
  ship install
  ship --user root --ip 1.2.3.4
  ship -u deploy --ip 10.0.0.5 -P 2222 -t v1.2 -p /srv/app
`)
}

export async function run(argv) {
    const args = parseArgs(argv)

    if (args.version) { console.log(getVersion()); return }
    if (args.help) { usage(); return }

    const projectRoot = resolve(process.cwd())
    const sub = args._[0]

    if (sub === 'install') {
        install(projectRoot)
        return
    }

    if (sub && sub !== 'ship') {
        console.error(`Unknown command: ${sub}\n`)
        usage()
        process.exit(1)
    }

    await ship({ projectRoot, args })
}
