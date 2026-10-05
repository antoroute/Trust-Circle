# TC-301 — lot C, instrumentation et paquets de laboratoire

Date : 2026-10-05. Sous-lot C1 en validation ; **TC-301 reste ouverte**.
Périmètre : laboratoire isolé, données synthétiques, aucun backend/PC modifié.

## Ce qui change

- Chronométrages Rust de réception : `BEGIN IMMEDIATE`, rechargement du groupe,
  traitement MLS et appels SQLite, puis commit. L'ordre transactionnel, les
  vérifications et `synchronous=FULL` sont conservés. Aucun cache de groupe
  n'est ajouté. Seules les transactions réussies exposent leurs mesures ;
  les erreurs ne publient pas les durées d'une réception précédente.
- Le pont retourne ces durées numériques et le nombre de transactions.
  Il ne retourne ni clés, ni messages, ni identités ou chemins de stockage.
- Le bouton « Mesurer » crée trois sessions indépendantes. Par session : un
  premier échange après création, 10 échauffements exclus, 100 échanges de
  1 Kio et 10 paires de 100 réceptions unitaires/en lot, ordre alterné.
  Attendu : 2 111 réceptions/session, 6 333 au total, bases nettoyées.
- Profil CI réduit : une session, 5 échauffements, 50 échanges, 3 paires de
  lots, soit 656 réceptions. L'ancien scénario reste à 1 025/62 contrôles.
- Rapport `tc301-measurements-v1`, échantillons numériques dans l'ordre
  d'acquisition, p50/p95 par session, pointes >100 ms conservées, RSS du
  processus, mode et commit. Export par bouton de copie explicite uniquement.
  `budgets_accepted` reste **false** quelle que soit la vitesse observée.

## Interprétation exacte

Le premier échange suit une création : ce n'est ni un cache OS froid, ni un
démarrage d'application. Le groupe est rechargé même après échauffement. Le
temps « traitement et SQL » n'isole pas le CPU cryptographique ; le commit
n'est pas une instrumentation directe de fsync. Le décodage est hors des
sous-étapes mais inclus dans la durée complète de réception. Les percentiles
de plusieurs étapes **ne s'additionnent pas**.

Deux membres échangent, trois appareils virtuels existent dans le processus.
Le RSS inclut Flutter, le pilote et ces appareils ; ce n'est pas une mémoire
par appareil. Les quelques lots fournissent des percentiles exploratoires.
Le rendu est relevé pendant les tests graphiques, mais le pilote, le mode debug
et les machines virtuelles empêchent une garantie de fluidité physique.

## Validation locale

- Moteur : 20 tests par fournisseur, dont les 20 cas d'arrêt brutal du test
  paramétré ; acteur : 3 tests. Nouveau test de rollback/retry et d'invalidation
  des mesures après erreur. Format et Clippy sans avertissement.
- Flutter : analyse statique et 18 tests, dont anciennes réceptions 1 025/62,
  nouveau scénario 656, plan borné et statistiques conservant les pointes.
- Scripts : inventaire SHA-256, rejet de cible inconnue, vérificateur PowerShell
  testé en CI lorsque `pwsh` est disponible ; pas disponible sur cet hôte.
- Collecte locale des notices : 307 paquets Rust ; sources MPL incluses.

Essai hôte Linux sur ext4 (`TMPDIR` dédié, pas `/tmp` en RAM), profil CI réduit :
réception p95 6,10 ms, commit p95 5,88 ms, aller-retour p95 13,78 ms. Aucun des
50 allers-retours ne dépasse 100 ms. Médiane de réception de 100 messages :
600,02 ms en transactions unitaires, 12,04 ms en une transaction.
Ces chiffres **ne valent pas validation Windows/Android ni comparaison V2**.

## Paquets Windows et Pixel

La CI construit l'entrée `lib/main.dart`, jamais celle des tests d'intégration.
Windows x64 : dossier release complet, DLL/données conservées, scénario 1 025/62
exécuté depuis le binaire livré via `--lab-self-test` (sans rendu graphique).
Android x86_64 : APK debug pour Pixel API 35, pas S23 ARM, installé et lancé
sur l'émulateur CI. Les tests graphiques séparés exécutent le même code source ;
ils ne constituent pas un essai interactif complet de l'APK livré.

Les paquets incluent commit, versions, tailles décompressées, SHA-256 de chaque
fichier, notices Rust/Dart/Flutter et sources MPL inchangées. Les archives Cargo
sans texte de licence sont complétées par des textes amont épinglés à leur
commit, ou le texte officiel Mozilla pour les quatre HPKE déclarés MPL.
Voir `scripts/upstream-licenses/README.md`. Le graphe comprend aussi dépendances
de test/build/autres plateformes : ce n'est pas un SBOM runtime minimal.

`Verify-Lab.ps1` refuse fichiers altérés, inattendus, doublons et chemins
sortants/liens. Il ne lance pas l'app. Les hashes prouvent l'intégrité par rapport
au manifeste, **pas l'identité de l'éditeur** : récupérer via GitHub authentifié.
Aucune signature store et aucun avis de conformité juridique complète.

Preuves CI et tailles finales : à renseigner après exécution, pas déduites du YAML.

## Prochaine sous-tâche C2 et portes restantes

Comparer V2 et V3 à périmètre équivalent sur un même hôte, sans confondre
chiffrement en mémoire et transaction durable. Répéter les séries Windows 11
et Pixel du propriétaire, sans ouvrir SSH. Isoler ensuite une optimisation
étayée par les profils sans réduire durabilité ni authenticité.

Restent : batterie et mémoire d'un seul client sur matériel, stockage chiffré
final, matériel Apple, corpus RFC complet, protection contre restauration
malveillante d'un ancien disque et choix final RustCrypto/libcrux. Aucune
décision supplémentaire du propriétaire n'est nécessaire pour C1.
