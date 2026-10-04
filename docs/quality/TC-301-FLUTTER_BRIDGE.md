# TC-301 — lot B, pont Flutter et réception atomique en lot

Date : 2026-10-04. **En cours, pas de clôture TC-301.**
Branche `tc301-mls-prototype`, première implémentation `67fef4a`.
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
- Flutter hôte : **2 tests**, admission bornée et scénario complet FFI avec
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

Première passe : [37194044743](https://github.com/antoroute/Trust-Circle/actions/runs/37194044743),
en cours d'analyse. Les jobs hôtes ont trouvé que `cargo --manifest-path` ne
sélectionne pas le toolchain du sous-dossier Rust : le runner utilisait 1.98.1
malgré l'installation de 1.99.0. Un fichier toolchain au dossier Flutter corrige
la sélection. Ne pas considérer la matrice Flutter verte avant sa réexécution.
La matrice native du moteur est relancée séparément :
[37194044725](https://github.com/antoroute/Trust-Circle/actions/runs/37194044725).

Toujours manquants : budgets profile/release V2/V3 sur les mêmes appareils,
énergie/veille, iPhone/Mac physiques, taille du paquet final et SBOM complet
Flutter/OS. Windows Server en CI n'est pas le Windows 11 du propriétaire.
Le choix définitif de fournisseur et l'activation dans le produit restent ouverts.

Le graphe du pont compile hax/libcrux-sha3 même avec RustCrypto ; l'avis de
maintenance doit donc être suivi pour ce binaire aussi. Le générateur FRB
verrouillé possède un vieux futures-util yanked ; il n'est pas dans le runtime
verrouillé de l'app. Détails et obligations dans le README et SUPPLY_CHAIN.

## Suite et décisions

Prochaine sous-tâche : **TC-301 lot B, finir la validation multiplateforme**,
puis lot C, protocole de mesures physiques. Aucune nouvelle décision produit
n'est nécessaire pour ces tests. L'absence de matériel Apple limite les preuves
énergétiques, pas la poursuite du travail local ou en simulateur.
Le propriétaire précise disposer d'un Samsung S23, mais préfère d'abord les
émulateurs Pixel d'Android Studio sur son PC Windows. Cette préférence est
retenue pour le prochain essai utilisateur ; aucune réouverture SSH implicite.
Ne pas passer à TC-302 sur la base d'une clôture fictive de TC-301.
