import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'src/rust/api/lab.dart' as native;

/// Admission before the generated bridge. Rust also bounds its own mailbox.
class AdmissionGate {
  AdmissionGate({this.limit = 8}) {
    if (limit < 1 || limit > 8) throw ArgumentError.value(limit);
  }
  final int limit;
  int _pending = 0;
  Future<T> run<T>(Future<T> Function() operation) async {
    if (_pending >= limit) throw StateError('lab_busy');
    _pending++;
    try {
      return await operation();
    } finally {
      _pending--;
    }
  }
}

Map<String, Object> statistics(List<double> values) {
  final sorted = [...values]..sort();
  if (sorted.isEmpty) return {'samples': 0};
  return {
    'samples': sorted.length,
    'p50_ms': sorted[(sorted.length - 1) ~/ 2],
    'p95_ms': sorted[(sorted.length * .95).ceil() - 1],
  };
}

/// No network, account, real messages or credentials; synthetic lifecycle only.
Future<Map<String, Object>> runLab({void Function(String)? onProgress}) async {
  final gate = AdmissionGate();
  final parent = await Directory.systemTemp.createTemp('circlehaven_flutter_');
  int? session;
  var ticks = 0;
  var rssSampleMax = ProcessInfo.currentRss;
  final intervals = <double>[];
  var previousTick = Stopwatch()..start();
  final heartbeat = Timer.periodic(const Duration(milliseconds: 16), (_) {
    intervals.add(previousTick.elapsedMicroseconds / 1000);
    previousTick = Stopwatch()..start();
    ticks++;
    final rss = ProcessInfo.currentRss;
    if (rss > rssSampleMax) rssSampleMax = rss;
  });
  final endToEnd = Stopwatch()..start();
  final pingTimes = <double>[],
      singleTimes = <double>[],
      receiveTimes = <double>[];
  final queueTimes = <double>[], unit100 = <double>[], batch100 = <double>[];
  var delivered = 0, lifecycleChecks = 0;
  void check(bool valid) {
    if (!valid) throw StateError('lab_validation_failed');
    lifecycleChecks++;
  }

  Future<native.LabReply> execute(native.LabAction action, int count) =>
      gate.run(
        () =>
            native.executeLab(session: session!, action: action, count: count),
      );
  try {
    onProgress?.call('Création du groupe synthétique');
    final opened = await gate.run(() => native.startLab(parent: parent.path));
    session = opened.session;
    check(opened.members == 2 && opened.epoch == 1);
    onProgress?.call('Mesure du pont, charge utile de 1 Kio');
    final payload = Uint8List(1024);
    for (var i = 0; i < 30; i++) {
      final timer = Stopwatch()..start();
      final length = await gate.run(() => native.ping(payload: payload));
      pingTimes.add(timer.elapsedMicroseconds / 1000);
      check(length == 1024);
    }
    onProgress?.call('Messages unitaires, avec persistance');
    for (var i = 0; i < 20; i++) {
      final timer = Stopwatch()..start();
      final result = await execute(native.LabAction.exchange, 1);
      singleTimes.add(timer.elapsedMicroseconds / 1000);
      receiveTimes.add(result.receiveMs);
      queueTimes.add(result.queueMs);
      delivered += result.delivered;
      check(result.delivered == 1);
    }
    onProgress?.call('Comparaison des écritures unitaires et en lot');
    for (var i = 0; i < 5; i++) {
      final unit = await execute(native.LabAction.exchange, 100);
      final batch = await execute(native.LabAction.exchangeBatch, 100);
      unit100.add(unit.receiveMs);
      batch100.add(batch.receiveMs);
      delivered += unit.delivered + batch.delivered;
      check(unit.delivered == 100 && batch.delivered == 100);
    }
    onProgress?.call('Ajout, renouvellement et révocation');
    final added = await execute(native.LabAction.addThird, 1);
    check(added.members == 3 && added.epoch == 2);
    final toThree = await execute(native.LabAction.exchangeBatch, 2);
    check(toThree.delivered == 4);
    delivered += toThree.delivered;
    final updated = await execute(native.LabAction.update, 1);
    check(updated.members == 3 && updated.epoch == 3);
    final removed = await execute(native.LabAction.removeThird, 1);
    check(removed.members == 2 && removed.epoch == 4);
    final after = await execute(native.LabAction.exchange, 1);
    // Rust also checks that the removed device rejects the new ciphertext.
    check(after.delivered == 1 && after.epoch == 4);
    delivered += after.delivered;
    onProgress?.call('Nettoyage des données synthétiques');
    await gate.run(() => native.closeLab(session: session!));
    session = null;
    check(await parent.list().isEmpty);
    return {
      'scope': 'synthetic Flutter/native; unencrypted lab SQLite; no network or V2 baseline',
      'os': Platform.operatingSystem,
      'dart_mode': kReleaseMode
          ? 'release'
          : (kProfileMode ? 'profile' : 'debug'),
      'rust_mode': 'release (native-assets hook)',
      'process_rss_sample_max_bytes': rssSampleMax,
      'lifecycle_checks': lifecycleChecks,
      'delivered': delivered,
      'heartbeat_ticks': ticks,
      'heartbeat_interval': statistics(intervals),
      'bridge_1kib_roundtrip': statistics(pingTimes),
      'single_send_and_receive_roundtrip': statistics(singleTimes),
      'native_receive_transaction': statistics(receiveTimes),
      'native_queue_wait': statistics(queueTimes),
      'native_receive_100_individual_transactions': statistics(unit100),
      'native_receive_100_one_transaction': statistics(batch100),
      'total_ms': endToEnd.elapsedMicroseconds / 1000,
    };
  } finally {
    heartbeat.cancel();
    try {
      if (session != null) {
        await gate.run(() => native.closeLab(session: session!));
      }
    } finally {
      // Only the unique temporary directory owned by this run is removed.
      await parent.delete(recursive: true);
    }
  }
}
