#!/usr/bin/env node
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { analyzeBundle, assertBundleReport, printBundleReport } from './crazygames-bundle-checks.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'submissions', 'portal-upload');

async function main() {
  const report = await analyzeBundle(DIST);
  printBundleReport(report);
  assertBundleReport(report);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.dirname(OUT), { recursive: true });
  await cp(DIST, OUT, { recursive: true });

  console.log('\nCrazyGames Portal upload folder');
  console.log('─────────────────────────────────────────────');
  console.log('Path: submissions/portal-upload/');
  console.log('Upload: drag the files inside this folder, not a zip archive.');
  console.log('─────────────────────────────────────────────\n');
}

await main();
