import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mls_flutter/main.dart';
import 'package:mls_flutter/measurements.dart';
import 'package:mls_flutter/src/rust/frb_generated.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('bounded measurements from the UI, not a product budget gate', (
    tester,
  ) async {
    await RustLib.init();
    Map<String, Object>? report;
    await tester.pumpWidget(
      LabApp(
        measurementPlan: MeasurementPlan.ci,
        onReport: (value) => report = value,
      ),
    );
    await tester.tap(find.byKey(const Key('lab-measure')));
    await tester.pump();
    final deadline = DateTime.now().add(const Duration(minutes: 4));
    while (report == null && DateTime.now().isBefore(deadline)) {
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.text('Échec du laboratoire — validation requise'),
        findsNothing,
      );
    }
    expect(report, isNotNull);
    expect(report!['budgets_accepted'], false);
    final sessions = report!['sessions'] as List;
    expect(sessions.single['delivered'], MeasurementPlan.ci.receiptsPerSession);
    expect(find.text('Copier le rapport JSON'), findsOneWidget);
    binding.reportData = {'mls_measurements': report};
    await tester.pumpWidget(const SizedBox.shrink());
  }, timeout: const Timeout(Duration(minutes: 5)));
}
