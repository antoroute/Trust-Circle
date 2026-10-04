import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'lab_runner.dart';
import 'src/rust/frb_generated.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await RustLib.init();
  runApp(const LabApp());
}

class LabApp extends StatelessWidget {
  const LabApp({super.key, this.onReport});
  final ValueChanged<Map<String, Object>>? onReport;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CircleHaven — MLS Lab',
    theme: ThemeData(colorSchemeSeed: const Color(0xff20534e)),
    home: LabPage(onReport: onReport),
  );
}

class LabPage extends StatefulWidget {
  const LabPage({super.key, this.onReport});
  final ValueChanged<Map<String, Object>>? onReport;
  @override
  State<LabPage> createState() => _LabPageState();
}

class _LabPageState extends State<LabPage> {
  bool _running = false;
  String _status = 'Prêt';
  String? _report;
  Future<void> _run() async {
    if (_running) return;
    setState(() {
      _running = true;
      _report = null;
    });
    final buildTimes = <double>[], rasterTimes = <double>[];
    void timings(List<FrameTiming> frames) {
      for (final frame in frames) {
        buildTimes.add(frame.buildDuration.inMicroseconds / 1000);
        rasterTimes.add(frame.rasterDuration.inMicroseconds / 1000);
      }
    }

    SchedulerBinding.instance.addTimingsCallback(timings);
    try {
      final report = await runLab(
        onProgress: (text) {
          if (mounted) setState(() => _status = text);
        },
      );
      report['ui_frame_build'] = statistics(buildTimes);
      report['ui_frame_raster'] = statistics(rasterTimes);
      if (mounted) {
        setState(() {
          _status = 'Scénario validé';
          _report = const JsonEncoder.withIndent('  ').convert(report);
        });
      }
      widget.onReport?.call(report);
    } catch (_) {
      // No native exception details, storage paths or message data in logs/UI.
      if (mounted) {
        setState(() => _status = 'Échec du laboratoire — validation requise');
      }
    } finally {
      SchedulerBinding.instance.removeTimingsCallback(timings);
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('CircleHaven — MLS Lab')),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Prototype TC-301 · données synthétiques uniquement'),
          const SizedBox(height: 12),
          const Text(
            'Aucun compte et aucune connexion au serveur. Le stockage de ce laboratoire n’est pas chiffré. Ce n’est pas l’application de messagerie.',
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _running ? null : _run,
            child: const Text('Exécuter les vérifications'),
          ),
          const SizedBox(height: 16),
          Text(_status, key: const Key('lab-status')),
          if (_running)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          if (_report != null)
            Padding(
              padding: const EdgeInsets.only(top: 24),
              child: SelectableText(_report!),
            ),
        ],
      ),
    ),
  );
}
