# TC-301 — lot C, instrumentation et paquets de laboratoire

Mesures : 2026-10-05. Consolidation : 2026-10-11. **TC-301 reste ouverte**.
Périmètre : laboratoire isolé, données synthétiques, aucun backend/PC modifié.

**Paquets suspendus par décision du propriétaire le 11 octobre** : le nouvel
audit échoue sur trois avis publiés après cette CI. Attente d'une version amont
compatible, sans fork ni changement de fournisseur. Voir
[le blocage, les garde-fous et les conditions de reprise](TC-301-SECURITY_HOLD.md).
Les résultats ci-dessous restent des preuves historiques, pas une autorisation
d'utiliser les anciens paquets.

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

Le plan interactif complet a également réussi localement : trois sessions de
2 111 réceptions en 59,90 s, p95 aller-retour respectivement 12,127 / 12,089 /
12,193 ms (100 échantillons/session), aucune pointe unitaire >100 ms. RSS total
échantillonné 139,68 Mio. Ce résultat vérifie la répétition et le nettoyage,
toujours pas le comportement d'un appareil physique. Reproduction hôte :

```bash
TC_MLS_REPORT_DIR=reports/full flutter test test/lab_test.dart --plain-name 'measurement stages' --dart-define=TC_MLS_FULL_MEASURE=true
```

Sous Linux, régler préalablement `TMPDIR` sur un dossier privé ext4. Le switch
de test ne change pas le code applicatif ; le bouton standard emploie déjà ce plan.
Les [échantillons complets de ces trois séries](evidence/TC-301-c1-linux.json)
sont archivés avec le hash du rapport original, sans retirer les pointes.

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

## Preuves CI du commit 27ab9c6

La [matrice native 37323916119](https://github.com/antoroute/Trust-Circle/actions/runs/37323916119)
est verte, six jobs sur six. La
[matrice Flutter 37323916095](https://github.com/antoroute/Trust-Circle/actions/runs/37323916095)
est également verte, six jobs sur six. Windows/macOS exécutent les deux
scénarios graphiques en profile, Android/iOS en debug émulé/simulé. Les tests
hôtes ne sont pas présentés comme des mesures graphiques. Les notices et
le vérificateur PowerShell passent aussi en CI Windows ; le binaire release
livré y passe le scénario autonome 1 025/62 avant upload.
Les [rapports, échantillons bruts et métadonnées CI](evidence/TC-301-c1-ci.json)
sont archivés ; les rapports hôtes sans SHA intégré sont rattachés au commit
par leur exécution GitHub, sans réécriture de leur contenu.

L'audit du **5 octobre** conservait seulement l'avis de maintenance
`RUSTSEC-2026-0173`, sans ignore ajouté. Celui du **11 octobre échoue** :
voir la suspension en tête de document. La réussite historique n'est pas
présentée comme une validation de sécurité actuelle.
Le lockfile de l'outil `cargo-cyclonedx 0.5.9` signale `xml-rs 0.8.19` yanked :
avertissement de l'outil de génération SBOM, distinct du runtime livré.

Mesures après échauffement, 50 échanges unitaires par cible ; durées en ms :

| Cible / mode | Aller-retour p95 | Réception p95 | Commit réception p95 |
|---|---:|---:|---:|
| Windows Server 2025 / profile | 70,599 | 31,386 | 27,821 |
| macOS ARM / profile | 5,836 | 2,329 | 1,374 |
| Pixel émulé / debug | 41,905 | 21,180 | 20,765 |
| iPhone simulé / debug | 23,560 | 7,445 | 6,712 |

Les colonnes ne s'additionnent pas et les plateformes/modes ne sont pas un
classement de produits. Sous Windows, une pointe d'aller-retour de 101,560 ms
reste présente (envoi 72,242 ms, réception 28,193 ms). Le commit représente
une part importante des réceptions observées ; cela oriente le diagnostic
vers la persistance, sans isoler la cause OS/disque exacte. Le rechargement du
groupe reste ici faible (p95 0,219 ms). Le p95 de 253,599 ms du lot B n'est pas
reproduit sur ce runner, mais **aucune correction de ce problème n'est démontrée** :
ni l'environnement ni le protocole d'échantillonnage ne sont strictement identiques.
Réception Windows de 100 messages : médiane 2 785,844 ms en 100 transactions
contre 39,496 ms en une transaction, trois échantillons seulement.

Pixel 6 virtuel API 35 x86_64, debug : 656 réceptions validées. Après
échauffement, aller-retour p95 41,905 ms, réception p95 21,180 ms et commit
p95 20,765 ms ; aucune des 50 réceptions/allers-retours >100 ms. Premier
échange **après création** : 740,572 ms, dont envoi 558,532 ms et réception
173,536 ms ; le commit du récepteur représente 172,645 ms sur cet échantillon.
Ne pas présenter cette première valeur comme un p95 de démarrage à froid.
Les frames raster p95 restent lentes (254,249 ms, 44 échantillons) sous le
pilote debug/émulateur ; la fluidité produit n'est donc pas démontrée.

Paquet Android : ZIP 43 789 254 octets ; APK debug 80 442 205 octets ; ensemble
décompressé hors manifeste 85 293 330 octets. Les 696 hashes du manifeste ont
été revérifiés après téléchargement. Ces tailles ne préjugent pas d'un AAB
release ARM ni de la taille du produit complet.

Paquet Windows : ZIP 16 114 308 octets, dossier applicatif 34 210 234 octets,
ensemble hors manifeste 39 063 946 octets ; 705 hashes vérifiés après
téléchargement. Les paquets historiques restent non signés/développement,
avec une expiration GitHub annoncée au 2026-11-04. **Ne pas les proposer comme
nouveaux paquets de test tant que la suspension est active.**

## Prochaine sous-tâche C2 et portes restantes

Préalable : lever la suspension selon TC-301-SECURITY_HOLD.md, après versions
amont compatibles et validation. Ensuite comparer V2 et V3 à périmètre
équivalent sur un même hôte, sans confondre
chiffrement en mémoire et transaction durable. Répéter les séries Windows 11
et Pixel du propriétaire, sans ouvrir SSH. Isoler ensuite une optimisation
étayée par les profils sans réduire durabilité ni authenticité.

Restent : batterie et mémoire d'un seul client sur matériel, stockage chiffré
final, matériel Apple, corpus RFC complet, protection contre restauration
malveillante d'un ancien disque et choix final RustCrypto/libcrux. Aucune
décision supplémentaire n'est attendue maintenant : le propriétaire a choisi
d'attendre les versions amont compatibles, sans fork ni mise en quarantaine.
