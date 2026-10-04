import 'dart:io';

import 'package:code_assets/code_assets.dart';
import 'package:flutter_rust_bridge_hooks/flutter_rust_bridge_hooks.dart';

import 'android_toolchain.dart';

void main(List<String> args) async {
  await build(args, (input, output) async {
    if (!input.config.buildCodeAssets) return;
    final code = input.config.code;
    final androidEnvironment = code.targetOS == OS.android
        ? androidCompilerEnvironment(
            architecture: code.targetArchitecture,
            api: code.android.targetNdkApi,
            compiler: code.cCompiler!.compiler,
            windows: Platform.isWindows,
          )
        : <String, String>{};
    for (final binary in androidEnvironment.values.toSet()) {
      if (!File(binary).existsSync()) {
        throw StateError('Android NDK compiler missing: $binary');
      }
    }
    await FlutterRustBridgeNativeAssetsBuilder(
      cratePath: 'rust',
      extraCargoBuildArgs: const ['--locked'],
      extraCargoEnvironmentVariables: androidEnvironment,
    ).run(input: input, output: output);
  });
}
