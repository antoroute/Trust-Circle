import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const auth = `ghcr.io/antoroute/circlehaven-auth@sha256:${'a'.repeat(64)}`;
const messaging = `ghcr.io/antoroute/circlehaven-messaging@sha256:${'b'.repeat(64)}`;

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'tc210-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ['bin', 'deploy/ci', 'deploy/staging', 'deploy/releases', 'backend', 'infrastructure/postgres']) {
    mkdirSync(join(dir, path), { recursive: true });
  }
  for (const path of ['deploy/staging/compose-release.sh', 'deploy/ci/prepare-staging-release.sh', 'deploy/ci/verify-image.sh']) {
    copyFileSync(join(root, path), join(dir, path));
  }
  writeFileSync(join(dir, 'private.env'), 'PRIVATE_SENTINEL=never-print-me\n');
  writeFileSync(join(dir, 'bin/docker'), `#!/usr/bin/env node
process.stdout.write(JSON.stringify({args:process.argv.slice(2),commit:process.env.TC_GIT_COMMIT,auth:process.env.TC_AUTH_IMAGE}));
`, { mode: 0o700 });
  writeFileSync(join(dir, 'bin/gh'), `#!/usr/bin/env node
const a=process.argv.slice(2);
if(a[0]==='api') {
  console.log(JSON.stringify({conclusion:process.env.TEST_CI_RESULT || 'success',status:'completed',head_sha:process.env.TEST_SOURCE,head_branch:'main',path:'.github/workflows/backend-images.yml'}));
} else {
  if(process.env.TEST_ATTESTATION_FAIL==='yes') process.exit(1);
  for(const key of ['--source-digest','--signer-digest']) if(a[a.indexOf(key)+1]!==process.env.TEST_SOURCE) process.exit(2);
  if(!a.includes('--deny-self-hosted-runners')) process.exit(3);
  console.log('[]');
}
`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, GIT_CONFIG_NOSYSTEM: '1' };
  const run = (cmd, args, extra = {}) => spawnSync(cmd, args, { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8' });
  const git = (...args) => {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const save = (content) => writeFileSync(join(dir, 'release.env'), content);
  const valid = `TC_GIT_COMMIT=${'c'.repeat(40)}\nTC_IMAGE_COMMIT=${'d'.repeat(40)}\nTC_AUTH_IMAGE=${auth}\nTC_MESSAGING_IMAGE=${messaging}\n`;
  return { dir, run, git, save, valid };
}

test('Compose pins public release values despite ambient overrides and passes arguments intact', (t) => {
  const f = fixture(t);
  f.save(f.valid);
  const result = f.run('bash', ['deploy/staging/compose-release.sh', 'private.env', 'config', '--quiet'], { TC_AUTH_IMAGE: 'attacker:latest', TC_GIT_COMMIT: 'wrong' });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.auth, auth);
  assert.equal(data.commit, 'c'.repeat(40));
  assert.deepEqual(data.args.slice(0, 7), ['compose', '--project-name', 'trust-circle-staging', '--env-file', 'private.env', '--env-file', join(f.dir, 'release.env')]);
  assert.deepEqual(data.args.slice(-2), ['config', '--quiet']);
  assert.ok(!result.stdout.includes('never-print-me'));
});

for (const [name, change] of [
  ['mutable tag', s => s.replace(auth, 'ghcr.io/antoroute/circlehaven-auth:latest')],
  ['wrong repository', s => s.replace('circlehaven-auth@', 'other-auth@')],
  ['duplicate key', s => s + `TC_AUTH_IMAGE=${auth}\n`],
  ['unknown key', s => s + 'DATABASE_URL=forbidden\n'],
  ['missing key', s => s.replace(/^TC_IMAGE_COMMIT=.*\n/m, '')],
  ['invalid commit', s => s.replace('c'.repeat(40), 'main')],
  ['shell substitution', s => s.replace(auth, '$(touch injected)')],
]) {
  test(`Compose rejects ${name} before executing Docker`, (t) => {
    const f = fixture(t);
    f.save(change(f.valid));
    const result = f.run('bash', ['deploy/staging/compose-release.sh', 'private.env', 'up']);
    assert.equal(result.status, 65);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(f.dir, 'injected')), false);
  });
}

function committedFixture(t) {
  const f = fixture(t);
  f.git('init', '-b', 'main');
  f.git('config', 'user.email', 'fixture@example.invalid');
  f.git('config', 'user.name', 'Fixture');
  writeFileSync(join(f.dir, 'backend/source'), 'original');
  f.git('add', 'deploy', 'backend');
  f.git('commit', '-qm', 'image source');
  const source = f.git('rev-parse', 'HEAD');
  const manifest = { schemaVersion: 1, commit: source, platform: 'linux/amd64', workflow: 'antoroute/Trust-Circle/.github/workflows/backend-images.yml', run: 'https://github.com/antoroute/Trust-Circle/actions/runs/123', images: { auth, messaging } };
  writeFileSync(join(f.dir, `deploy/releases/${source}.json`), JSON.stringify(manifest));
  f.git('add', 'deploy/releases');
  f.git('commit', '-qm', 'release manifest');
  const deployment = f.git('rev-parse', 'HEAD');
  const out = join(f.dir, 'output');
  const prepare = (extra = {}, revision = deployment) => f.run('bash', ['deploy/ci/prepare-staging-release.sh', revision, source, out], { TEST_SOURCE: source, ...extra });
  return { ...f, source, deployment, out, prepare };
}

test('Preparation archives only committed files and records both verified digests', (t) => {
  const f = committedFixture(t);
  writeFileSync(join(f.dir, 'backend/source'), 'uncommitted change');
  const result = f.prepare();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(f.out, 'backend/source'), 'utf8'), 'original');
  assert.equal(readFileSync(join(f.out, 'release.env'), 'utf8'), `TC_GIT_COMMIT=${f.deployment}\nTC_IMAGE_COMMIT=${f.source}\nTC_AUTH_IMAGE=${auth}\nTC_MESSAGING_IMAGE=${messaging}\n`);
  assert.ok(existsSync(join(f.out, 'release-evidence/auth.json')));
  assert.ok(existsSync(join(f.out, 'release-evidence/messaging.json')));
  assert.equal(f.prepare().status, 73, 'existing output must not be overwritten');
});

for (const [name, env] of [['failed CI', { TEST_CI_RESULT: 'failure' }], ['failed attestation', { TEST_ATTESTATION_FAIL: 'yes' }]]) {
  test(`Preparation rejects ${name} without creating a release`, (t) => {
    const f = committedFixture(t);
    assert.notEqual(f.prepare(env).status, 0);
    assert.equal(existsSync(f.out), false);
  });
}

test('Preparation rejects a deployment whose application differs from signed source', (t) => {
  const f = committedFixture(t);
  writeFileSync(join(f.dir, 'backend/source'), 'another application');
  f.git('add', 'backend');
  f.git('commit', '-qm', 'application changed');
  assert.equal(f.prepare({}, f.git('rev-parse', 'HEAD')).status, 65);
  assert.equal(existsSync(f.out), false);
});
