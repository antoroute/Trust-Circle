# TC-114 — Vérifier tout message avant utilisation du texte clair

Statut : Terminée — sécurité, builds et budgets Android/Windows validés
Priorité : P0 sécurité
Décision : mainteneur
Dépendances : TC-103

## Contexte et problème

Le chemin `decryptFast` retourne du texte clair sans vérification Ed25519. `ConversationProvider` peut afficher ce texte, l'insérer dans les caches et déclencher une notification avant la vérification complète en arrière-plan. Le chemin normal retourne lui aussi le texte avec un booléen de signature faux au lieu de rejeter.

Ce comportement viole les invariants 16 à 18 et permet à un contenu non authentifié d'atteindre l'utilisateur. Des journaux de debug peuvent en outre contenir un extrait de texte clair.

## Objectif mesurable

Garantir qu'aucun texte de message n'est affiché, notifié, indexé, journalisé ou persisté comme valide tant que l'enveloppe, l'identité de l'expéditeur, la signature et le tag AEAD n'ont pas tous été validés.

Conserver une expérience fluide : aucun aller-retour réseau supplémentaire sur le chemin nominal quand la clé publique validée est en cache, calcul hors thread UI et mesure de latence sur appareils cibles.

## Périmètre

- `MessageCipherV2.decrypt`, `decryptFast` et isolates cryptographiques.
- `ConversationProvider`, caches, stockage, notifications et logs associés.
- États UI transitoires et erreurs d'authenticité.
- Tests négatifs et benchmarks Android/Windows disponibles.

## Hors périmètre

- Concevoir le protocole V3 ou modifier silencieusement le format V2.
- Résoudre à lui seul la confiance initiale dans l'annuaire de clés (`TC-106`/`TC-303`).
- Chiffrer la base locale et corriger sa clé maître (`TC-306`).

## Critères d'acceptation

- [x] Une signature absente, invalide ou invérifiable bloque toute remise du texte à l'UI.
- [x] Un tag, un wrap, un destinataire, une version ou un contexte invalide est rejeté sans cache ni notification.
- [x] Les chemins temps réel, REST, cache mémoire et cache persistant appliquent la même barrière.
- [x] Aucun extrait de texte clair n'est écrit dans les logs, y compris en debug.
- [x] Une clé publique validée peut être mise en cache sans contourner la vérification par message.
- [x] Les calculs coûteux ne bloquent pas le thread UI.
- [x] La latence p50/p95 de réception et d'ouverture est mesurée sur Android et Windows ; l'objectif UX est documenté et accepté.
- [x] Les erreurs sont génériques côté utilisateur et détaillées sans secret dans la télémétrie locale autorisée.

## Tests et preuves attendues

- tests unitaires : signature altérée, mauvais expéditeur/appareil, mauvais tag, mauvais nonce, mauvais wrap, clé absente ;
- test d'intégration : événement Socket.IO forgé ne produit ni bulle, ni notification, ni entrée déchiffrée ;
- test de régression : message valide reçu depuis REST et Socket.IO ;
- instrumentation démontrant que l'événement d'affichage survient après succès de vérification ;
- benchmark avant/après sur Android et Windows.

## Risques, migration et rollback

Le correctif peut révéler des enveloppes historiques invalides auparavant tolérées. Elles doivent apparaître comme indisponibles/non authentifiables, jamais comme texte fiable. Garder la lecture du format V2, mais ne pas rétablir le chemin non vérifié en rollback ; corriger plutôt la performance ou la récupération de clé.

## Documentation à mettre à jour

- `docs/security/CRYPTOGRAPHY_V2.md`
- `docs/architecture/FUNCTIONAL_REFERENCE.md`
- `docs/architecture/TRACEABILITY.md`
- `docs/security/SECURITY_INVARIANTS.md` si une clarification est nécessaire

## Décisions humaines nécessaires

Valider le budget de latence p95 par plateforme et l'état UI très bref à montrer lorsque la vérification dépasse ce budget.

## Implémentation réalisée

- `MessageEnvelopeVerifier` valide format, contexte, destinataire, appareil actif/version et signature avant tout déchiffrement.
- Ed25519, X25519, HKDF et le pipeline d'ouverture sont placés dans l'isolate crypto avec priorité pour les messages visibles.
- `decryptVerified` est l'unique chemin de remise du texte ; `decrypt` et `decryptFast` sont des alias sûrs.
- Le cache exige un `VerifiedMessageEnvelope` impossible à construire hors du vérificateur et ne persiste une nouvelle `MK` qu'après succès du tag du contenu.
- Les chemins REST, Socket.IO et écran n'affichent/notifient qu'un résultat marqué vérifié ; un événement forgé est rejeté sans bulle.
- Les trois anciens services de déchiffrement non authentifié, inutilisés, ont été supprimés.
- Les logs contenant le texte envoyé, déchiffré ou le corps de notification ont été supprimés.
- L'encodage à l'envoi utilise désormais UTF-8, y compris accents et emoji.
- Un ping Socket.IO minimal ne pose plus de badge non authentifié : il récupère
  le message par REST, et tous les effets du chemin temps réel complet sont
  placés derrière `VerifiedMessageDelivery`.

## Validation exécutée

- suite Flutter complète : `45/45` tests réussis avec la configuration staging
  publique injectée ;
- `message_authentication_test.dart` : 13 tests cryptographiques réussis ;
- `verified_message_delivery_test.dart` démontre qu'une authentification qui
  échoue produit exactement zéro bulle, écriture cache ou notification ;
- Cas couverts : valide, vérification concurrente d'un même message, signature absente/altérée, contexte, destinataire, algorithme, appareil/version, wrap, nonce, sel HKDF et tag de contenu altérés.
- `flutter analyze --no-pub` : aucune erreur de compilation ; 89 informations/avertissements non bloquants, dont l'asset `.env` volontairement absent du dépôt.
- Recherche statique : aucun log de `plaintext`, `decryptedText`, `messageText` ou corps tronqué dans les chemins concernés.
- build Windows profile et APK Android profile réussis avec Flutter 3.47.4 ;
- application Android installée et lancée sur Android 16 émulé, activité au
  premier plan et aucune exception fatale ;
- 50 ouvertures complètes puis 50 ouvertures cache : Android, total médiane/p95
  `14/34 ms` à froid et `6/10 ms` en cache ; Windows, `3/4 ms` et `1/3 ms` ;
- TLS système validé sur les deux plateformes contre le staging, réponse
  attendue `404` sur la route racine ;
- suite Flutter complète rejouée sous Windows : `45/45` ;
- `flutter analyze --no-pub` : aucune erreur de compilation, informations de
  lint non bloquantes ;
- `git diff --check` : attendu avant commit final.

## Conclusion

Les budgets acceptés sont respectés sur les deux plateformes disponibles sans
ajouter d'aller-retour réseau au chemin nominal. La validation iOS/macOS reste
rattachée aux tâches de plateforme, faute de matériel Apple disponible, et ne
rouvre pas la porte de sortie de Phase 1.
