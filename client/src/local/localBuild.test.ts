// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LOCAL_CSP } from '../../localBuild';

let directory = '';
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe('offline Pages output', () => {
  it('emits scoped, self-hosted assets with an exact CSP and full cache precache', async () => {
    directory = await mkdtemp(join(tmpdir(), 'cachemesh-build-'));
    await build({ root: resolve('.'), mode: 'pages', build: { outDir: directory, emptyOutDir: true }, logLevel: 'silent' });
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    expect(html.replaceAll('&#39;', "'")).toContain(LOCAL_CSP);
    expect(html).toContain('data:image/svg+xml');
    expect(html).toContain('content="#faf9f6"');
    expect(html).toContain('/cachemesh/manifest.webmanifest');
    expect(html.replace(/data:image\/svg\+xml,[^\x22]+/g, '')).not.toMatch(/https?:\/\//);
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.scope).toBe('/cachemesh/');
    expect(manifest.start_url).toBe('/cachemesh/');
    expect(manifest.theme_color).toBe('#faf9f6');
    const worker = await readFile(join(directory, 'sw.js'), 'utf8');
    const assets = await readdir(join(directory, 'assets'));
    for (const asset of assets) expect(worker).toContain(`/cachemesh/assets/${asset}`);
    expect(assets.some((asset) => asset.endsWith('.css'))).toBe(true);
    for (const asset of assets.filter((name) => name.endsWith('.css'))) {
      const css = await readFile(join(directory, 'assets', asset), 'utf8');
      for (const face of css.matchAll(/@font-face\{[^}]+\}/g)) expect(face[0]).not.toContain('data:');
    }
    expect(worker).toMatch(/cachemesh-offline-_cachemesh_/);
  }, 60000);
});

