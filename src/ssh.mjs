import { execSync, execQuiet } from './utils.mjs'

/**
 * Build ssh/scp transport with optional ControlMaster multiplexing.
 * ControlMaster reuses one TCP connection so password is asked once.
 * Disabled on Windows (OpenSSH for Windows doesn't support it) or via flag.
 */
export function makeTransport({ target, port, controlPath, useMux }) {
    const muxOpts = useMux
        ? ['-o', 'ControlMaster=auto', '-o', `ControlPath=${controlPath}`, '-o', 'ControlPersist=300']
        : []

    return {
        useMux,
        controlPath,
        ssh: (...extra) => execSync('ssh', [...muxOpts, '-p', String(port), target, ...extra]),
        scp: (...extra) => execSync('scp', [...muxOpts, '-P', String(port), ...extra]),
        closeMaster: () => {
            if (useMux) {
                execQuiet('ssh', ['-o', `ControlPath=${controlPath}`, '-O', 'exit', target])
            }
        },
    }
}

export function detectMuxSupport(disableFlag) {
    if (disableFlag) return false
    return process.platform !== 'win32'
}
