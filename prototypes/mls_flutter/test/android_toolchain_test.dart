import 'package:code_assets/code_assets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../hook/android_toolchain.dart';

void main() {
  for (final (architecture, rustTriple, ndkTriple) in [
    (Architecture.arm64, 'aarch64_linux_android', 'aarch64-linux-android'),
    (Architecture.arm, 'armv7_linux_androideabi', 'armv7a-linux-androideabi'),
    (Architecture.x64, 'x86_64_linux_android', 'x86_64-linux-android'),
  ]) {
    for (final api in [28, 35]) {
      for (final windows in [false, true]) {
        test('NDK $rustTriple API $api Windows=$windows', () {
          final prefix = windows
              ? r'C:\Android SDK\bin\'
              : '/ndk with spaces/bin/';
          final compiler = windows
              ? Uri.file('${prefix}clang.exe', windows: true)
              : Uri.file('${prefix}clang');
          final suffix = windows ? '.cmd' : '';
          final result = androidCompilerEnvironment(
            architecture: architecture,
            api: api,
            compiler: compiler,
            windows: windows,
          );
          expect(result, {
            'CC_$rustTriple': '$prefix$ndkTriple$api-clang$suffix',
            'CXX_$rustTriple': '$prefix$ndkTriple$api-clang++$suffix',
            'CARGO_TARGET_${rustTriple.toUpperCase()}_LINKER':
                '$prefix$ndkTriple$api-clang$suffix',
          });
        });
      }
    }
  }
  test('unsupported Android inputs fail closed', () {
    Map<String, String> build(Architecture arch, int api) =>
        androidCompilerEnvironment(
          architecture: arch,
          api: api,
          compiler: Uri.file('/ndk/bin/clang'),
          windows: false,
        );
    expect(() => build(Architecture.riscv64, 28), throwsUnsupportedError);
    expect(() => build(Architecture.arm64, 19), throwsArgumentError);
  });
}
