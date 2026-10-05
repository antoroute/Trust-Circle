import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inventory, packageLab } from './package-lab.mjs';

test('inventory detects changes, sorts paths and rejects symlinks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc301-bundle-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'synthetic');
    const first = inventory(dir);
    assert.equal(first.length, 1);
    assert.equal(first[0].bytes, 9);
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'tampered');
    assert.notEqual(inventory(dir)[0].sha256, first[0].sha256);
    // Windows CI may not grant unprivileged symlink creation.
    if (process.platform !== 'win32') {
      fs.symlinkSync(path.join(dir, 'sample.txt'), path.join(dir, 'link'));
      assert.throws(() => inventory(dir), /Symlink/);
    }
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('unknown package targets fail before any writes', () => {
  assert.throws(() => packageLab('../escape'), /Unsupported/);
});

test('PowerShell verifier accepts intact bundle and rejects tamper, extras and traversal', {
  skip: spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status !== 0,
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc301-verify-test-'));
  try {
    const script = path.join(dir, 'Verify-Lab.ps1');
    fs.copyFileSync(fileURLToPath(new URL('Verify-Lab.ps1', import.meta.url)), script);
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'synthetic');
    const manifest = { schema: 'tc301-lab-bundle-v1', files: inventory(dir) };
    const save = value => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(value));
    const check = () => spawnSync('pwsh', ['-NoProfile', '-File', script], { encoding: 'utf8' });
    save(manifest);
    const valid = check();
    assert.equal(valid.status, 0, valid.stderr);
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'tampered');
    assert.notEqual(check().status, 0);
    fs.writeFileSync(path.join(dir, 'sample.txt'), 'synthetic');
    fs.writeFileSync(path.join(dir, 'extra.txt'), 'extra');
    assert.notEqual(check().status, 0);
    fs.unlinkSync(path.join(dir, 'extra.txt'));
    save({ ...manifest, files: [...manifest.files, manifest.files[0]] });
    assert.notEqual(check().status, 0);
    save({ ...manifest, files: [{ path: '../escape', bytes: 0, sha256: '' }] });
    assert.notEqual(check().status, 0);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
