// tests/plugins-symlink-discovery.test.mjs — a symlinked plugin directory must
// be discovered (#3140).
//
// readdirSync(withFileTypes) does NOT follow links, so a symlinked plugin dir
// reports isDirectory() === false and was filtered out before the manifest was
// read — and before warnSkip() could fire, so the plugin never appeared and
// nothing said why. plugins.local/ exists so a developer can work from their
// own checkout, and symlinking it in is the natural way to do that, so the one
// arrangement the directory is for was the one that did not work.
//
// The dangling-link case is the reason the resolve is guarded: statSync throws
// on a broken link, and unguarded that would abort discovery for EVERY plugin
// in the root rather than skipping the one dead entry.
//
// Run:  node --test tests/plugins-symlink-discovery.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { discoverPlugins, pluginRoots } = await import(pathToFileURL(join(ROOT, 'plugins/_engine.mjs')).href);

/** Write a minimal valid plugin at `dir` whose id matches the directory name. */
function writePlugin(dir, id) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id, apiVersion: 1, description: id, hooks: ['ingest'],
    requiredEnv: [], allowedHosts: [], humanInTheLoop: true,
  }));
  writeFileSync(join(dir, 'index.mjs'), 'export default {};\n');
}

function withRoot(fn) {
  const base = mkdtempSync(join(tmpdir(), 'cops-plugins-'));
  try {
    mkdirSync(join(base, 'plugins.local'), { recursive: true });
    return fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const ids = (base) => discoverPlugins(pluginRoots(base)).map((p) => p.id).sort();

test('a symlinked plugin directory is discovered', () => {
  withRoot((base) => {
    const checkout = join(base, 'checkouts', 'demo');
    writePlugin(checkout, 'demo');
    symlinkSync(checkout, join(base, 'plugins.local', 'demo'));
    assert.deepEqual(ids(base), ['demo'], 'the symlinked plugin was skipped');
  });
});

test('a real directory still works — the filter did not invert', () => {
  withRoot((base) => {
    writePlugin(join(base, 'plugins.local', 'demo'), 'demo');
    assert.deepEqual(ids(base), ['demo']);
  });
});

test('a dangling symlink is skipped quietly and the rest still load', () => {
  // The guard's whole purpose: unguarded, statSync on the broken link throws
  // and takes every other plugin in the root with it.
  withRoot((base) => {
    const checkout = join(base, 'checkouts', 'demo');
    writePlugin(checkout, 'demo');
    symlinkSync(checkout, join(base, 'plugins.local', 'demo'));
    writePlugin(join(base, 'plugins.local', 'second'), 'second');
    symlinkSync(join(base, 'nowhere-at-all'), join(base, 'plugins.local', 'dead'));
    assert.deepEqual(ids(base), ['demo', 'second'], 'a dangling link disrupted discovery');
  });
});

test('a symlink to a FILE is not treated as a plugin directory', () => {
  // isSymbolicLink() alone is not the question — "does it lead to a directory"
  // is, which is why the resolve is statSync().isDirectory() and not a bare
  // "links are fine" pass.
  withRoot((base) => {
    const file = join(base, 'not-a-dir.txt');
    writeFileSync(file, 'x');
    symlinkSync(file, join(base, 'plugins.local', 'bogus'));
    writePlugin(join(base, 'plugins.local', 'second'), 'second');
    assert.deepEqual(ids(base), ['second']);
  });
});

test('underscore and dot entries are still excluded, symlinked or not', () => {
  // _engine.mjs / _net.mjs live alongside plugins; the prefix filter must keep
  // applying after the link resolve was added.
  withRoot((base) => {
    const checkout = join(base, 'checkouts', 'hidden');
    writePlugin(checkout, 'hidden');
    symlinkSync(checkout, join(base, 'plugins.local', '_hidden'));
    symlinkSync(checkout, join(base, 'plugins.local', '.hidden'));
    writePlugin(join(base, 'plugins.local', 'second'), 'second');
    assert.deepEqual(ids(base), ['second']);
  });
});
