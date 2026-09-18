#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { analyzeBundle, assertBundleReport, kb, printBundleReport, safeFileName } from './crazygames-bundle-checks.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'submissions', 'archives');
const checkOnly = process.argv.includes('--check-only');
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const DOS_DATE_1980_01_01 = 33;
const DOS_TIME_00_00_00 = 0;
const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function createLocalHeader(name, data) {
  const nameBuffer = Buffer.from(name, 'utf8');
  const checksum = crc32(data);
  return Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(ZIP_UTF8_FLAG),
    uint16(ZIP_STORE_METHOD),
    uint16(DOS_TIME_00_00_00),
    uint16(DOS_DATE_1980_01_01),
    uint32(checksum),
    uint32(data.length),
    uint32(data.length),
    uint16(nameBuffer.length),
    uint16(0),
    nameBuffer,
  ]);
}

function createCentralHeader(name, data, offset) {
  const nameBuffer = Buffer.from(name, 'utf8');
  const checksum = crc32(data);
  return Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(ZIP_UTF8_FLAG),
    uint16(ZIP_STORE_METHOD),
    uint16(DOS_TIME_00_00_00),
    uint16(DOS_DATE_1980_01_01),
    uint32(checksum),
    uint32(data.length),
    uint32(data.length),
    uint16(nameBuffer.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(offset),
    nameBuffer,
  ]);
}

function createEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  return Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entryCount),
    uint16(entryCount),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0),
  ]);
}

async function writeDeterministicZip(zipPath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const localHeader = createLocalHeader(entry.name, entry.data);
    localParts.push(localHeader, entry.data);
    centralParts.push(createCentralHeader(entry.name, entry.data, offset));
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = createEndOfCentralDirectory(entries.length, centralDirectory.length, offset);
  await writeFile(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
}

async function main() {
  const report = await analyzeBundle(DIST);
  printBundleReport(report);
  assertBundleReport(report);

  if (checkOnly) return;

  await mkdir(OUT_DIR, { recursive: true });
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const archiveBaseName = `${safeFileName(packageJson.name)}-${safeFileName(packageJson.version)}`;
  const zipPath = path.join(OUT_DIR, `${archiveBaseName}.zip`);
  const files = [...report.files].sort((a, b) => a.rel.localeCompare(b.rel));
  const manifest = {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    files: files.map((file) => ({ path: file.rel, size: file.size })),
  };
  const entries = [];
  for (const file of files) {
    entries.push({ name: file.rel, data: await readFile(file.full) });
  }
  entries.push({ name: 'build-manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') });

  await writeDeterministicZip(zipPath, entries);

  console.log(`\n✓ Offline archive written: submissions/archives/${archiveBaseName}.zip (${kb((await stat(zipPath)).size)})\n`);
}

await main();
