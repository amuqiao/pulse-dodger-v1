import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeBundle } from '../scripts/crazygames-bundle-checks.mjs';

async function withDist(files, assertion) {
  const dist = await mkdtemp(path.join(tmpdir(), 'cg-bundle-'));
  try {
    await writeFile(path.join(dist, 'index.html'), files['index.html'] ?? '<script src="./game.js"></script>');
    for (const [name, body] of Object.entries(files)) {
      if (name === 'index.html') continue;
      await writeFile(path.join(dist, name), body);
    }
    await assertion(await analyzeBundle(dist));
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
}

test('bundle check rejects remote Phaser loader assets in bundled JavaScript', async () => {
  await withDist({ 'game.js': 'scene.load.image("hero", "https://cdn.example.com/hero.png");' }, async (report) => {
    assert.equal(report.disallowedExternalUrls.length, 1);
    assert.equal(report.disallowedExternalUrls[0].url, 'https://cdn.example.com/hero.png');
  });
});

test('bundle check rejects protocol-relative remote URLs', async () => {
  await withDist({ 'game.js': 'fetch("//cdn.example.com/config.json");' }, async (report) => {
    assert.equal(report.disallowedExternalUrls.length, 1);
    assert.equal(report.disallowedExternalUrls[0].url, 'https://cdn.example.com/config.json');
  });
});

test('bundle check rejects root-relative runtime paths', async () => {
  await withDist({ 'style.css': '.hero { background: url(/assets/hero.png); }', 'game.js': 'fetch("/api/score");' }, async (report) => {
    assert.deepEqual(
      report.rootRelativePaths.map((entry) => entry.path).sort(),
      ['/api/score', '/assets/hero.png'],
    );
  });
});

test('bundle check rejects root-relative Phaser loader assets', async () => {
  await withDist({ 'game.js': 'scene.load.audio("hit", "/assets/hit.ogg");' }, async (report) => {
    assert.deepEqual(report.rootRelativePaths.map((entry) => entry.path), ['/assets/hit.ogg']);
  });
});

test('bundle check rejects root-relative JavaScript assignment and config paths', async () => {
  await withDist(
    {
      'game.js':
        'const config = { icon: "/assets/logo.png", api: "/api/score" }; img.src = "/assets/logo.png"; location.href = "/privacy"; location.assign("/menu");',
    },
    async (report) => {
      assert.deepEqual(report.rootRelativePaths.map((entry) => entry.path).sort(), ['/api/score', '/assets/logo.png', '/menu', '/privacy']);
    },
  );
});

test('bundle check rejects quoted config keys in JavaScript and JSON', async () => {
  await withDist(
    {
      'game.js': `const config = { "image": "/assets/player.png", 'audio': '/assets/hit.ogg' };`,
      'config.json': '{"baseUrl":"/api","icon":"/assets/icon.png"}',
    },
    async (report) => {
      assert.deepEqual(
        report.rootRelativePaths.map((entry) => entry.path).sort(),
        ['/api', '/assets/hit.ogg', '/assets/icon.png', '/assets/player.png'],
      );
    },
  );
});

test('bundle check rejects websocket endpoints', async () => {
  await withDist({ 'game.js': 'new WebSocket("wss://socket.example.com/game");' }, async (report) => {
    assert.equal(report.disallowedExternalUrls.length, 1);
    assert.equal(report.disallowedExternalUrls[0].url, 'wss://socket.example.com/game');
  });
});

test('bundle check ignores common SVG namespace URLs', async () => {
  await withDist({ 'icon.svg': '<svg xmlns:xlink="http://www.w3.org/1999/xlink"></svg>' }, async (report) => {
    assert.equal(report.disallowedExternalUrls.length, 0);
  });
});
