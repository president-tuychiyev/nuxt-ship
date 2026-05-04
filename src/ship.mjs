import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dockerBuild, dockerSaveGzip, dockerTag } from './docker.mjs'
import { detectMuxSupport, makeTransport } from './ssh.mjs'
import { err, log, ok, posixSingleQuote, readPackageName, validate, warn } from './utils.mjs'

export async function ship({ projectRoot, args }) {
    if (!args.user || !args.ip) {
        throw new Error('--user and --ip are required (run `ship --help`)')
    }

    const user = validate('user', args.user)
    const ip = validate('ip', args.ip)
    const port = validate('port', args.port || '22')
    const remotePath = validate('path', args.path || '/opt/app')
    const tag = validate('tag', args.tag || 'latest')
    const image = validate('image', args.image || readPackageName(projectRoot))
    const container = validate('container', args.container || image)
    const target = `${user}@${ip}`

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

    const qPath = posixSingleQuote(remotePath)
    const qImage = posixSingleQuote(image)
    const qTag = posixSingleQuote(tag)
    const qContainer = posixSingleQuote(container)
    const qTarGz = posixSingleQuote(tarGz)

    let success = false
    let tarCreated = false

    try {
        const composeSrc = join(projectRoot, 'docker-compose-prod.yml')
        if (!existsSync(composeSrc)) {
            throw new Error('docker-compose-prod.yml missing. Run: ship install')
        }
        if (!existsSync(join(projectRoot, 'Dockerfile'))) {
            throw new Error('Dockerfile missing. Run: ship install')
        }

        const envExample = join(projectRoot, '.env.prod.example')
        const envFile = join(projectRoot, '.env')
        if (existsSync(envExample)) {
            copyFileSync(envExample, envFile)
            ok('.env.prod.example -> .env')
        } else if (!existsSync(envFile)) {
            warn('No .env or .env.prod.example found; skipping env upload')
        }

        dockerBuild({ image, tag, cwd: projectRoot })
        if (tag !== 'latest') {
            dockerTag({ image, tag, alias: 'latest' })
        }

        await dockerSaveGzip({ image, tag, tarPath })
        tarCreated = true
        ok(`Image saved: ${tarGz}`)

        transport.ssh(`mkdir -p ${qPath}`)

        const filesToCopy = [tarPath]
        if (existsSync(envFile)) filesToCopy.push(envFile)
        const deploySh = join(projectRoot, 'deploy.sh')
        if (existsSync(deploySh)) filesToCopy.push(deploySh)
        else warn('deploy.sh not found locally (was ship install run?)')

        transport.scp(...filesToCopy, `${target}:${remotePath}/`)
        transport.scp(composeSrc, `${target}:${remotePath}/docker-compose.yml`)

        const remoteCmd =
            `cd ${qPath} && ` +
            `IMAGE_NAME=${qImage} IMAGE_TAG=${qTag} CONTAINER_NAME=${qContainer} ` +
            `bash deploy.sh ${qTarGz}`
        transport.ssh(remoteCmd)

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
