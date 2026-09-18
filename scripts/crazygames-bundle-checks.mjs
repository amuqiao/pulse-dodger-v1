import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const LIMITS = {
  totalBytes: 250 * 1024 * 1024,
  fileCount: 1500,
  initialBytes: 50 * 1024 * 1024,
  mobileInitialBytes: 20 * 1024 * 1024,
};

export const ALLOWED_EXTERNAL_URLS = new Set(['https://sdk.crazygames.com/crazygames-sdk-v3.js']);

const IGNORED_STATIC_URLS = new Set([
  'https://phaser.io/',
  'https://phaser.io',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
]);
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);
const RAW_EXTERNAL_URL_PATTERN = /(?:https?|wss?):\/\/[^\s"'`<>)]+/g;
const PROTOCOL_RELATIVE_URL_PATTERN = /(?<!:)\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`<>)]+/gi;
const URL_CAPTURE = "([^\"'`<>)\\s]+)";
const ROOT_PATH_CAPTURE = "(\/[^\"'`<>)\\s]+)";
const NETWORK_URL_PATTERNS = [
  new RegExp(`(?:src|href)=\"${URL_CAPTURE}\"`, 'g'),
  new RegExp(`(?:src|href)=\'${URL_CAPTURE}\'`, 'g'),
  new RegExp(`url\\(\\s*\"${URL_CAPTURE}\"\\s*\\)`, 'g'),
  new RegExp(`url\\(\\s*\'${URL_CAPTURE}\'\\s*\\)`, 'g'),
  new RegExp(`url\\(\\s*(https?:\\/\\/[^)\\s]+)\\s*\\)`, 'g'),
  new RegExp(`(?:fetch|importScripts)\\(\\s*\"${URL_CAPTURE}\"`, 'g'),
  new RegExp(`(?:fetch|importScripts)\\(\\s*\'${URL_CAPTURE}\'`, 'g'),
  new RegExp(`new\\s+(?:Worker|SharedWorker|WebSocket|EventSource)\\(\\s*\"${URL_CAPTURE}\"`, 'g'),
  new RegExp(`new\\s+(?:Worker|SharedWorker|WebSocket|EventSource)\\(\\s*\'${URL_CAPTURE}\'`, 'g'),
  new RegExp(`\\.load\\.[a-zA-Z]+\\([^)]*?\"${URL_CAPTURE}\"`, 'g'),
  new RegExp(`\\.load\\.[a-zA-Z]+\\([^)]*?\'${URL_CAPTURE}\'`, 'g'),
];
const ROOT_RELATIVE_PATTERNS = [
  new RegExp(`(?:src|href)=\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`(?:src|href)=\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`(?:\\.|\\b)(?:src|href)\\s*=\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`(?:\\.|\\b)(?:src|href)\\s*=\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`\\b(?:url|path|asset|icon|image|audio|video|file|endpoint|api|baseUrl|basePath)\\s*:\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`\\b(?:url|path|asset|icon|image|audio|video|file|endpoint|api|baseUrl|basePath)\\s*:\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`(?:\"|\\')(?:(?:url|path|asset|icon|image|audio|video|file|endpoint|api|baseUrl|basePath))(?:\"|\\')\\s*:\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`(?:\"|\\')(?:(?:url|path|asset|icon|image|audio|video|file|endpoint|api|baseUrl|basePath))(?:\"|\\')\\s*:\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`(?:location\\.(?:assign|replace)|window\\.open)\\(\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`(?:location\\.(?:assign|replace)|window\\.open)\\(\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`url\\(\\s*\"${ROOT_PATH_CAPTURE}\"\\s*\\)`, 'g'),
  new RegExp(`url\\(\\s*\'${ROOT_PATH_CAPTURE}\'\\s*\\)`, 'g'),
  new RegExp(`url\\(\\s*(${ROOT_PATH_CAPTURE})\\s*\\)`, 'g'),
  new RegExp(`(?:fetch|importScripts)\\(\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`(?:fetch|importScripts)\\(\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`new\\s+(?:Worker|SharedWorker|WebSocket|EventSource)\\(\\s*\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`new\\s+(?:Worker|SharedWorker|WebSocket|EventSource)\\(\\s*\'${ROOT_PATH_CAPTURE}\'`, 'g'),
  new RegExp(`\\.load\\.[a-zA-Z]+\\([^)]*?\"${ROOT_PATH_CAPTURE}\"`, 'g'),
  new RegExp(`\\.load\\.[a-zA-Z]+\\([^)]*?\'${ROOT_PATH_CAPTURE}\'`, 'g'),
];

export async function walk(dir, baseDir = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, baseDir)));
    else out.push({ full, rel: path.relative(baseDir, full), size: (await stat(full)).size });
  }
  return out;
}

export const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export function safeFileName(value) {
  const safe = value.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (!safe) throw new Error(`Package name "${value}" cannot be converted to a safe archive name.`);
  return safe;
}

function addExternalUrl(externalUrls, seenUrls, file, url) {
  let clean = url.replace(/[.,;]+$/, '');
  if (clean.startsWith('//')) clean = `https:${clean}`;
  if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('ws://') && !clean.startsWith('wss://')) return;
  const key = `${file}\0${clean}`;
  if (seenUrls.has(key)) return;
  seenUrls.add(key);
  externalUrls.push({ file, url: clean });
}

function addRootRelativePath(rootRelativePaths, seenPaths, file, value) {
  const clean = value.replace(/[.,;]+$/, '');
  if (!clean.startsWith('/') || clean.startsWith('//')) return;
  const key = `${file}\0${clean}`;
  if (seenPaths.has(key)) return;
  seenPaths.add(key);
  rootRelativePaths.push({ file, path: clean });
}

export async function analyzeBundle(dist) {
  const distStat = await stat(dist).catch(() => null);
  if (!distStat) {
    throw new Error('dist/ not found. Run npm run build first.');
  }

  const files = await walk(dist, dist);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const initialBytes = totalBytes;
  const forbiddenFiles = files.filter((file) => file.rel.includes('__MACOSX') || file.rel.endsWith('.DS_Store'));
  const externalUrls = [];
  const rootRelativePaths = [];
  const seenUrls = new Set();
  const seenPaths = new Set();

  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file.rel))) continue;
    const body = await readFile(file.full, 'utf8');
    for (const match of body.matchAll(RAW_EXTERNAL_URL_PATTERN)) {
      addExternalUrl(externalUrls, seenUrls, file.rel, match[0]);
    }
    for (const match of body.matchAll(PROTOCOL_RELATIVE_URL_PATTERN)) {
      addExternalUrl(externalUrls, seenUrls, file.rel, match[0]);
    }
    for (const pattern of NETWORK_URL_PATTERNS) {
      for (const match of body.matchAll(pattern)) {
        addExternalUrl(externalUrls, seenUrls, file.rel, match[1]);
      }
    }
    for (const pattern of ROOT_RELATIVE_PATTERNS) {
      for (const match of body.matchAll(pattern)) {
        addRootRelativePath(rootRelativePaths, seenPaths, file.rel, match[1]);
      }
    }
  }

  const disallowedExternalUrls = externalUrls.filter((entry) => !ALLOWED_EXTERNAL_URLS.has(entry.url) && !IGNORED_STATIC_URLS.has(entry.url));
  const failures = [];
  if (totalBytes > LIMITS.totalBytes) failures.push(`Total size ${mb(totalBytes)} exceeds ${mb(LIMITS.totalBytes)}`);
  if (files.length > LIMITS.fileCount) failures.push(`File count ${files.length} exceeds ${LIMITS.fileCount}`);
  if (initialBytes > LIMITS.initialBytes) failures.push(`Conservative initial download ${mb(initialBytes)} exceeds ${mb(LIMITS.initialBytes)}`);
  if (rootRelativePaths.length > 0) {
    const details = rootRelativePaths.map((entry) => `${entry.file}: ${entry.path}`).join(', ');
    failures.push(`Bundle contains root-relative paths: ${details}`);
  }
  if (disallowedExternalUrls.length > 0) {
    const details = disallowedExternalUrls.map((entry) => `${entry.file}: ${entry.url}`).join(', ');
    failures.push(`Bundle contains non-whitelisted external URLs: ${details}`);
  }
  if (forbiddenFiles.length > 0) failures.push(`Bundle contains forbidden files: ${forbiddenFiles.map((file) => file.rel).join(', ')}`);

  return {
    files,
    totalBytes,
    initialBytes,
    rootRelativePaths,
    externalUrls,
    disallowedExternalUrls,
    forbiddenFiles,
    failures,
  };
}

export function printBundleReport(report) {
  console.log('\nCrazyGames bundle check');
  console.log('─────────────────────────────────────────────');
  console.log(`Files                         ${report.files.length} / ${LIMITS.fileCount}`);
  console.log(`Total size                    ${mb(report.totalBytes)} / ${mb(LIMITS.totalBytes)}`);
  console.log(`Initial download conservative ${mb(report.initialBytes)} / ${mb(LIMITS.initialBytes)}`);
  console.log(`Mobile homepage               ${report.initialBytes <= LIMITS.mobileInitialBytes ? 'eligible' : 'not eligible'} (<= ${mb(LIMITS.mobileInitialBytes)})`);
  console.log(`Relative paths                ${report.rootRelativePaths.length === 0 ? 'ok' : 'failed'}`);
  console.log(`External URLs                 ${report.disallowedExternalUrls.length === 0 ? 'ok' : 'failed'}`);
  console.log('─────────────────────────────────────────────');
}

export function assertBundleReport(report) {
  if (report.failures.length === 0) return;

  console.error('\nBundle check failed:');
  for (const failure of report.failures) console.error(`- ${failure}`);
  process.exit(1);
}
