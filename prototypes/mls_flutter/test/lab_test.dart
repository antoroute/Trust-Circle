import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated_io.dart'
    show ExternalLibrary;
import 'package:flutter_test/flutter_test.dart';
import 'package:mls_flutter/lab_runner.dart';
import 'package:mls_flutter/src/rust/frb_generated.dart';

void main() {
  test(
    'Dart admission stays bounded and releases slots after failure',
    () async {
      final gate = AdmissionGate(limit: 1);
      final held = Completer<int>();
      final first = gate.run(() => held.future);
      await expectLater(gate.run(() async => 2), throwsStateError);
      held.complete(1);
      expect(await first, 1);
      await expectLater(
        gate.run<int>(() async => throw StateError('synthetic')),
        throwsStateError,
      );
      expect(await gate.run(() async => 3), 3);
    },
  );
  test(
    'native lifecycle, heartbeat and atomic batch through Dart FFI',
    () async {
      // flutter test is not an app bundle: load the asset produced by the hook.
      // Packaged apps/integration tests exercise the default platform loader.
      final name = Platform.isWindows
          ? 'circlehaven_mls_bridge.dll'
          : 'libcirclehaven_mls_bridge.${Platform.isMacOS ? 'dylib' : 'so'}';
      await RustLib.init(
        externalLibrary: ExternalLibrary.open(
          File('build/native_assets/${Platform.operatingSystem}/$name')
              .absolute
              .path,
        ),
      );
      final result = await runLab();
      expect(result['delivered'], 1025);
      expect(result['heartbeat_ticks'], greaterThan(0));
      expect(result['lifecycle_checks'], greaterThan(50));
      final reportDir = Platform.environment['TC_MLS_REPORT_DIR'];
      if (reportDir != null && reportDir.isNotEmpty) {
        await Directory(reportDir).create(recursive: true);
        await File('$reportDir/flutter-host.json')
            .writeAsString(const JsonEncoder.withIndent('  ').convert(result));
      }
    },
    timeout: const Timeout(Duration(minutes: 4)),
  );
}
