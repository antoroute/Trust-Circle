import 'package:code_assets/code_assets.dart';

/// native_toolchain_rust 1.0.4+0 hardcodes API 35. Override its compiler/linker
/// with the minimum API supplied by Flutter; keep upstream AR/RANLIB/sysroot.
/// Remove this adapter after a compatible upstream version honors targetNdkApi.
Map<String, String> androidCompilerEnvironment({
  required Architecture architecture,
  required int api,
  required Uri compiler,
  required bool windows,
}) {
  if (api < 21) throw ArgumentError.value(api, 'api', 'must be at least 21');
  final (rustTriple, ndkTriple) = switch (architecture) {
    Architecture.arm64 => ('aarch64-linux-android', 'aarch64-linux-android'),
    Architecture.arm => ('armv7-linux-androideabi', 'armv7a-linux-androideabi'),
    Architecture.x64 => ('x86_64-linux-android', 'x86_64-linux-android'),
    _ => throw UnsupportedError('Unsupported Android architecture'),
  };
  final suffix = windows ? '.cmd' : '';
  final directory = compiler.resolve('.');
  final clang = directory
      .resolve('$ndkTriple$api-clang$suffix')
      .toFilePath(windows: windows);
  final clangCpp = directory
      .resolve('$ndkTriple$api-clang++$suffix')
      .toFilePath(windows: windows);
  final envTriple = rustTriple.replaceAll('-', '_');
  return {
    'CC_$envTriple': clang,
    'CXX_$envTriple': clangCpp,
    'CARGO_TARGET_${envTriple.toUpperCase()}_LINKER': clang,
  };
}
