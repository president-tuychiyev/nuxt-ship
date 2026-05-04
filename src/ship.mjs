import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dockerBuild, dockerSaveGzip, dockerTag } from './docker.mjs'
import { detectMuxSupport, makeTransport } from './ssh.mjs'
import { err, log, ok, readPackageName, warn } from './utils.mjs'

/**
 * Deploy pipeline:
 *  1) .env.prod.example -> .env (locally, every run)
 *  2) docker build
 *  3) docker tag <image>:<tag> <image>:latest  (if tag != latest)
 *  4) docker save | gzip > <hash>.tar.gz
 *  5) ssh: mkdir -p <path>
 *  6) scp tar + .env + deploy.sh -> server
 *  7) scp docker-compose-prod.yml -> server:docker-compose.yml
 *  8) ssh: bash deploy.sh <hash>.tar.gz   (server-side: load image, compose up, prune)
 *  9) deploy.sh self-deletes + removes tar.gz on the server (compose.yml on failure too)
 * 10) close SSH master, remove local tar.gz
 */
export async function ship({ projectRoot, args }) {
    if (!args.user || !args.ip) {
        throw new Error('--user and --ip are required (run `ship --help`)')
    }

    const user = String(args.user)
    const ip = String(args.ip)
    const port = String(args.port || '22')
    const remotePath = String(args.path || '/opt/app')
    const tag = String(args.tag || 'latest')
    const image = String(args.image || readPackageName(projectRoot))
    const container = String(args.container || image)
    const target = `${user}@${ip}`

    // 12-char content hash for unique tar.gz name (prevents collisions on repeated runs)
    const stamp = process.hrtime.bigint().toString()
    const hash = createHash('sha256')
        .update(`${image}:${tag}_${stamp}`)
        .digest('hex')
        .slice(0, 12)
    const tarGz = `${hash}.tar.gz`
    const tarPath = join(projectRoot, tarGz)
    const ctlPath = `/tmp/ship_ctl_${hash.slice(0, 8)}`

    const useMux = detectMuxSupport(args['no-control-master'])
    const transport = makeTransport({ target, port, controlPath: ctlPath, useMux })

    let success = false
    let tarCreated = false

    try {
        // Pre-flight checks
        const composeSrc = join(projectRoot, 'docker-compose-prod.yml')
        if (!existsSync(composeSrc)) {
            throw new Error('docker-compose-prod.yml missing. Run: ship install')
        }
        if (!existsSync(join(projectRoot, 'Dockerfile'))) {
            throw new Error('Dockerfile missing. Run: ship install')
        }

        // (1) sync env
        const envExample = join(projectRoot, '.env.prod.example')
        const envFile = join(projectRoot, '.env')
        if (existsSync(envExample)) {
            copyFileSync(envExample, envFile)
            ok('.env.prod.example -> .env')
        } else if (!existsSync(envFile)) {
            warn('No .env or .env.prod.example found; skipping env upload')
        }

        // (2-3) build & tag
        dockerBuild({ image, tag, cwd: projectRoot })
        if (tag !== 'latest') {
            dockerTag({ image, tag, alias: 'latest' })
        }

        // (4) save | gzip
        await dockerSaveGzip({ image, tag, tarPath })
        tarCreated = true
        ok(`Image saved: ${tarGz}`)

        // (5) remote mkdir
        transport.ssh(`mkdir -p ${remotePath}`)

        // (6) scp tar + env + deploy.sh
        const filesToCopy = [tarPath]
        if (existsSync(envFile)) filesToCopy.push(envFile)
        const deploySh = join(projectRoot, 'deploy.sh')
        if (existsSync(deploySh)) filesToCopy.push(deploySh)
        else warn('deploy.sh not found locally (was ship install run?)')

        transport.scp(...filesToCopy, `${target}:${remotePath}/`)

        // (7) scp compose, renaming
        transport.scp(composeSrc, `${target}:${remotePath}/docker-compose.yml`)

        // (8) trigger remote deploy
        const remoteEnv = `IMAGE_NAME=${image} IMAGE_TAG=${tag} CONTAINER_NAME=${container}`
        transport.ssh(`cd ${remotePath} && ${remoteEnv} bash deploy.sh ${tarGz}`)

        success = true
        console.log()
        ok('🚀 Ship completed successfully')
        console.log(`   Server:    ${target}:${remotePath}`)
        console.log(`   Image:     ${image}:${tag}`)
        console.log(`   Container: ${container}`)
    } catch (e) {
        err(e.message || String(e))
        throw e
    } finally {
        transport.closeMaster()
        if (tarCreated) {
            try { unlinkSync(tarPath); ok(`local cleanup: ${tarGz}`) } catch {}
        }
        if (!success) warn('Ship did not complete')
    }
}
