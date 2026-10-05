import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import 'lab_runner.dart';
import 'measurements.dart';
import 'src/rust/frb_generated.dart';

Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();
  // Standalone Windows bundle check; no Flutter driver or backend required.
  // Numerical result only, no report paths or private data accepted via CLI.
  if (args.length == 1 && args.single == '--lab-self-test') {
    try {
      await RustLib.init();
      final result = await runLab();
      exit(
        result['delivered'] == 1025 && result['lifecycle_checks'] == 62 ? 0 : 1,
      );
    } catch (_) {
      exit(1);
    }
  }
  await RustLib.init();
  runApp(const LabApp());
}

class LabApp extends StatelessWidget {
  const LabApp({
    super.key,
    this.onReport,
    this.measurementPlan = MeasurementPlan.standard,
  });
  final ValueChanged<Map<String, Object>>? onReport;
  final MeasurementPlan measurementPlan;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CircleHaven — MLS Lab',
    theme: ThemeData(colorSchemeSeed: const Color(0xff20534e)),
    home: LabPage(onReport: onReport, measurementPlan: measurementPlan),
  );
}

class LabPage extends StatefulWidget {
  const LabPage({super.key, this.onReport, required this.measurementPlan});
  final ValueChanged<Map<String, Object>>? onReport;
  final MeasurementPlan measurementPlan;
  @override
  State<LabPage> createState() => _LabPageState();
}

class _LabPageState extends State<LabPage> {
  bool _running = false;
  String _status = 'Prêt';
  String? _report;
  Future<void> _run({bool measure = false}) async {
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
      void progress(String text) {
        if (mounted) setState(() => _status = text);
      }

      final report = measure
          ? await runMeasurements(
              plan: widget.measurementPlan,
              onProgress: progress,
            )
          : await runLab(onProgress: progress);
      report['source_commit'] = labSourceCommit;
      report['ui_frame_build'] = statistics(buildTimes);
      report['ui_frame_raster'] = statistics(rasterTimes);
      if (mounted) {
        setState(() {
          _status = measure
              ? 'Mesures terminées — budgets non validés'
              : 'Scénario validé';
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
          OutlinedButton(
            key: const Key('lab-measure'),
            onPressed: _running ? null : () => _run(measure: true),
            child: Text('Mesurer (${widget.measurementPlan.sessions} séries)'),
          ),
          const Text(
            'Les mesures répètent des écritures durables et peuvent prendre plusieurs minutes. Ce n’est pas le temps de connexion.',
          ),
          Text(_status, key: const Key('lab-status')),
          if (_running)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          if (_report != null)
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: _report!));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rapport synthétique copié')),
                  );
                }
              },
              child: const Text('Copier le rapport JSON'),
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
