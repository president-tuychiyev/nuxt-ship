import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STUBS: Array<{ src: string; dst: string; mode?: number }> = [
  { src: "Dockerfile", dst: "Dockerfile" },
  { src: "docker-compose-prod.yml", dst: "docker-compose-prod.yml" },
  { src: "env.prod.example", dst: ".env.prod.example" },
  { src: "deploy.sh", dst: "deploy.sh", mode: 0o755 },
  { src: ".dockerignore", dst: ".dockerignore" },
];

async function stubPath(name: string): Promise<string> {
  // dist/install.js -> ../stubs/<name>
  const candidate = resolve(__dirname, "..", "stubs", name);
  if (existsSync(candidate)) return candidate;
  // dev fallback (src/install.ts -> ../stubs/<name>)
  return resolve(__dirname, "..", "stubs", name);
}

export async function install(): Promise<void> {
  for (const { src, dst, mode } of STUBS) {
    if (existsSync(dst)) {
      log.warn(`'${dst}' already exists, skipping`);
      continue;
    }

    const from = await stubPath(src);
    if (!existsSync(from)) {
      log.error(`stub '${src}' not found at ${from}`);
      continue;
    }

    await mkdir(dirname(resolve(dst)), { recursive: true });
    const data = await readFile(from);
    await writeFile(dst, data, { mode: mode ?? 0o644 });
    log.success(`✓ ${dst} created`);
  }

  console.log();
  log.success("nuxt-ship installed! Edit .env.prod.example, then run: npx nuxt-ship --user=root --ip=...");
}
