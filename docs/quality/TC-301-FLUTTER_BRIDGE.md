# TC-301 — lot B, pont Flutter et réception atomique en lot

Date : 2026-10-04. **En cours, pas de clôture TC-301.**
Branche `tc301-mls-prototype`, première implémentation `67fef4a`.
Pont et scénario graphique multiplateforme validés en CI sur `b66f188`.
Ni application de messagerie existante ni backend staging modifiés.
Aucun accès au PC du propriétaire ni changement du service SSH.

## Résultat technique

Le [laboratoire Flutter](../../prototypes/mls_flutter/README.md) décrit les
API, le thread de traitement, la file bornée, les refus, le nettoyage et les
commandes de reproduction. Il utilise le moteur du lot A, sans nouvelle
primitive cryptographique et sans importer des comptes ou conversations V2.

Le thread Rust possède les connexions SQLite des appareils synthétiques.
La file native accepte 8 commandes en attente + 1 exécutée ; le scénario Dart
borne ses appels avant le pont. Les traitements CPU/SQL sont hors de l'UI.
Un Future abandonné ne revient pas sur une écriture déjà acceptée.
Une erreur de scénario ferme la session de lab : elle ne prétend pas fournir
une synchronisation distribuée entre appareils.

`receive_batch` authentifie et persiste jusqu'à 100 messages privés dans une
transaction unique. Toute altération, duplication, erreur SQL ou présence de
Commit annule tout le lot, état MLS et inbox compris. Les contrôles de groupe
restent séparés et ordonnés ; les bornes d'entrée ne sont pas relevées.

## Validations locales exécutées

- Moteur : **19 tests par fournisseur**, RustCrypto et libcrux. Le test de crash
  regroupe désormais **20 sorties brutales** avant/après commit sur 10 chemins,
  dont la réception en lot. Cela ne simule pas un disque défaillant ni une
  restauration malveillante de snapshot.
- Interop mls-rs : création/Welcome dans les deux directions, échanges,
  renouvellements, Welcome altéré rejeté, rejeu rejeté. Pas une couverture
  exhaustive de toutes les extensions et suites MLS.
- Vecteurs publics épinglés : RefHash et séparation de labels ajoutés aux
  formats/signatures existants. Le corpus RFC complet reste ouvert.
- Acteur Rust : **3 tests**, cycle/révocation/nettoyage, saturation/refus de file,
  invalidation d'une session en échec et reprise par une nouvelle session.
- Flutter hôte : **15 tests**, dont 13 de configuration NDK (ABI, API,
  chemins Windows/Linux, refus d'entrées non supportées), admission bornée et scénario complet FFI avec
  **1 025 réceptions, 62 contrôles**, puis nettoyage des bases temporaires.
- Formatage, Flutter analyze et Clippy avec avertissements refusés : réussis.
- Audit Rust : aucune vulnérabilité connue signalée ; avis de maintenance
  `RUSTSEC-2026-0173` conservé. Licences/sources : passent, avertissement de champ
  licence manquant pour allo-isolate (fichier Apache-2.0 reconnu). Aucun ignore ajouté.

Le premier test Flutter a exposé un problème du chargeur dans le **tester non
empaqueté** : le hook produisait bien la bibliothèque, mais le chargeur standard
cherchait `rust/target/release`. Le test hôte charge maintenant l'artefact précis
`build/native_assets/<os>`. Les applications gardent le chargeur standard ;
seul leur test d'intégration peut valider ce deuxième chemin.

## Mesures locales exploratoires

Linux x86_64, hôte partagé du lot A, Flutter 3.47.4/Dart 3.13.3 en mode test
debug, Rust release, RustCrypto, SQLite FULL sur ext4 via TMPDIR dédié.
Trois appareils synthétiques dans le processus, messages 1 Kio, aucun réseau.
Preuve : [agrégats](evidence/TC-301-flutter-linux.json).

| Mesure | Échantillons | Médiane | p95 |
|---|---:|---:|---:|
| Pont 1 Kio seul | 30 | 0,055 ms | 0,112 ms |
| Envoi + réception persistés, aller-retour Dart | 20 | 11,99 ms | 12,11 ms |
| Réception native unitaire | 20 | 5,95 ms | 6,08 ms |
| 100 réceptions, 100 transactions | 5 | 602,02 ms | 805,96 ms |
| 100 réceptions, 1 transaction atomique | 5 | 11,95 ms | 11,96 ms |

Le gain observé porte sur les réceptions et leurs écritures, **pas** sur l'envoi
de 100 messages, le réseau ou l'affichage de 100 bulles. Les envois restent
persistés individuellement et ne sont pas compris dans ces deux dernières lignes.
L'API accepte de 1 à 100 messages déjà disponibles ; ce mécanisme n'impose pas
d'attendre que 100 messages arrivent pour commencer une réception.
Le scénario complet dure 10,02 s car il répète volontairement 1 025 réceptions,
dont 500 écritures unitaires pour comparaison ; ce n'est pas le temps de connexion.

La minuterie Dart à 16 ms a continué pendant le scénario (626 déclenchements,
intervalle p95 16,06 ms). **Ce n'est pas une preuve de rendu UI fluide**.
Le RSS maximum échantillonné (~138 Mio) inclut Flutter et tous les appareils du
lab ; ce n'est pas la mémoire d'un seul client produit. Ces petits échantillons
sur un serveur ne remplacent pas les budgets p95 sur Android/Windows physiques.

## CI et portes non franchies

Workflow `.github/workflows/mls-flutter.yml` : tests hôtes Linux/Windows/macOS,
scénario réellement déclenché par le bouton sous Windows/macOS et sous
émulateur Android/simulateur iOS, puis audit/licences/SBOM Rust. Les métriques de
frames et les rapports JSON sont séparés des tests hôtes sans fenêtre.

Historique des corrections, sans confondre jobs réussis et matrice verte :

- Première passe `37194044743` : `cargo --manifest-path` ne sélectionnait pas
  le toolchain du sous-dossier Rust. Ajout du fichier 1.99.0 au dossier Flutter.
- [37194481939](https://github.com/antoroute/Trust-Circle/actions/runs/37194481939) :
  Linux et audit réussis ; Windows a exécuté le scénario graphique en profile.
  Le test hôte Mac a réussi, mais le paquet universel demandait la cible Rust
  Intel absente. iOS échouait sur les quatre symboles dyld de backtrace/libc.
  Android ne trouvait pas l'AVD créé dans un autre répertoire.
- [37194909315](https://github.com/antoroute/Trust-Circle/actions/runs/37194909315) :
  relance **Android seule** sur `e7b948e`, succès du scénario graphique sur
  Pixel 6 virtuel API 35 x86_64. Les cinq autres jobs sont ignorés volontairement,
  pas des preuves de succès multiplateforme sur ce commit.
- `b66f188` ajoute la cible Mac Intel, verrouille temporairement libc 0.2.189
  pour la compatibilité iOS et corrige l'API NDK 35 codée en dur par le hook
  amont. L'adaptateur respecte désormais le minimum fourni par Flutter.
  `cargo check -p backtrace` passe localement pour iOS appareil/simulateur ;
  cela ne remplace pas la liaison et l'exécution avec Xcode.

La matrice du moteur natif, indépendante du pont, est **entièrement verte** :
[37194481919](https://github.com/antoroute/Trust-Circle/actions/runs/37194481919),
six jobs sur six, commit `34879cc`, 19 tests par fournisseur / 20 cas de crash.
Les sources du moteur n'ont pas changé depuis ce commit.

La matrice Flutter complète sur les corrections `b66f188` est **terminée avec
succès, six jobs sur six** :
[37211775266](https://github.com/antoroute/Trust-Circle/actions/runs/37211775266).
Les tests hôtes Linux/Windows/macOS passent (3 tests acteur Rust et 15 Dart/FFI
par hôte). Les scénarios graphiques réussissent sur Windows et macOS en profile,
Pixel virtuel Android API 35 en debug et iPhone 16 Pro simulé en debug.
Chaque rapport confirme 1 025 réceptions et 62 contrôles, avec frames rendues.
La CI fournit aussi audit, licences, politique de features et SBOM Rust.

Les premiers rapports graphiques conservés dans les artefacts des runs ci-dessus
illustrent pourquoi on ne coche pas encore les budgets produit : Windows
profile donne un aller-retour unitaire p95 de 64,23 ms, alors qu'Android debug
émulé donne 308,15 ms et des frames de raster p95 à 207,66 ms. L'absence de
blocage du scénario n'est donc pas une promesse de fluidité. Les modes, machines,
stockages et charges diffèrent, et le pilote `pump` l'interface par intervalles
de 100 ms. Ces mesures exploratoires ne classent pas les OS et ne valident pas
le S23 ; elles motivent le protocole de mesures à froid/chaud du lot C.

Rapports de la passe `b66f188`, conservés dans
[les agrégats CI](evidence/TC-301-ci-flutter.json) avec leur provenance et SHA-256 :

| Scénario graphique | Pont 1 Kio p95 | Envoi + réception p95 | 100 réceptions / transaction unique p95 |
|---|---:|---:|---:|
| Windows Server 2025, profile | 0,10 ms | **253,60 ms** | 142,42 ms |
| macOS 15 ARM, profile | 0,14 ms | 8,95 ms | 10,97 ms |
| Pixel 6 virtuel API 35 x86_64, debug | 44,17 ms | 55,71 ms | 46,49 ms |
| iPhone 16 Pro simulé ARM, debug | 0,29 ms | 10,32 ms | 13,35 ms |

Windows dépasse ici le repère de 100 ms : **budgets non acceptés**. Sa réception
native/transaction monte à 221,08 ms p95, contre 0,013 ms pour l'attente de file ;
le coût n'est pas expliqué par le pont seul. Isoler CPU, stockage et charge de
l'hôte lors des prochaines mesures ; ne pas attribuer une cause unique sans
profilage. Android conserve des pointes de raster (p95 229,06 ms) malgré les
meilleurs temps de message de cette passe. Aucun de ces chiffres ne prouve une
régression causée par le correctif : runners et charges ne sont pas contrôlés.

Toujours manquants : budgets profile/release V2/V3 sur les mêmes appareils,
énergie/veille, iPhone/Mac physiques, taille du paquet final et SBOM complet
Flutter/OS. Windows Server en CI n'est pas le Windows 11 du propriétaire.
Le choix définitif de fournisseur et l'activation dans le produit restent ouverts.
Le minimum Android 28 est déclaré et transmis au compilateur ; son exécution
reste à vérifier sur un système API 28, distinct de l'émulateur API 35 utilisé.
Le contournement libc et l'adaptateur NDK doivent être suivis et retirés après
correction amont compatible et réexécution des plateformes, pas oubliés.

Le graphe du pont compile hax/libcrux-sha3 même avec RustCrypto ; l'avis de
maintenance doit donc être suivi pour ce binaire aussi. Le générateur FRB
verrouillé possède un vieux futures-util yanked ; il n'est pas dans le runtime
verrouillé de l'app. Détails et obligations dans le README et SUPPLY_CHAIN.

## Suite et décisions

Prochaine sous-tâche : **TC-301 lot C**, artefacts faciles à tester et mesures
reproductibles à froid/chaud, puis comparaison V2/V3 et preuves physiques.
La preuve fonctionnelle du pont sur quatre OS est obtenue ; elle ne clôture
pas les critères globaux de performance, vecteurs complets, anti-rollback et
choix définitif du fournisseur. Aucune nouvelle décision produit n'est
nécessaire pour préparer ces essais. L'absence de matériel Apple limite les
preuves énergétiques, pas la poursuite du travail local ou en simulateur.
Le propriétaire précise disposer d'un Samsung S23, mais préfère d'abord les
émulateurs Pixel d'Android Studio sur son PC Windows. Cette préférence est
retenue pour le prochain essai utilisateur ; aucune réouverture SSH implicite.
La [procédure locale Windows/Pixel](TC-301-LOCAL_VALIDATION.md) prépare ces
essais sans prétendre qu'ils ont été réalisés. Le profilage physique reste séparé.
Ne pas passer à TC-302 sur la base d'une clôture fictive de TC-301.
