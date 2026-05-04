import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const log  = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`)
export const ok   = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`)
export const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`)
export const err  = (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`)

export function parseArgs(argv) {
    const args = { _: [] }
    const aliases = {
        u: 'user',
        P: 'port',
        p: 'path',
        t: 'tag',
        i: 'image',
        c: 'container',
        h: 'help',
        v: 'version',
    }
    const booleanFlags = new Set(['no-control-master', 'help', 'version'])

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--') { args._.push(...argv.slice(i + 1)); break }

        if (a.startsWith('--')) {
            const k = a.slice(2)
            if (booleanFlags.has(k)) { args[k] = true; continue }
            const v = argv[i + 1]
            if (v === undefined || v.startsWith('-')) args[k] = true
            else { args[k] = v; i++ }
        } else if (a.startsWith('-') && a.length > 1) {
            const short = a.slice(1)
            const k = aliases[short] || short
            if (booleanFlags.has(k)) { args[k] = true; continue }
            const v = argv[i + 1]
            if (v === undefined || v.startsWith('-')) args[k] = true
            else { args[k] = v; i++ }
        } else {
            args._.push(a)
        }
    }
    return args
}

export function readPackageName(projectRoot) {
    try {
        const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
        return (pkg.name || 'app').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    } catch {
        return 'app'
    }
}

export function shellQuote(arg) {
    return /[\s"'$`\\]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

/**
 * Resolve an executable to an absolute path. Node's spawn doesn't always inherit
 * a fully populated PATH (especially in WSL, snap, or restricted shells), so we
 * look up via `which`/`where` and fall back to common install locations.
 */
const binCache = new Map()
export function resolveBin(name) {
    if (binCache.has(name)) return binCache.get(name)

    const tryPaths = []
    let lookup = null

    if (process.platform === 'win32') {
        lookup = spawnSync('where', [name], { encoding: 'utf8' })
        tryPaths.push(
            `C:\\Program Files\\Docker\\Docker\\resources\\bin\\${name}.exe`,
            `C:\\Windows\\System32\\OpenSSH\\${name}.exe`,
        )
    } else {
        // Use the shell so PATH from /etc/profile, ~/.profile, etc. is honoured.
        lookup = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })
        tryPaths.push(
            `/usr/local/bin/${name}`,
            `/usr/bin/${name}`,
            `/bin/${name}`,
            `/snap/bin/${name}`,
            `/usr/sbin/${name}`,
        )
    }

    let resolved = name
    if (lookup && lookup.status === 0 && lookup.stdout) {
        resolved = lookup.stdout.trim().split(/\r?\n/)[0]
    } else {
        for (const p of tryPaths) {
            if (existsSync(p)) { resolved = p; break }
        }
    }

    binCache.set(name, resolved)
    return resolved
}

export function execSync(cmd, args, opts = {}) {
    const bin = resolveBin(cmd)
    log(`${cmd} ${args.map(shellQuote).join(' ')}`)
    const r = spawnSync(bin, args, { stdio: 'inherit', ...opts })
    if (r.error) {
        if (r.error.code === 'ENOENT') {
            throw new Error(
                `'${cmd}' not found on PATH. Install it or add its directory to PATH.\n` +
                `  tried: ${bin}`
            )
        }
        throw r.error
    }
    if (r.status !== 0) throw new Error(`Command failed (exit ${r.status}): ${cmd}`)
    return r
}

export function execQuiet(cmd, args, opts = {}) {
    const bin = resolveBin(cmd)
    return spawnSync(bin, args, { stdio: 'ignore', ...opts })
}
