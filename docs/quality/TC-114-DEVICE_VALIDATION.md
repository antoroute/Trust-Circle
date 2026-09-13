# Validation appareils — TC-114

Statut : validée sur Android émulé et Windows physique
Dernière mise à jour : 2026-09-13

## Objectif

Vérifier que la barrière `verify-before-use` reste imperceptible sur les plateformes disponibles. Cette procédure n'utilise ni secret partagé dans un rapport, ni contenu réel : employer des comptes et messages de test.

Budget proposé à valider par le mainteneur :

- clé de message déjà en cache : p95 de `message_receive_verified_total` inférieur ou égal à 100 ms ;
- nouvelle clé de message, annuaire déjà local : p95 inférieur ou égal à 250 ms ;
- aucune image figée, frappe bloquée ou bulle contenant du texte avant la fin de la mesure ;
- aucun appel réseau supplémentaire quand `KeyDirectoryService` possède déjà le cercle en cache.

Le premier accès à un cercle sans annuaire local est mesuré séparément : il inclut le réseau et ne doit pas être confondu avec le coût cryptographique.

## Jeu de test reproductible

Le runner `integration_test/tc114_device_benchmark_test.dart` valide TLS, crée
localement 50 enveloppes V2 avec accents et emoji, puis exerce 50 ouvertures
complètes et 50 réouvertures depuis le cache. Il passe par le vrai
`decryptVerified`, le vrai isolate et les primitives
Ed25519/X25519/HKDF/AES-GCM. Son résultat ne contient ni clé, ni enveloppe, ni
identifiant réel, ni texte.

Le benchmark de performance est exécuté en mode `profile`. Le mode `debug`
reste utile pour la correction fonctionnelle, mais son exécution Dart non
optimisée ne représente pas une application distribuée.

## Android

Depuis `frontend-mobile/flutter_message_app`, avec l'appareil visible par `flutter devices` :

```bash
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/tc114_device_benchmark_test.dart \
  -d <identifiant-android> --profile \
  --dart-define=TC_ENVIRONMENT=staging \
  --dart-define=TC_API_BASE_URL=https://trust-circle.kavalek.fr
```

## Windows 11

Dans PowerShell, depuis le même dossier :

```powershell
flutter drive `
  --driver=test_driver/integration_test.dart `
  --target=integration_test/tc114_device_benchmark_test.dart `
  -d windows --profile `
  --dart-define=TC_ENVIRONMENT=staging `
  --dart-define=TC_API_BASE_URL=https://trust-circle.kavalek.fr
```

## Résultats acceptés le 2026-09-13

Chaque cellule est `médiane / p95` en millisecondes, sur 50 mesures. Le statut
HTTP `404` de `/` est attendu : il démontre que TLS et le serveur répondent.

| Plateforme | Signature | Pipeline nouvelle clé | Déchiffrement cache | Total nouvelle clé | Total cache | TLS |
|---|---:|---:|---:|---:|---:|---:|
| Android 16, émulateur Pixel 7 x86_64, profile | 6 / 14 | 5 / 14 | 0 / 0 | 14 / 34 | 6 / 10 | valide, HTTP 404 |
| Windows 11 Home 25H2 x64, Core i5-12600, profile | 2 / 3 | 1 / 1 | 0 / 0 | 3 / 4 | 1 / 3 | valide, HTTP 404 |

Les deux budgets sont respectés avec une marge importante. Le démarrage du
harness Android émulé a signalé des images sautées avant le benchmark ; aucune
exception fatale ni dépassement n'a été observé pendant les séries. L'app
Android installée séparément est restée active, activité principale au premier
plan.

## Vérifications de sécurité manuelles

- aucun texte de message n'apparaît dans les logs Flutter ;
- un message valide affiche directement son texte avec `signatureValid == true` ;
- une enveloppe altérée par le test automatisé ne crée ni bulle, ni notification, ni cache de texte ;
- après fermeture/réouverture, une clé persistante n'est utilisée qu'après une nouvelle vérification Ed25519 de l'enveloppe.

## Preuve à reporter lors d'une nouvelle plateforme

Pour chaque plateforme : version OS, type d'appareil/CPU, nombre de mesures, médiane et p95 des quatre opérations, résultat UX et anomalies. Ne fournir aucune donnée utilisateur, aucun identifiant réel et aucun extrait de message.
