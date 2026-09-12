import 'package:flutter_message_app/config/constants.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('base request headers contain public compatibility metadata only', () {
    expect(baseRequestHeaders(), <String, String>{
      'Content-Type': 'application/json',
      'X-Client-Version': clientVersion,
    });
    expect(baseRequestHeaders().containsKey('X-App-Secret'), isFalse);
  });

  group('public build configuration', () {
    test('accepts the exact HTTPS staging endpoint', () {
      expect(
        () => validatePublicAppConfiguration(
          environment: 'staging',
          baseUrl: 'https://trust-circle.kavalek.fr',
        ),
        returnsNormally,
      );
    });

    test('rejects a staging URL in a production build', () {
      expect(
        () => validatePublicAppConfiguration(
          environment: 'production',
          baseUrl: 'https://trust-circle.kavalek.fr',
        ),
        throwsA(
          isA<PublicAppConfigurationException>().having(
            (error) => error.reason,
            'reason',
            'staging_host_in_production',
          ),
        ),
      );
    });

    test('rejects HTTP except loopback development', () {
      expect(
        () => validatePublicAppConfiguration(
          environment: 'staging',
          baseUrl: 'http://trust-circle.kavalek.fr',
        ),
        throwsA(isA<PublicAppConfigurationException>()),
      );
      expect(
        () => validatePublicAppConfiguration(
          environment: 'development',
          baseUrl: 'http://127.0.0.1:18080',
        ),
        returnsNormally,
      );
    });

    test(
      'rejects paths, credentials, query strings and unknown environments',
      () {
        for (final baseUrl in <String>[
          'https://user@example.invalid',
          'https://example.invalid/api',
          'https://example.invalid/',
          'https://example.invalid?debug=true',
        ]) {
          expect(
            () => validatePublicAppConfiguration(
              environment: 'production',
              baseUrl: baseUrl,
            ),
            throwsA(isA<PublicAppConfigurationException>()),
          );
        }
        expect(
          () => validatePublicAppConfiguration(
            environment: 'preview',
            baseUrl: 'https://example.invalid',
          ),
          throwsA(isA<PublicAppConfigurationException>()),
        );
      },
    );
  });
}
