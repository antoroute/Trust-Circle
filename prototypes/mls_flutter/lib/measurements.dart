import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'lab_runner.dart';
import 'src/rust/api/lab.dart' as native;

class MeasurementPlan {
  const MeasurementPlan._(this.sessions, this.warmup, this.singles, this.lots);
  static const ci = MeasurementPlan._(1, 5, 50, 3);
  static const standard = MeasurementPlan._(3, 10, 100, 10);
  final int sessions, warmup, singles, lots;

  int get receiptsPerSession => 1 + warmup + singles + 200 * lots;
}

String get labSourceCommit {
  const value = String.fromEnvironment('LAB_COMMIT');
  return RegExp(r'^[a-f0-9]{40}$').hasMatch(value)
      ? value
      : 'unversioned-local';
}

/// Numerical diagnostics only. Percentiles are never added together.
class MeasurementSamples {
  final Map<String, List<double>> values = {};
  void add(native.LabReply r, double roundtripMs) {
    final stages = {
      'roundtrip_ms': roundtripMs,
      'queue_ms': r.queueMs,
      'send_ms': r.sendMs,
      'receive_ms': r.receiveMs,
      'receive_begin_ms': r.receiveBeginMs,
      'receive_group_load_ms': r.receiveGroupLoadMs,
      'receive_work_and_sql_ms': r.receiveWorkAndSqlMs,
      'receive_commit_ms': r.receiveCommitMs,
    };
    for (final entry in stages.entries) {
      if (!entry.value.isFinite || entry.value < 0) {
        throw StateError('invalid_measurement');
      }
      values.putIfAbsent(entry.key, () => []).add(entry.value);
    }
  }

  Map<String, Object> report() => {
    'statistics': {for (final e in values.entries) e.key: statistics(e.value)},
    // Keep outliers and acquisition order. No message/identity/key enters here.
    'samples_ms': values,
  };
}

Future<Map<String, Object>> runMeasurements({
  MeasurementPlan plan = MeasurementPlan.standard,
  void Function(String)? onProgress,
}) async {
  final gate = AdmissionGate();
  final sessions = <Map<String, Object>>[];
  var rssMax = ProcessInfo.currentRss;
  final heartbeat = Timer.periodic(const Duration(milliseconds: 16), (_) {
    final rss = ProcessInfo.currentRss;
    if (rss > rssMax) rssMax = rss;
  });
  final total = Stopwatch()..start();
  try {
    for (var run = 0; run < plan.sessions; run++) {
      final parent = await Directory.systemTemp.createTemp(
        'circlehaven_measure_',
      );
      int? session;
      var delivered = 0;
      final first = MeasurementSamples(), singles = MeasurementSamples();
      final individual = MeasurementSamples(), batch = MeasurementSamples();
      Future<void> exchange(
        native.LabAction action,
        int count,
        MeasurementSamples? samples,
      ) async {
        final timer = Stopwatch()..start();
        final r = await gate.run(
          () => native.executeLab(
            session: session!,
            action: action,
            count: count,
          ),
        );
        final roundtrip = timer.elapsedMicroseconds / 1000;
        final transactions = action == native.LabAction.exchange ? count : 1;
        if (r.delivered != count ||
            r.members != 2 ||
            r.epoch != 1 ||
            r.receiveTransactions != transactions) {
          throw StateError('measurement_validation_failed');
        }
        delivered += r.delivered;
        samples?.add(r, roundtrip);
      }

      try {
        onProgress?.call(
          'Série ${run + 1}/${plan.sessions} : création et échauffement',
        );
        final setup = Stopwatch()..start();
        final opened = await gate.run(
          () => native.startLab(parent: parent.path),
        );
        final setupMs = setup.elapsedMicroseconds / 1000;
        session = opened.session;
        await exchange(native.LabAction.exchange, 1, first);
        for (var i = 0; i < plan.warmup; i++) {
          await exchange(native.LabAction.exchange, 1, null);
        }
        onProgress?.call(
          'Série ${run + 1} : ${plan.singles} messages après échauffement',
        );
        for (var i = 0; i < plan.singles; i++) {
          await exchange(native.LabAction.exchange, 1, singles);
        }
        onProgress?.call(
          'Série ${run + 1} : écritures unitaires et lots durables',
        );
        for (var i = 0; i < plan.lots; i++) {
          // Alternate order to reduce systematic order/warm-up bias.
          if ((i + run).isEven) {
            await exchange(native.LabAction.exchange, 100, individual);
            await exchange(native.LabAction.exchangeBatch, 100, batch);
          } else {
            await exchange(native.LabAction.exchangeBatch, 100, batch);
            await exchange(native.LabAction.exchange, 100, individual);
          }
        }
        await gate.run(() => native.closeLab(session: session!));
        session = null;
        if (delivered != plan.receiptsPerSession ||
            !await parent.list().isEmpty) {
          throw StateError('measurement_cleanup_failed');
        }
        sessions.add({
          'index': run + 1,
          'setup_ms': setupMs,
          'delivered': delivered,
          'warmup_excluded_samples': plan.warmup,
          'first_exchange_after_setup': first.report(),
          'after_warmup': singles.report(),
          'receive100_individual': individual.report(),
          'receive100_batch': batch.report(),
          'receive_over_100ms': singles.values['receive_ms']!
              .where((v) => v > 100)
              .length,
          'roundtrip_over_100ms': singles.values['roundtrip_ms']!
              .where((v) => v > 100)
              .length,
        });
      } finally {
        try {
          if (session != null) {
            await gate.run(() => native.closeLab(session: session!));
          }
        } finally {
          await parent.delete(recursive: true);
        }
      }
    }
  } finally {
    heartbeat.cancel();
  }
  return {
    'schema': 'tc301-measurements-v1',
    'source_commit': labSourceCommit,
    'scope': 'synthetic; no V2 baseline, network, encrypted storage or battery measurement',
    'os': Platform.operatingSystem,
    'dart_mode': kReleaseMode
        ? 'release'
        : (kProfileMode ? 'profile' : 'debug'),
    'rust_mode': 'release',
    'provider': 'RustCrypto',
    'storage': 'SQLite synchronous=FULL; default rollback journal; location is OS temporary directory',
    'payload_bytes': 1024,
    'group_members': 2,
    'virtual_devices_in_process': 3,
    'budgets_accepted': false,
    'notes': [
      'First exchange is after session setup, NOT cold OS cache or app startup.',
      'Group is reloaded each transaction, even after warm-up.',
      'Work includes MLS and SQLite calls; commit is not a direct fsync measurement.',
      'Stage timings exclude input decoding; receive_ms includes it.',
      'Sender preparation is excluded from receive100 timings, included in roundtrip.',
      'No outliers removed; sessions stay separate; few batches give exploratory percentiles.',
    ],
    'process_rss_sample_max_bytes': rssMax,
    'total_ms': total.elapsedMicroseconds / 1000,
    'sessions': sessions,
  };
}
