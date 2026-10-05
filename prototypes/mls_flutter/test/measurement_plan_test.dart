import 'package:flutter_test/flutter_test.dart';
import 'package:mls_flutter/lab_runner.dart';
import 'package:mls_flutter/measurements.dart';

void main() {
  test('plans stay below native limits and separate repeated sessions', () {
    expect(MeasurementPlan.ci.receiptsPerSession, 656);
    expect(MeasurementPlan.standard.receiptsPerSession, 2111);
    expect(MeasurementPlan.standard.sessions, 3);
    for (final plan in [MeasurementPlan.ci, MeasurementPlan.standard]) {
      expect(plan.receiptsPerSession, lessThan(5000));
      expect(plan.singles, greaterThanOrEqualTo(50));
      expect(plan.warmup, greaterThan(0));
    }
  });
  test('nearest-rank p95 retains slow samples and does not mutate input', () {
    final samples = [for (var i = 100; i > 0; i--) i.toDouble()];
    final result = statistics(samples);
    expect(result['p95_ms'], 95);
    expect(result['p50_ms'], 50);
    expect(samples.first, 100);
    expect(statistics([]), {'samples': 0});
  });
}
