# TC-301 — essais locaux Windows / Pixel virtuel

Date : 2026-10-11. Préparation du lot C, **aucun essai utilisateur réalisé**.
Le propriétaire possède Windows 11 et un Samsung S23 mais préfère commencer
par un émulateur Pixel d'Android Studio. Aucun accès SSH à son PC n'est requis.

**Procédure suspendue** : le propriétaire a choisi d'attendre une version amont
compatible après les nouvelles alertes RustSec. Ne pas installer les anciens
paquets ni lancer ces essais pour une nouvelle validation. Les commandes sont
conservées pour la reprise après [levée du blocage](TC-301-SECURITY_HOLD.md).

## Ce que cet essai peut valider

Le laboratoire séparé `prototypes/mls_flutter`, sans serveur ni compte, teste
la chaîne Flutter → pont asynchrone → OpenMLS → SQLite. Il ne teste pas encore
la connexion, le réseau, le chargement d'une conversation réelle ni SQLCipher.
Les fichiers SQLite contiennent uniquement des données synthétiques en clair.
Ne jamais utiliser de clés, messages ou comptes réels dans ce laboratoire.

La CI est décrite dans [le rapport du lot B](TC-301-FLUTTER_BRIDGE.md).
Windows Server CI n'est pas Windows 11 ; un Pixel virtuel n'est pas un S23.
Ces essais virtuels ne valident ni autonomie, ni veille, ni stockage sécurisé
matériel. Ils permettent d'avancer sans demander un accès distant au PC.

## Prérequis pour exécuter depuis les sources

Pour éviter cette installation complète, privilégier les paquets décrits
ci-dessous une fois leur CI validée. Flutter/Rust/Visual Studio ne sont alors
pas nécessaires ; Android Studio reste nécessaire pour l'émulateur.

- Copie locale du dépôt, branche `tc301-mls-prototype`, au commit de CI retenu
  dans le rapport. Utiliser son propre accès GitHub, jamais le jeton du serveur.
- SDK Flutter **3.47.4 / Dart 3.13.3**, commit
  `9584c6713b324636289d067944a46fd6b49df14b`, dans un répertoire distinct si un
  autre projet utilise un ancien SDK. Ne pas mettre à jour l'app existante.
- Rust/rustup **1.99.0**, toolchain MSVC sur Windows, et Visual Studio avec les
  outils de développement desktop C++. `flutter doctor -v` vérifie leur présence.
- Pour Android : Android Studio, SDK, NDK **28.2.13676358**, un AVD Pixel x86_64
  **API 35** démarré et visible dans `flutter devices`. Le modèle Pixel affiché
  ne transforme pas la machine virtuelle en téléphone physique.
- Suffisamment de disque : le premier build télécharge et compile Flutter,
  Gradle et Rust. Cette préparation peut prendre plusieurs minutes ; ce n'est
  pas le temps de démarrage ou de connexion du produit.

Les commandes ci-dessous supposent que ces outils sont dans le PATH du terminal
et que PowerShell est déjà ouvert dans `prototypes\mls_flutter`. Elles ne
modifient ni service Windows, ni règle réseau, ni configuration SSH.

```powershell
flutter --version
rustup show active-toolchain
flutter doctor -v
flutter pub get --enforce-lockfile
flutter devices
```

Si les versions sont différentes, corriger le terminal utilisé avant de
comparer les résultats ; ne pas supprimer les lockfiles pour résoudre un échec.

## Essai Windows 11

```powershell
flutter drive --profile -d windows --driver test_driver/integration_test.dart --target integration_test/lab_test.dart
Copy-Item reports\flutter-ui.json reports\windows11-profile-run1.json
```

Le test ouvre la fenêtre et actionne le bouton. Attendu : « Scénario validé »,
**1 025 réceptions, 62 contrôles**, puis suppression des bases temporaires de
la session. Une nouvelle exécution doit également réussir.

Pour observer l'interface hors du pilote de test :

```powershell
flutter run --profile -d windows
```

Cliquer sur « Exécuter les vérifications ». Le rapport affiché est sélectionnable.
Le scénario répète volontairement beaucoup d'écritures ; sa durée totale ne
représente pas le délai de réception d'un message.

## Essai Pixel virtuel

Vérifier dans `flutter devices` que l'identifiant suivant correspond bien au
Pixel voulu. `emulator-5554` est courant mais n'est pas garanti ; le remplacer
si nécessaire. Ne pas sélectionner le S23 par erreur.

```powershell
flutter drive --debug -d emulator-5554 --driver test_driver/integration_test.dart --target integration_test/lab_test.dart
Copy-Item reports\flutter-ui.json reports\pixel-api35-debug-run1.json
```

Attendre le même résultat fonctionnel. Le mode debug de cet essai virtuel n'est
pas une validation des budgets de performance. Conserver les résultats bruts,
y compris les valeurs lentes ; ne pas les convertir en résultats de téléphone.
Pour une observation manuelle :

```powershell
flutter run --debug -d emulator-5554
```

Ne pas installer l'APK de laboratoire comme une mise à jour de la messagerie.
Son identifiant Android est `fr.kavalek.circlehaven.lab.mls_flutter`. La signature
de développement n'est pas une signature de publication sur un store.

## Paquets sans compilation locale — lot C1

Ouvrir la CI dont le commit et le résultat sont indiqués dans le
[rapport C1](TC-301-MEASUREMENTS.md), avec son propre compte GitHub. Dans
« Artifacts », télécharger le paquet Windows ou Android portant **ce même
SHA**. Les artefacts expirent après 30 jours ; une disparition impose un
nouveau build vérifié, pas un téléchargement depuis un miroir inconnu.

Extraire **tout** le ZIP dans un dossier distinct. Ne pas mélanger deux builds.
Ouvrir PowerShell dans ce dossier et lire `README.txt` / `manifest.json`.
Pour vérifier les hashes :

```powershell
powershell.exe -NoProfile -File .\Verify-Lab.ps1
```

Si la politique locale interdit le script, ne pas désactiver la protection
globalement. Après vérification de la provenance GitHub et du script, une
exception limitée à ce seul processus peut être utilisée :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Verify-Lab.ps1
```

Attendre « Verified … files ». Les hashes ne sont pas une signature d'éditeur.
En cas d'échec, ne pas lancer le paquet et ne pas corriger le manifeste à la main.

### Windows 11 x64

```powershell
.\app\mls_flutter.exe
```

Garder le dossier `app` complet, DLL et données comprises. Le laboratoire
n'est pas signé pour un store. Si Windows ou l'antivirus le bloque, partager
le message assaini ; ne pas désactiver l'antivirus. Si le runtime Visual C++
est absent, signaler le message plutôt que récupérer des DLL isolées.

1. Cliquer « Exécuter les vérifications » : attendu 1 025 réceptions/62 contrôles.
2. Cliquer « Mesurer (3 séries) » : attendu 3 × 2 111 réceptions. Plusieurs
   minutes possibles : ce sont des milliers d'écritures, pas une connexion.
3. Cliquer « Copier le rapport JSON » et partager volontairement le texte.
   Conserver les trois séries et les pointes, sans tri ou suppression.

### Pixel API 35 x86_64

Démarrer l'AVD voulu dans Android Studio. Ces commandes supposent l'emplacement
SDK habituel et **emulator-5554** ; vérifier puis adapter uniquement ces deux
valeurs si nécessaire. Ne pas choisir un téléphone connecté par inadvertance.

```powershell
$tcAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
& $tcAdb devices
& $tcAdb -s emulator-5554 install -r .\circlehaven-mls-lab-x86_64-debug.apk
& $tcAdb -s emulator-5554 shell am start -n fr.kavalek.circlehaven.lab.mls_flutter/.MainActivity
```

Effectuer les mêmes deux boutons et copier le rapport. L'APK x86_64 n'est pas
compatible avec le S23 ARM. Le mode debug émulé ne valide pas les budgets
physiques. Aucun port réseau, SSH, service ou backend à ouvrir.

## Compte rendu à partager

- Commit testé, version de Windows ; pour l'AVD : API, ABI, RAM allouée et mode
  GPU, sans nom de PC, adresse IP, identifiants de comptes ou numéros de série.
- Fichier JSON agrégé et résultat succès/échec. Aucun fichier SQLite, dump
  mémoire, `.env`, clé ou secret n'est nécessaire.
- Interface qui répond ou se fige ; premier lancement à froid versus relance.
- En cas d'échec, extrait d'erreur utile après vérification des données privées,
  pas une copie intégrale des variables d'environnement.

Les rapports ne contiennent normalement que compteurs et mesures synthétiques.
Ils restent des données locales jusqu'à leur partage volontaire.

## Suite du lot C — avant de conclure sur la performance

Budgets déjà décidés par l'ADR-0003 / TC-114 : p95 ≤100 ms pour un message
avec état chaud, ≤250 ms après chargement local et <5 s pour reprendre
100 messages. Ces seuils ne sont pas remplacés par les durées du scénario
de laboratoire. Une régression V2/V3 sur le même appareil demande correction
ou décision explicite ; on ne relève pas les budgets pour faire passer le test.

1. Livraison d'artefacts de laboratoire reproductibles pour éviter d'imposer
   une compilation complète à chaque essai ; conserver SHA, mode et versions.
2. Échauffement explicite, plusieurs exécutions indépendantes, davantage
   d'échantillons que les 20 messages / 5 lots exploratoires actuels.
3. Séparer coût cryptographique, transactions durables, attente de file,
   copies FFI et rendu. Ne pas comparer un coût V2 en mémoire à V3 avec fsync.
4. Baseline V2 synthétique et V3 avec même payload, taille de groupe et
   persistance ; publier mesures à froid et à chaud, pas seulement une moyenne.
5. Profile/release sur Windows 11 et, quand le propriétaire le souhaite, S23 ;
   ne pas bloquer les essais virtuels sur cette étape matérielle.
6. Sur téléphones physiques : mémoire d'un seul client, batterie/veille,
   stockage final chiffré, réception après suspension et reprise.
7. Répéter sur iPhone/Mac physiques quand accessibles ; disponibilité inconnue.

Les frames relevées par le test automatisé ne garantissent pas 60 FPS : le
pilote effectue des `pump` espacés, et debug/virtualisation influencent fortement
les temps. Ni ce document ni une CI verte ne clôturent les budgets de TC-301.
