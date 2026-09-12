import 'dart:async';

/// Barrière structurelle entre l'authentification d'un message et ses effets.
///
/// Le callback [deliver] est inatteignable si [authenticate] échoue. Les
/// chemins réseau utilisent cette barrière pour regrouper bulle, cache,
/// persistance et notification après la vérification cryptographique.
class VerifiedMessageDelivery {
  const VerifiedMessageDelivery._();

  static Future<void> authenticateThenDeliver<T>({
    required Future<T> Function() authenticate,
    required FutureOr<void> Function(T verified) deliver,
  }) async {
    final verified = await authenticate();
    await deliver(verified);
  }
}
