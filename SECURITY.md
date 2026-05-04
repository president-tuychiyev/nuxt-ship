# Security Policy

## Supported Versions

Only the latest minor release receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please report vulnerabilities via GitHub Private Vulnerability Reporting:
https://github.com/president-tuychiyev/nuxt-ship/security/advisories/new

Or by email to: president7566@gmail.com

Please do not open public issues for security problems.

## Disclosed Issues

### CVE-pending — OS Command Injection via CLI arguments (fixed in 0.1.3)

- **Affected versions:** 0.1.0, 0.1.1, 0.1.2
- **Severity:** High (CVSS 8.8)
- **CWE:** CWE-78 OS Command Injection
- **Reporter:** Vaibhav Narkhede

The `--path`, `--image`, `--tag`, `--container`, `--user` and `--ip` CLI
arguments were embedded directly into SSH command strings. A user able to
influence these arguments (for example through a misconfigured CI script that
forwards untrusted input) could execute arbitrary commands on the deployment
server.

**Fix in 0.1.3:**

1. Strict regex validation of every CLI argument before use.
2. POSIX single-quote escaping of all values when they are interpolated into
   the remote shell command (defence in depth).

Upgrade with `npm i -D nuxt-ship@latest`.
