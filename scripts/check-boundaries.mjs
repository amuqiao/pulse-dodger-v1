#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const RULES = [
  {
    dir: '.',
    label: 'Only src/game/** may import phaser',
    check: (rel, line) =>
      /^\s*(import|export)\s.*from\s+['"]phaser['"]/.test(line) && !rel.startsWith('game/'),
    why: 'DOM and platform code must stay engine-agnostic.',
  },
  {
    dir: 'game/core',
    label: 'game/core only imports game/core and tuning',
    check: (_rel, line) => {
      const match = /^\s*(?:import|export)\s(.*)from\s+['"](\.[^'"]+)['"]/.exec(line);
      if (!match) return false;
      if (/^\s*type\s/.test(match[1])) return false;
      return !/^\.\/[^/]+\.ts$/.test(match[2]) && match[2] !== '../tuning.ts';
    },
    why: 'Rules must be testable in Node without Phaser or browser globals.',
  },
  {
    dir: 'platform',
    label: 'platform must not import game',
    check: (_rel, line) => /^\s*(import|export)\s.*from\s+['"].*\/game\//.test(line),
    why: 'Platform adapters should be portable across games.',
  },
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];

for (const rule of RULES) {
  const files = await walk(path.join(SRC, rule.dir)).catch(() => {
    console.error(`Missing boundary directory: src/${rule.dir}`);
    process.exit(1);
  });

  for (const file of files) {
    const rel = path.relative(SRC, file);
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (rule.check(rel, line)) {
        violations.push({ rel, line: index + 1, label: rule.label, why: rule.why, code: line.trim() });
      }
    });
  }
}

console.log('\nDependency boundaries');
console.log('─────────────────────────────────────────────');
for (const rule of RULES) {
  const bad = violations.filter((violation) => violation.label === rule.label).length;
  console.log(`${bad === 0 ? '✓' : '✗'} ${rule.label}`);
}
console.log('─────────────────────────────────────────────');

if (violations.length > 0) {
  console.error('\nBoundary violations:');
  for (const violation of violations) {
    console.error(`\nsrc/${violation.rel}:${violation.line}`);
    console.error(`  ${violation.code}`);
    console.error(`  ${violation.why}`);
  }
  process.exit(1);
}

console.log('\n✓ Dependency boundaries are clean\n');

