import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated_io.dart'
    show ExternalLibrary;
import 'package:flutter_test/flutter_test.dart';
import 'package:mls_flutter/lab_runner.dart';
import 'package:mls_flutter/measurements.dart';
import 'package:mls_flutter/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async {
    // Host tester only; packaged integration tests keep the default loader.
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
  });
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
  test('measurement stages and cleanup across fresh sessions', () async {
    final result = await runMeasurements(plan: MeasurementPlan.ci);
    expect(result['budgets_accepted'], false);
    final sessions = result['sessions'] as List;
    expect(sessions, hasLength(1));
    final run = sessions.single as Map;
    expect(run['delivered'], MeasurementPlan.ci.receiptsPerSession);
    final warm = run['after_warmup'] as Map;
    final samples = warm['samples_ms'] as Map;
    expect((samples['receive_ms'] as List), hasLength(50));
    final stats = warm['statistics'] as Map;
    expect((stats['receive_commit_ms'] as Map)['samples'], 50);
    final dir = Platform.environment['TC_MLS_REPORT_DIR'];
    if (dir != null && dir.isNotEmpty) {
      await Directory(dir).create(recursive: true);
      await File('$dir/measurements-host.json')
          .writeAsString(const JsonEncoder.withIndent('  ').convert(result));
    }
  }, timeout: const Timeout(Duration(minutes: 4)));
}
