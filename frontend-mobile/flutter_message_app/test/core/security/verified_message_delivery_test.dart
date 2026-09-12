import 'package:flutter_message_app/core/crypto/message_envelope_verifier.dart';
import 'package:flutter_message_app/core/security/verified_message_delivery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a forged event cannot trigger any delivery effect', () async {
    var bubbles = 0;
    var cacheWrites = 0;
    var notifications = 0;

    await expectLater(
      VerifiedMessageDelivery.authenticateThenDeliver<String>(
        authenticate:
            () async =>
                throw const MessageAuthenticationException('invalid_signature'),
        deliver: (verifiedText) {
          bubbles++;
          cacheWrites++;
          notifications++;
        },
      ),
      throwsA(isA<MessageAuthenticationException>()),
    );

    expect(bubbles, 0);
    expect(cacheWrites, 0);
    expect(notifications, 0);
  });

  test('a verified result is delivered exactly once', () async {
    var deliveries = 0;

    await VerifiedMessageDelivery.authenticateThenDeliver<String>(
      authenticate: () async => 'verified',
      deliver: (verifiedText) {
        expect(verifiedText, 'verified');
        deliveries++;
      },
    );

    expect(deliveries, 1);
  });
}
