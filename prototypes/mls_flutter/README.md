# TC-301 — laboratoire Flutter / Rust

Application **séparée de la messagerie**, sans compte et sans appel backend.
Identifiant `fr.kavalek.circlehaven.lab.mls_flutter` (variante camelCase Apple).
Uniquement des identités/messages synthétiques. Les bases SQLite temporaires
ne sont **pas chiffrées**. Ne pas y introduire de données réelles.

## Architecture et bornes

- Flutter appelle des fonctions Rust asynchrones générées par
  `flutter_rust_bridge 2.13.0`. Aucune primitive cryptographique n'est réécrite.
- Un thread Rust durable possède les trois appareils simulés et leurs bases.
  Sa file contient au plus 8 commandes en attente, plus une en cours. Une file
  pleine refuse immédiatement la commande (`busy`), sans attente bloquante.
- `AdmissionGate` borne aussi les appels du scénario côté Dart à 8. Ce n'est
  pas une limite de mémoire universelle du décodeur FFI : un appelant qui
  contourne cette façade ou appelle `ping` directement n'a pas la même borne.
- Les objets de groupe ne survivent pas à une transaction annulée. Les
  réponses arrivent après persistance. Les clés et le contenu des messages
  ne traversent pas cette API de démonstration : seuls résultats et durées
  agrégées reviennent. `ping` copie 1 Kio puis renvoie sa longueur, pas ses octets.
- Chaque session a un identifiant non réutilisé et un répertoire temporaire
  propre. La fermeture attend les commandes antérieures, ferme SQLite puis
  supprime ce répertoire. Une erreur de scénario invalide la session entière :
  les appareils simulés ne partagent pas une transaction distribuée.
- Abandonner un Future Dart n'annule **pas** une opération déjà acceptée.
  Un arrêt brutal de l'app peut laisser des fichiers synthétiques temporaires.
  Ceci ne définit pas la future politique d'effacement/récupération produit.
- 100 messages maximum par commande ; lot reçu ≤1 Mio ; texte ≤16 Kio/message ;
  5 000 messages envoyés et 10 000 opérations maximum par session de lab.
  Les Commits restent séparés des lots applicatifs, avec ordre d'époque strict.

Le scénario : groupe de deux appareils, 30 appels de pont, 20 échanges unitaires,
5 comparaisons de 100 réceptions unitaires / 100 en lot, ajout du troisième,
renouvellement, retrait et rejet d'un message futur par l'appareil retiré.
Résultat attendu : **1 025 réceptions et 62 contrôles**, puis nettoyage.

## Exécution reproductible

Flutter **3.47.4** (Dart 3.13.3), Rust **1.99.0**, outils natifs de la plateforme.
La CI vérifie le commit Flutter `9584c6713b324636289d067944a46fd6b49df14b`.
Android API minimum 28 et NDK `28.2.13676358` ; iOS minimum 15 ; lab macOS 14 ARM.
Les lockfiles Dart et Rust sont versionnés. L'app existante garde son propre SDK.

```bash
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test integration_test test_driver hook
flutter analyze
cargo fmt --manifest-path rust/Cargo.toml --check
cargo clippy --manifest-path rust/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml --locked
flutter test --reporter expanded
```

Le hook officiel Native Assets compile Rust en **release**, avec `--locked`.
Le test hôte charge explicitement la bibliothèque produite dans
`build/native_assets/<os>` car le tester n'est pas un paquet applicatif.
L'app et les tests d'intégration utilisent le chargeur standard de FRB : leur
réussite est indispensable pour valider le paquet, indépendamment du test hôte.

Sur Windows (terminal avec Flutter, Rust/MSVC et Visual Studio configurés) :

```powershell
flutter run --profile -d windows
flutter drive --profile -d windows --driver test_driver/integration_test.dart --target integration_test/lab_test.dart
```

Sur un Android connecté, récupérer son identifiant avec `flutter devices`, puis :

```bash
flutter drive --profile -d IDENTIFIANT_ANDROID --driver test_driver/integration_test.dart --target integration_test/lab_test.dart
```

Sur Mac, remplacer la cible par `macos`. Sur simulateur iOS, utiliser son UUID
et `--debug` (pas de profile/release sur simulateur). La CI Android utilise
aussi debug pour sa preuve fonctionnelle, pas pour valider les budgets produit.
La signature Android release reste celle de **debug**, exclusivement pour ce
lab : aucun artefact n'est prêt pour un store. Ne pas réouvrir de SSH pour lancer
ces commandes sans nouvel accord du propriétaire.

## Rapports, mesures et limites

Le bouton affiche le rapport JSON. Le test d'intégration actionne réellement
ce bouton et recueille les temps des frames Flutter pendant le travail Rust,
puis écrit `reports/flutter-ui.json`. Il vérifie le rendu de frames, pas un
budget de fluidité physique. Le test hôte ne prouve pas un rendu graphique ;
`TC_MLS_REPORT_DIR=reports flutter test` exporte `flutter-host.json`.

Les mesures séparent pont seul, réception native, aller-retour envoi+réception,
attente de file et 100 transactions contre une. La minuterie Dart à 16 ms
observe l'event loop ; elle ne remplace pas les frames. Le RSS échantillonné
inclut Flutter, les trois clients et les outils de test : ce n'est ni la mémoire
par appareil ni un profil d'allocation précis. 5 lots donnent un p95 exploratoire,
insuffisant pour une garantie. Pas de réseau, SQLCipher, batterie ou baseline V2.
Contrôler le support du dossier temporaire : `/tmp` peut être en RAM. Sous Linux,
définir `TMPDIR` vers un répertoire privé sur disque pour mesurer les écritures.

## Dépendances, génération et sécurité

FRB et son générateur sont MIT ; les règles MPL du moteur sont détaillées dans
[`../mls/SUPPLY_CHAIN.md`](../mls/SUPPLY_CHAIN.md). Le lockfile initial du template
contenait d'anciennes versions ; celui du laboratoire a été résolu à nouveau,
notamment Tokio 1.53.2 et futures 0.3.34, puis audité. Aucun ignore RustSec.
L'avis `RUSTSEC-2026-0173` reste : `proc-macro-error2 2.0.1` non maintenu, compilé
via hax/libcrux-sha3 même avec RustCrypto. `allo-isolate 0.1.27` n'a pas de champ
licence Cargo ; `cargo deny` reconnaît son fichier de licence Apache-2.0, avec avertissement.

```bash
cargo audit --file rust/Cargo.lock
cargo deny --manifest-path rust/Cargo.toml --locked --config ../mls/deny.toml check licenses sources
cargo metadata --manifest-path rust/Cargo.toml --locked --format-version 1 | node ../mls/scripts/check-features.mjs
cargo cyclonedx --manifest-path rust/Cargo.toml --format json --target all --override-filename bridge.cdx
```

Ce SBOM couvre Rust, **pas l'ensemble du paquet Flutter/OS**. Notices et sources
MPL devront accompagner une distribution. Le graphe Dart est verrouillé, mais la
revue de publication complète reste à faire ; pas de revendication « zéro risque ».

Pour régénérer uniquement les bindings après changement d'API :

```bash
cargo install flutter_rust_bridge_codegen --version 2.13.0 --locked
flutter_rust_bridge_codegen generate
```

Le lockfile **amont du générateur** utilise futures-util 0.3.29 retiré du registre
(yanked) : avertissement distinct du runtime de l'app. Le générateur installe
également cargo-expand si absent. Réexaminer ces outils avant CI de génération
ou distribution ; ne pas les confondre avec le lockfile applicatif audité.
Les bindings générés contiennent de l'unsafe FFI ; le moteur, l'acteur et l'API
écrite à la main interdisent l'unsafe. Ne pas éditer les bindings manuellement.

Sources d'intégration : [Native Assets](https://cjycode.com/flutter_rust_bridge/manual/integrate/native-assets),
[Rust asynchrone](https://cjycode.com/flutter_rust_bridge/guides/concurrency/async-rust).
Ce lot ne prouve ni la transparence des clés, ni le chiffrement local produit,
ni la détection d'une restauration malveillante de base complète. TC-301 reste ouverte.
