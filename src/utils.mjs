import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const log  = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`)
export const ok   = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`)
export const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`)
export const err  = (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`)

export function parseArgs(argv) {
    const args = { _: [] }
    const aliases = {
        u: 'user', P: 'port', p: 'path', t: 'tag',
        i: 'image', c: 'container', h: 'help', v: 'version',
    }
    const booleanFlags = new Set(['no-control-master', 'help', 'version', 'debug'])

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

export function posixSingleQuote(value) {
    const s = String(value)
    return `'${s.replace(/'/g, `'\\''`)}'`
}

const VALIDATORS = {
    user:      /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/,
    ip:        /^[a-zA-Z0-9.\-:[\]]{1,253}$/,
    port:      /^[1-9][0-9]{0,4}$/,
    image:     /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){0,5}$/,
    tag:       /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/,
    container: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/,
    path:      /^\/[a-zA-Z0-9_./-]{0,255}$/,
}

export function validate(name, value) {
    const re = VALIDATORS[name]
    if (!re) throw new Error(`Unknown validator: ${name}`)
    const s = String(value)
    if (!re.test(s)) {
        throw new Error(
            `Invalid --${name}: ${JSON.stringify(s)}\n` +
            `  Allowed pattern: ${re}`
        )
    }
    return s
}

const isWin = process.platform === 'win32'

/** Detect WSL / Git Bash where Linux paths are usable from Node */
function isWslOrUnixLike() {
    if (!isWin) return true
    try {
        // WSL leaks /proc to Windows-side via interop in some setups, but mostly we're Linux Node
        return existsSync('/proc/version')
    } catch { return false }
}

function isExecutable(p) {
    try {
        const s = statSync(p)
        return s.isFile()
    } catch { return false }
}

const binCache = new Map()

/**
 * Resolve `name` to an absolute executable path.
 *  1. user override via env (e.g. DOCKER_BIN, SSH_BIN)
 *  2. shell lookup: `command -v` (sh), `where` (cmd)
 *  3. login shell lookup: `bash -lc 'command -v X'` (loads /etc/profile)
 *  4. common install paths
 *  5. fallback to plain name (let spawn try OS PATH)
 */
export function resolveBin(name) {
    if (binCache.has(name)) return binCache.get(name)

    // (1) explicit override
    const envKey = `${name.toUpperCase()}_BIN`
    if (process.env[envKey] && isExecutable(process.env[envKey])) {
        binCache.set(name, process.env[envKey])
        return process.env[envKey]
    }

    const candidates = []
    const lookups = []

    if (isWin) {
        lookups.push(['where', [name]])
        candidates.push(
            `C:\\Program Files\\Docker\\Docker\\resources\\bin\\${name}.exe`,
            `C:\\Windows\\System32\\OpenSSH\\${name}.exe`,
            `C:\\Windows\\System32\\${name}.exe`,
            `C:\\Program Files\\Git\\usr\\bin\\${name}.exe`,
            `C:\\Program Files\\Git\\mingw64\\bin\\${name}.exe`,
        )
    }
    if (!isWin || existsSync('/bin/sh')) {
        lookups.push(['/bin/sh', ['-c', `command -v ${name}`]])
    }
    if (existsSync('/bin/bash')) {
        // login shell loads /etc/profile, ~/.profile so PATH is fully populated
        lookups.push(['/bin/bash', ['-lc', `command -v ${name}`]])
    }
    if (!isWin || isWslOrUnixLike()) {
        const home = process.env.HOME || ''
        candidates.push(
            `/usr/local/bin/${name}`,
            `/usr/bin/${name}`,
            `/bin/${name}`,
            `/snap/bin/${name}`,
            `/usr/sbin/${name}`,
            home && `${home}/.local/bin/${name}`,
            home && `${home}/bin/${name}`,
        )
    }

    // (2-3) try shell lookups
    for (const [cmd, args] of lookups) {
        try {
            const r = spawnSync(cmd, args, { encoding: 'utf8' })
            if (r.status === 0 && r.stdout) {
                const candidate = r.stdout.trim().split(/\r?\n/)[0]
                if (candidate && isExecutable(candidate)) {
                    binCache.set(name, candidate)
                    return candidate
                }
            }
        } catch {}
    }

    // (4) common paths
    for (const p of candidates) {
        if (p && isExecutable(p)) {
            binCache.set(name, p)
            return p
        }
    }

    // (5) fallback: hope spawn finds it via OS PATH lookup
    binCache.set(name, name)
    return name
}

export function execSync(cmd, args, opts = {}) {
    const bin = resolveBin(cmd)
    log(`${cmd} ${args.map(shellQuote).join(' ')}`)
    if (process.env.SHIP_DEBUG) console.log(`  [debug] resolved ${cmd} -> ${bin}`)
    const r = spawnSync(bin, args, { stdio: 'inherit', ...opts })
    if (r.error) {
        if (r.error.code === 'ENOENT') {
            const hint = bin === cmd
                ? `Could not locate '${cmd}'. Add its directory to PATH or set ${cmd.toUpperCase()}_BIN env var.`
                : `Tried '${bin}'. Set ${cmd.toUpperCase()}_BIN to override.`
            throw new Error(`'${cmd}' not found.\n  ${hint}`)
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
