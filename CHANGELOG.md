# Changelog

## 0.1.3

### Security

- **Fix CWE-78 OS Command Injection** in CLI arguments (`--path`, `--image`,
  `--tag`, `--container`, `--user`, `--ip`). Reported by Vaibhav Narkhede.
  All values are now validated against strict regex patterns and
  single-quote escaped before being interpolated into remote shell commands.
  See [SECURITY.md](./SECURITY.md) for details.

## 0.1.2

- More robust binary resolution (try `bash -lc`, env override `<NAME>_BIN`,
  WSL/Git Bash fallback paths).

## 0.1.1

- Resolve binary paths via `which`/`where` to fix `spawnSync ENOENT` in WSL.

## 0.1.0

- Initial release.
