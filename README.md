# nuxt-ship

> Build a Docker image locally, ship it over SSH, run it on the server. Tar and temporary files are auto-cleaned. Inspired by [goravel-ship](https://github.com/president-tuychiyev/goravel-ship).

Zero dependencies. Pure Node.js (>= 18). Works for any Dockerizable project — defaults are tuned for Nuxt SSR but you can edit the stubs for Express, Next.js, static sites, etc.

---

## What it does

```
[ local machine ]                        [ server ]
                                         /opt/app/
  docker build                              ├── docker-compose.yml      (kept)
  docker save | gzip                        ├── .env                    (kept)
       │                                    ├── <hash>.tar.gz   ──► load → REMOVED
       │  scp + ssh                         ├── deploy.sh       ──► run  → REMOVED
       └──────────────►                     ▼
                                         docker compose up -d
                                         docker image prune
```

The remote `deploy.sh` runs once and self-destructs (via `trap`). On a successful deploy only `.env`, `docker-compose.yml`, the loaded image and the running container persist on the server.

## Install

```bash
# Global
npm i -g nuxt-ship
ship install

# One-shot, no install
npx nuxt-ship install
npx nuxt-ship --user root --ip 1.2.3.4 --tag v1

# Per project
npm i -D nuxt-ship
# package.json:  "deploy": "ship --user root --ip 1.2.3.4"
```

## Quick start

```bash
# 1. Generate stub files in your project
ship install

# 2. Edit the generated files for your environment
#    - .env.prod.example   ── env vars for the server
#    - Dockerfile          ── adapt for your framework
#    - docker-compose-prod.yml

# 3. Deploy
ship --user root --ip 1.2.3.4 --tag v1
```

## CLI

```
ship install
ship --user <user> --ip <ip> [options]

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
```

## Pipeline (exact steps)

| # | Where  | Command |
|---|--------|---------|
| 1 | local  | `cp .env.prod.example .env` |
| 2 | local  | `docker build -t <image>:<tag> .` |
| 3 | local  | `docker tag <image>:<tag> <image>:latest` (if tag ≠ latest) |
| 4 | local  | `docker save <image>:<tag> \| gzip > <hash>.tar.gz` |
| 5 | ssh    | `mkdir -p <path>` |
| 6 | scp    | `<hash>.tar.gz` + `.env` + `deploy.sh`  → `<path>/` |
| 7 | scp    | `docker-compose-prod.yml` → `<path>/docker-compose.yml` |
| 8 | ssh    | `cd <path> && bash deploy.sh <hash>.tar.gz` |
| 9 | server | `gunzip \| docker load` → `docker compose up -d --force-recreate` → `docker image prune -f` |
| 10| server | `trap` removes `<hash>.tar.gz` and `deploy.sh` (and `docker-compose.yml` on failure) |
| 11| local  | `<hash>.tar.gz` removed, SSH master closed |

The `<hash>` is a 12-char SHA-256 of `image:tag_<nanos>` so concurrent deploys don't collide.

## Generated files

`ship install` copies these into your project root:

| File                       | Purpose |
|----------------------------|---------|
| `Dockerfile`               | Multi-stage Node 22 alpine build for Nuxt SSR |
| `.dockerignore`            | Skip `node_modules`, `.git`, env files, build artefacts |
| `docker-compose-prod.yml`  | One service, env_file `.env`, port 3000, external `app_network` |
| `.env.prod.example`        | Template env file copied to `.env` on every deploy |
| `deploy.sh`                | Server-side script. **Self-deletes via `trap`.** |

You may freely edit any of them. They are written once; subsequent `ship install` calls won't overwrite.

## Requirements

- **Local:** Node ≥ 18, `docker`, `gzip`, `ssh`, `scp` on PATH.
  - On Windows: Git Bash or WSL is recommended (`gzip` and OpenSSH ControlMaster ship there). Pure Windows works too — pass `--no-control-master`.
- **Server:** Docker + Docker Compose v2 (`docker compose`, not `docker-compose`).
- **Network:** the compose file references an external network `app_network`. `deploy.sh` creates it on first run.

## SSH multiplexing (ControlMaster)

On Linux/macOS the script reuses one SSH connection for all `ssh`/`scp` calls — your password is asked once, not 4 times. Disabled automatically on Windows. Use `--no-control-master` to opt out.

For password-free deploys, set up SSH keys:

```bash
ssh-copy-id -p 22 root@1.2.3.4
```

## Programmatic use

```js
import { ship, install } from 'nuxt-ship'

await ship({
  projectRoot: process.cwd(),
  args: { user: 'root', ip: '1.2.3.4', tag: 'v1' }
})
```

## Comparison with goravel-ship

This is a Node.js port of [goravel-ship](https://github.com/president-tuychiyev/goravel-ship) (a Goravel artisan command). The pipeline, hash strategy and self-deleting `deploy.sh` are kept identical. Differences:

- Image name is read from `package.json` `"name"` instead of `go.mod` `module`
- No `--migrate` / `--seed` flags (no built-in artisan equivalent in Node)
- The default `Dockerfile` and compose file target Nuxt instead of Goravel

## License

[MIT](LICENSE)
