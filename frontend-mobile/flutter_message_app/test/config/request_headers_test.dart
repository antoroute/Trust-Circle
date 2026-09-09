import 'package:flutter_message_app/config/constants.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('base request headers contain public compatibility metadata only', () {
    expect(
      baseRequestHeaders(),
      <String, String>{
        'Content-Type': 'application/json',
        'X-Client-Version': clientVersion,
      },
    );
    expect(baseRequestHeaders().containsKey('X-App-Secret'), isFalse);
  });
}
