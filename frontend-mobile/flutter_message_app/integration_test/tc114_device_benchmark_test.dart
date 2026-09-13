import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_message_app/core/crypto/crypto_isolate_service.dart';
import 'package:flutter_message_app/core/crypto/key_manager_final.dart';
import 'package:flutter_message_app/core/crypto/message_cipher_v2.dart';
import 'package:flutter_message_app/core/providers/auth_provider.dart';
import 'package:flutter_message_app/core/services/api_service.dart';
import 'package:flutter_message_app/core/services/key_directory_service.dart';
import 'package:flutter_message_app/core/services/message_key_cache.dart';
import 'package:flutter_message_app/core/services/performance_benchmark.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const groupId = 'tc114-benchmark-group';
  const conversationId = 'tc114-benchmark-conversation';
  const senderUserId = 'tc114-sender';
  const senderDeviceId = 'tc114-sender-device';
  const recipientUserId = 'tc114-recipient';
  const recipientDeviceId = 'tc114-recipient-device';
  const sampleCount = 50;

  tearDownAll(() async {
    MessageKeyCache.instance.clear();
    PerformanceBenchmark.instance.clear();
    await CryptoIsolateService.instance.dispose();
  });

  testWidgets('staging TLS and verify-before-use latency', (tester) async {
    final httpClient =
        HttpClient()..connectionTimeout = const Duration(seconds: 10);
    final request = await httpClient.getUrl(
      Uri.parse('https://trust-circle.kavalek.fr/'),
    );
    final response = await request.close().timeout(const Duration(seconds: 10));
    await response.drain<void>();
    httpClient.close(force: true);
    expect(response.statusCode, inInclusiveRange(100, 599));

    await KeyManagerFinal.instance.ensureKeysFor(groupId, senderDeviceId);
    await KeyManagerFinal.instance.ensureKeysFor(groupId, recipientDeviceId);
    final senderKeys = await KeyManagerFinal.instance.publicKeysBase64(
      groupId,
      senderDeviceId,
    );
    final recipientKeys = await KeyManagerFinal.instance.publicKeysBase64(
      groupId,
      recipientDeviceId,
    );
    final senderEntry = GroupDeviceKeyEntry(
      userId: senderUserId,
      deviceId: senderDeviceId,
      pkSigB64: senderKeys['pk_sig']!,
      pkKemB64: senderKeys['pk_kem']!,
      keyVersion: 1,
      status: 'active',
      fingerprintSig: '',
      fingerprintKem: '',
    );
    final recipientEntry = GroupDeviceKeyEntry(
      userId: recipientUserId,
      deviceId: recipientDeviceId,
      pkSigB64: recipientKeys['pk_sig']!,
      pkKemB64: recipientKeys['pk_kem']!,
      keyVersion: 1,
      status: 'active',
      fingerprintSig: '',
      fingerprintKem: '',
    );
    final directory = _BenchmarkKeyDirectory(senderEntry);
    final envelopes = <Map<String, dynamic>>[];
    for (var index = 0; index < sampleCount; index++) {
      envelopes.add(
        await MessageCipherV2.encrypt(
          groupId: groupId,
          convId: conversationId,
          senderUserId: senderUserId,
          senderDeviceId: senderDeviceId,
          recipientsDevices: [recipientEntry],
          plaintext: Uint8List.fromList(
            utf8.encode('Message vérifié 🔐 $index'),
          ),
        ),
      );
    }

    MessageKeyCache.instance.clear();
    PerformanceBenchmark.instance.clear();
    for (var index = 0; index < sampleCount; index++) {
      final opened = await MessageCipherV2.decryptVerified(
        groupId: groupId,
        expectedConversationId: conversationId,
        myUserId: recipientUserId,
        myDeviceId: recipientDeviceId,
        messageV2: envelopes[index],
        keyDirectory: directory,
        priority: 10,
      );
      expect(opened['signatureValid'], isTrue);
      expect(
        utf8.decode(opened['decryptedText'] as List<int>),
        'Message vérifié 🔐 $index',
      );
    }
    final cold = _selectedStats();
    expect(cold['message_receive_verified_total']!['count'], sampleCount);
    expect(cold['message_decrypt_verified_pipeline']!['count'], sampleCount);
    if (!kDebugMode) {
      expect(
        cold['message_receive_verified_total']!['p95_ms'],
        lessThanOrEqualTo(250),
      );
    }

    PerformanceBenchmark.instance.clear();
    for (var index = 0; index < sampleCount; index++) {
      final opened = await MessageCipherV2.decryptVerified(
        groupId: groupId,
        expectedConversationId: conversationId,
        myUserId: recipientUserId,
        myDeviceId: recipientDeviceId,
        messageV2: envelopes[index],
        keyDirectory: directory,
        priority: 10,
      );
      expect(opened['signatureValid'], isTrue);
    }
    final cached = _selectedStats();
    expect(cached['message_receive_verified_total']!['count'], sampleCount);
    expect(cached['message_decrypt_verified_cached']!['count'], sampleCount);
    if (!kDebugMode) {
      expect(
        cached['message_receive_verified_total']!['p95_ms'],
        lessThanOrEqualTo(100),
      );
    }

    // One machine-readable line, with no identifier, key, envelope or content.
    // ignore: avoid_print
    print(
      'TC114_RESULT ${jsonEncode({'platform': Platform.operatingSystem, 'os_version': Platform.operatingSystemVersion, 'mode': kProfileMode ? 'profile' : (kReleaseMode ? 'release' : 'debug'), 'samples': sampleCount, 'tls_status': response.statusCode, 'cold': _compact(cold), 'cached': _compact(cached)})}',
    );
  });
}

Map<String, Map<String, dynamic>> _compact(
  Map<String, Map<String, dynamic>> stats,
) => {
  for (final entry in stats.entries)
    entry.key: {
      'count': entry.value['count'],
      'median_ms': entry.value['median_ms'],
      'p95_ms': entry.value['p95_ms'],
    },
};

Map<String, Map<String, dynamic>> _selectedStats() {
  const names = <String>[
    'message_signature_verify',
    'message_decrypt_verified_pipeline',
    'message_decrypt_verified_cached',
    'message_receive_verified_total',
  ];
  return {
    for (final name in names)
      if (PerformanceBenchmark.instance.getStats(name)['count'] != 0)
        name: Map<String, dynamic>.from(
          PerformanceBenchmark.instance.getStats(name),
        ),
  };
}

class _BenchmarkKeyDirectory extends KeyDirectoryService {
  _BenchmarkKeyDirectory(this.sender) : super(ApiService(AuthProvider()));

  final GroupDeviceKeyEntry sender;

  @override
  Future<List<GroupDeviceKeyEntry>> getGroupDevices(String groupId) async => [
    sender,
  ];
}
