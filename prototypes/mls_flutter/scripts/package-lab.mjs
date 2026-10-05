// Synthetic internal lab bundle. No release/store signing or secret input.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function inventory(root) {
  const result = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Symlink not allowed in lab bundle');
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) result.push({
        path: path.relative(root, file).split(path.sep).join('/'),
        bytes: stat.size,
        sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      });
      else throw Error('Unexpected bundle entry');
    }
  }
  visit(root);
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 30_000_000 });
  if (result.status !== 0) throw Error(`${command} failed (details omitted)`);
  return result.stdout.trim();
}

export function packageLab(platform) {
  if (!['windows', 'android'].includes(platform)) throw Error('Unsupported bundle target');
  if (!fs.existsSync('rust/Cargo.lock')) throw Error('Run from prototypes/mls_flutter');
  const commit = run('git', ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid commit');
  const root = path.resolve('distribution', platform);
  if (fs.existsSync(root)) throw Error('Bundle already exists; do not overwrite');
  fs.mkdirSync(root, { recursive: true });
  const copy = (source, target) => fs.cpSync(source, path.join(root, target), { recursive: true, errorOnExist: true, force: false });
  if (platform === 'windows') {
    if (!fs.existsSync('build/windows/x64/runner/Release/mls_flutter.exe')) throw Error('Missing release executable');
    copy('build/windows/x64/runner/Release', 'app');
    if (!inventory(path.join(root, 'app')).some(f => f.path.endsWith('circlehaven_mls_bridge.dll'))) throw Error('Missing native bridge');
  } else {
    copy('build/app/outputs/flutter-apk/app-debug.apk', 'circlehaven-mls-lab-x86_64-debug.apk');
  }
  copy('rust/Cargo.lock', 'provenance/Cargo.lock');
  copy('pubspec.lock', 'provenance/pubspec.lock');
  copy('../../docs/quality/TC-301-LOCAL_VALIDATION.md', 'LOCAL_VALIDATION.md');
  const notices = dependencyNotices(root);
  fs.writeFileSync(path.join(root, 'README.txt'), [
    'CircleHaven MLS laboratory - synthetic data only, NOT the messaging application.',
    `Source commit: ${commit}`,
    'No backend, accounts or real keys. Temporary SQLite is NOT encrypted.',
    platform === 'windows' ? 'Keep the full app folder together; launch app/mls_flutter.exe. Unsigned release lab only.' : 'x86_64 Pixel emulator only. Debug APK, development signature; not a Samsung/ARM build.',
    'Use Verify-Lab.ps1 before running. SHA-256 checks integrity, not publisher authenticity; obtain from your authenticated GitHub run.',
    'The Checks button runs 1025 receipts/62 controls. Measurements run 3 independent sessions and may take minutes.',
    'Copy the numerical JSON report via the explicit button. No secrets or databases are needed.',
    'Rust/Dart notices and unmodified MPL crate sources accompany this internal bundle.',
    'The metadata graph includes build/test/platform dependencies too; it is not a minimal runtime SBOM.',
    'This does not grant a license to project-owned code or certify store/legal/security readiness.',
  ].join('\r\n'));
  copy('scripts/Verify-Lab.ps1', 'Verify-Lab.ps1');
  const files = inventory(root);
  const manifest = {
    schema: 'tc301-lab-bundle-v1', source_commit: commit, platform,
    mode: platform === 'windows' ? 'release' : 'debug',
    architecture: 'x86_64', flutter: '3.47.4', rust: '1.99.0',
    project_signing: 'development-or-unsigned; not store-ready',
    total_bytes_without_manifest: files.reduce((sum, f) => sum + f.bytes, 0),
    rust_dependencies: notices, files,
  };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { platform, commit, files: files.length, bytes: manifest.total_bytes_without_manifest };
}

export function dependencyNotices(root) {
  const copy = (source, target) => fs.cpSync(source, path.join(root, target), { recursive: true, errorOnExist: true, force: false });
  const pinnedDirectory = fileURLToPath(new URL('upstream-licenses/', import.meta.url));
  const pinned = JSON.parse(fs.readFileSync(path.join(pinnedDirectory, 'index.json'), 'utf8'));
  const packages = JSON.parse(run('cargo', ['metadata', '--manifest-path', 'rust/Cargo.toml', '--locked', '--format-version', '1'])).packages;
  const notices = [];
  for (const pkg of packages.filter(p => p.source)) {
    const directory = path.dirname(pkg.manifest_path);
    const name = `${pkg.name}-${pkg.version}`;
    const licenseFiles = fs.readdirSync(directory).filter(f => /^(licen[cs]e|copying|copyright|notice|unlicense)([._-]|$)/i.test(f));
    if (pkg.license_file) {
      const relative = path.relative(directory, path.resolve(directory, pkg.license_file));
      if (!licenseFiles.includes(relative)) licenseFiles.push(relative);
    }
    if (!licenseFiles.length) {
      const entry = pinned[`${pkg.name}@${pkg.version}`];
      const vcs = JSON.parse(fs.readFileSync(path.join(directory, '.cargo_vcs_info.json'), 'utf8'));
      if (!entry || entry.vcs_commit !== vcs.git.sha1 || entry.declared_license !== pkg.license) throw Error(`Unreviewed license text for ${name}`);
      const source = path.join(pinnedDirectory, entry.file);
      if (createHash('sha256').update(fs.readFileSync(source)).digest('hex') !== entry.sha256) throw Error('Pinned license checksum mismatch');
      copy(source, `third-party/rust-notices/${name}/LICENSE-upstream.txt`);
    }
    for (const file of licenseFiles) {
      const source = path.resolve(directory, file);
      if (!source.startsWith(directory + path.sep)) throw Error('License path escapes crate');
      copy(source, `third-party/rust-notices/${name}/${file}`);
    }
    const mpl = (pkg.license || '').includes('MPL-2.0');
    if (mpl) copy(directory, `third-party/mpl-sources/${name}`);
    notices.push({ name: pkg.name, version: pkg.version, license: pkg.license || 'see included license file', mpl_source_included: mpl });
  }
  copy(path.join(pinnedDirectory, 'index.json'), 'third-party/upstream-license-provenance.json');
  // Dart packages and the Flutter framework/engine carry their own license texts.
  const config = JSON.parse(fs.readFileSync('.dart_tool/package_config.json', 'utf8'));
  const configUrl = new URL('../.dart_tool/package_config.json', import.meta.url);
  const framework = config.packages.find(p => p.name === 'flutter');
  const flutterRoot = path.resolve(fileURLToPath(new URL(framework.rootUri, configUrl)), '../..');
  if (run('git', ['-C', flutterRoot, 'rev-parse', 'HEAD']) !== '9584c6713b324636289d067944a46fd6b49df14b') throw Error('Unreviewed Flutter SDK');
  copy(path.join(flutterRoot, 'LICENSE'), 'third-party/flutter-LICENSE');
  copy(path.join(flutterRoot, 'bin/cache/dart-sdk/LICENSE'), 'third-party/dart-sdk-LICENSE');
  const engineRoot = path.join(flutterRoot, 'bin/cache/artifacts/engine');
  function engineNotices(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) engineNotices(source);
      else if (entry.isFile() && /^(LICENSE|NOTICE)/i.test(entry.name)) {
        copy(source, path.join('third-party/flutter-engine', path.relative(engineRoot, source)));
      }
    }
  }
  engineNotices(engineRoot);
  for (const pkg of config.packages.filter(p => p.name !== 'mls_flutter')) {
    const directory = fileURLToPath(new URL(pkg.rootUri, configUrl));
    const licenses = fs.readdirSync(directory).filter(f => /^(licen[cs]e|copying|notice)([._-]|$)/i.test(f));
    if (!licenses.length) {
      if (!directory.startsWith(flutterRoot + path.sep)) throw Error(`Dart license text missing for ${pkg.name}`);
      copy(path.join(flutterRoot, 'LICENSE'), `third-party/dart-notices/${pkg.name}/LICENSE`);
    }
    for (const file of licenses) copy(path.join(directory, file), `third-party/dart-notices/${pkg.name}/${file}`);
  }
  return notices;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(packageLab(process.argv[2])));
}
