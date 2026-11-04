import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
await mkdir('.vercel', { recursive: true });
const directory = await mkdtemp(join(process.cwd(), '.vercel', 'catalog-import-'));
try {
  const output = join(directory, 'import.mjs');
  await build({ entryPoints: ['scripts/import-catalog.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfig: 'tsconfig.json' });
  const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
