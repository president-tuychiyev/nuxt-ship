import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { execSync, log, resolveBin } from './utils.mjs'

export function dockerBuild({ image, tag, cwd, buildArgs = [] }) {
    const args = ['build', '-t', `${image}:${tag}`]
    for (const ba of buildArgs) args.push('--build-arg', ba)
    args.push('.')
    execSync('docker', args, { cwd })
}

export function dockerTag({ image, tag, alias }) {
    execSync('docker', ['tag', `${image}:${tag}`, `${image}:${alias}`])
}

/**
 * docker save <image>:<tag> | gzip > tarPath
 */
export function dockerSaveGzip({ image, tag, tarPath }) {
    log(`docker save ${image}:${tag} | gzip > ${tarPath}`)
    const dockerBin = resolveBin('docker')
    const gzipBin = resolveBin('gzip')

    return new Promise((resolve, reject) => {
        const save = spawn(dockerBin, ['save', `${image}:${tag}`])
        const gzip = spawn(gzipBin, ['-c'])
        const out = createWriteStream(tarPath)

        save.stdout.pipe(gzip.stdin)
        gzip.stdout.pipe(out)
        save.stderr.on('data', (d) => process.stderr.write(d))
        gzip.stderr.on('data', (d) => process.stderr.write(d))

        save.on('error', reject)
        gzip.on('error', reject)

        let saveCode, gzipCode, outClosed = false
        const finish = () => {
            if (saveCode === undefined || gzipCode === undefined || !outClosed) return
            if (saveCode === 0 && gzipCode === 0) resolve()
            else reject(new Error(`docker save exit=${saveCode}, gzip exit=${gzipCode}`))
        }
        save.on('exit', (c) => { saveCode = c; finish() })
        gzip.on('exit', (c) => { gzipCode = c; finish() })
        out.on('close', () => { outClosed = true; finish() })
        out.on('error', reject)
    })
}
