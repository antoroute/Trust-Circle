import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mls_flutter/main.dart';
import 'package:mls_flutter/src/rust/frb_generated.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('MLS lifecycle through the asynchronous bridge', (tester) async {
    await RustLib.init();
    Map<String, Object>? result;
    await tester.pumpWidget(LabApp(onReport: (value) => result = value));
    expect(find.text('CircleHaven — MLS Lab'), findsOneWidget);
    await tester.tap(find.text('Exécuter les vérifications'));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final deadline = DateTime.now().add(const Duration(minutes: 3));
    while (result == null && DateTime.now().isBefore(deadline)) {
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.text('Échec du laboratoire — validation requise'),
        findsNothing,
      );
    }
    expect(result, isNotNull);
    expect(result!['delivered'], 1025);
    expect(result!['heartbeat_ticks'], greaterThan(0));
    expect((result!['ui_frame_build'] as Map)['samples'], greaterThan(0));
    expect(find.text('Scénario validé'), findsOneWidget);
    binding.reportData = {'mls_lab': result};
    await tester.pumpWidget(const SizedBox.shrink());
  }, timeout: const Timeout(Duration(minutes: 4)));
}
