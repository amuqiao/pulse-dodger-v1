#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function exitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`${command} ${args.join(' ')} stopped with signal ${result.signal}`);
    process.exit(exitCodeForSignal(result.signal));
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function buildPortalUpload(adsEnabled) {
  const env = { ...process.env, VITE_ENABLE_CRAZYGAMES_ADS: adsEnabled ? 'true' : 'false' };
  run(npmCommand, ['run', 'build'], env);
  run(process.execPath, ['scripts/prepare-portal-upload.mjs'], env);
}
