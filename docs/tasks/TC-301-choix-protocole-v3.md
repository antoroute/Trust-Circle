# TC-301 — Choisir et prototyper le protocole E2EE V3

Statut : En cours — pont du lot B validé sur les quatre OS en CI ; mesures du lot C à poursuivre
Dernière mise à jour : 2026-10-05
Priorité : P0 sécurité
Décision : propriétaire
Dépendances : TC-006, TC-112

## Contexte et problème

Le protocole V2 est une construction propre au projet sans FS/PCS démontrées.
La roadmap exige une comparaison de standards et bibliothèques avant toute
implémentation V3. Le propriétaire demande de fixer la direction avant le début
de la Phase 2, tout en refusant une dégradation sensible des performances.

## Objectif mesurable

Choisir un protocole standard et une implémentation open source juridiquement
utilisable, puis démontrer sur les quatre OS cibles que les opérations de groupe,
la persistance et les messages respectent les invariants et budgets.

## Décision déjà obtenue

L'[ADR-0003](../adr/ADR-0003-protocole-crypto-v3.md) accepte MLS 1.0
(RFC 9420/RFC 9750) avec OpenMLS en Rust, suite obligatoire `0x0001`, un
appareil par membre MLS et aucun brouillon post-quantique en production.

La comparaison et ses sources sont dans
[CRYPTOGRAPHY_V3_DECISION.md](../security/CRYPTOGRAPHY_V3_DECISION.md).

## Périmètre du prototype autorisé après la Phase 2

Le premier lot documentaire est terminé. Le propriétaire a demandé
l'implémentation de TC-301 après TC-210. Le laboratoire isolé
`prototypes/mls` est désormais autorisé ; cela ne constitue pas l'activation
de MLS dans l'app de messagerie ni sur le backend. Aucun compte, groupe ou historique
n'est à migrer, conformément à sa décision de repartir à vide.

Restent hors périmètre : déploiement de routes MLS, changement de données
réelles, activation V3 dans l'application, revendications publiques FS/PCS ou
post-quantiques. Le backend staging n'est pas modifié par ce prototype.

## Composants pressentis

- nouveau crate Rust `circlehaven_crypto` derrière une façade minimale ;
- OpenMLS et fournisseur de primitives verrouillés par `Cargo.lock` ;
- pont Flutter/Rust asynchrone, probablement `flutter_rust_bridge` ;
- stockage local chiffré et transactionnel de `TC-306` ;
- routes opaques KeyPackage/Welcome/Commit/PrivateMessage de `TC-310` ;
- harness interop et benchmarks sans donnée réelle.

## Critères d'acceptation

- [x] Comparaison documentée de MLS, alternatives maintenues et V3 interne.
- [x] Protocole, suite initiale, modèle appareil/membre et frontière serveur
      décidés.
- [x] Licence directe d'OpenMLS compatible avec la distribution commerciale ;
      revue transitive exigée.
- [x] Limites de l'audit OpenMLS et risques résiduels documentés.
- [x] Décision explicitement demandée et acceptée par le propriétaire le
      2026-09-13.
- [x] Prototype crée un groupe, ajoute/retire un appareil, renouvelle une
      feuille et échange des messages.
- [ ] Crash/reprise prouve l'atomicité de chaque transition et l'absence de
      rollback d'époque silencieux.
- [ ] Vecteurs RFC et interopérabilité avec une deuxième implémentation passent.
- [x] Android, iOS, Windows et macOS compilent et exécutent le même scénario
      de laboratoire en CI (mobile émulé/simulé, pas une preuve physique).
- [ ] Les budgets p95, la mémoire, la batterie et la taille binaire sont mesurés
      face à la baseline V2 sur les appareils cibles.
- [ ] Le fournisseur cryptographique final est choisi après comparaison
      RustCrypto/libcrux et revue de leurs dépendances.
- [x] SBOM et allowlist de licences transitives passent en CI (lot natif,
      avis de maintenance documenté ; pas un paquet Flutter de distribution).

## Plan de tests et preuves restantes

Le [rapport TC-301](../quality/TC-301-MLS_PROTOTYPE.md) et le
[README du laboratoire](../../prototypes/mls/README.md) distinguent les preuves
natives, les mesures synthétiques et les portes non franchies.

### Lot A — moteur natif isolé (validé localement et en CI)

- OpenMLS 0.9.0, suite 0x0001 ; deux fournisseurs comparés, versions verrouillées.
- 15 tests par fournisseur, dont 18 scénarios d'arrêt brutal dans un test
  paramétré, saturation SQLite, reprise, négatifs et interopérabilité mls-rs.
- Sous-ensemble de vecteurs publics épinglés ; le corpus complet reste ouvert.
- Groupes denses de 2/10/64/256 appareils et clairsemés de 10/64/256,
  mesures natives sur disque ; aucune mesure Flutter/batterie revendiquée.
- Allowlist ciblée des licences MPL, SBOM CycloneDX et avis de maintenance
  transitive documentés, sans exception silencieuse à l'audit.
- CI six jobs sur six réussis : tests Linux/Windows/macOS, compilations
  Android trois ABI et iOS appareil/simulateur, audit/licences/SBOM.
  La compilation mobile ne constitue pas une preuve d'exécution mobile.

Les tests de reprise empêchent un état partiellement persisté ; ils ne
détectent pas la restauration malveillante d'un ancien fichier complet.
Pour cette raison, le critère global crash/rollback n'est pas coché.

### Lot B — preuve du pont et exécution mobile (validée en CI)

- Pont Flutter/Rust asynchrone isolé, file bornée, aucune primitive Dart ajoutée.
- Même scénario exécuté via Flutter sur Android/Windows puis simulateur iOS.
- Étendre les vecteurs et la direction inverse de création/Welcome interop.
- Vérifier l'impact du pont, du stockage et du traitement en lot sur l'UI.

Implémenté dans `prototypes/mls_flutter` : acteur Rust unique, file bornée,
scénario Flutter asynchrone, 1 025 réceptions synthétiques et 62 contrôles,
réception atomique en lot (100 messages maximum). Localement : 19 tests moteur
par fournisseur, dont 20 cas de crash, 3 tests acteur et 15 tests Dart/FFI
(dont 13 tests de configuration du compilateur NDK).
Interop création/Welcome dans les deux directions et vecteur RefHash ajoutés.
Le scénario graphique passe sur les quatre OS : CI `37211775266`, commit
`b66f188`, six jobs sur six réussis. Les rapports sont archivés ; Windows/macOS
en profile, Android/iOS émulés/simulés en debug. Les tests hôtes seuls ne sont
pas présentés comme une preuve de rendu. Les budgets restent non validés,
notamment avec les pointes Windows et les frames lentes en émulation. Voir le
[rapport du lot B](../quality/TC-301-FLUTTER_BRIDGE.md) pour l'état réel de CI.

### Lot C — mesures physiques et décision finale

Sous-lot C1 implémenté, validation CI en cours : chronométrages transactionnels
sans réduire la durabilité, séries indépendantes, rapports conservant les
pointes, packaging Windows release / Pixel x86_64 debug avec notices et
vérification SHA-256. Voir le [rapport C1](../quality/TC-301-MEASUREMENTS.md).
20 tests moteur/fournisseur et 18 tests Flutter passent localement. Cela ne
clôture ni les budgets ni le choix fournisseur. C2 : baseline V2 équivalente
et essais locaux du propriétaire, sans SSH.

- Préparation : [procédure Windows 11 / Pixel virtuel](../quality/TC-301-LOCAL_VALIDATION.md),
  conforme à la préférence du propriétaire ; aucun essai utilisateur effectué
  et aucune réouverture SSH. La simulation ne valide pas la batterie du S23.
- Comparaison V2/V3 sur les mêmes Android/Windows et, dès disponibilité,
  iPhone/Mac ; distinguer compilation, simulation et matériel réel.
- Mémoire par appareil, taille de l'artefact Flutter, consommation et p95.
- Fournisseur final seulement après revue des preuves de chaque cible.

Plan initial conservé comme checklist :

1. Créer un harness Rust déterministe sans backend de production.
2. Couvrir groupe de 2, 10, 64 et 256 appareils, arbre dense/clairsemé et
   messages hors ordre.
3. Injecter crash, erreur disque, doublon de Commit, Commit concurrent,
   KeyPackage réutilisé/expiré et Welcome malveillant.
4. Importer les vecteurs RFC et comparer les sorties avec MLS++ ou `mls-rs`.
5. Construire la façade Flutter puis mesurer appels unitaires et lots.
6. Exécuter en profile/release sur Android/Windows disponibles, puis
   iOS/macOS sur matériel Apple ou runner macOS approprié.
7. Produire SBOM, `cargo audit`, `cargo deny` et revue des avis amont.

## Risques, migration et rollback

- OpenMLS est pré-1.0 : isoler son API et verrouiller les versions.
- L'audit amont exclut primitives et stockage : ne pas l'étendre à notre
  intégration.
- Une transition MLS non persistée peut désynchroniser un groupe : une
  transaction et un acteur unique par groupe sont obligatoires.
- Le reset crée un groupe V3 neuf ; aucune migration de données ni dérivation depuis V2.
- Après point de bascule, un rollback ne réactive pas l'envoi V2, afin d'éviter
  un downgrade silencieux.
- Le prototype reste derrière un flag de développement local et ne touche ni
  staging ni production sans tâche et autorisation dédiées.

## Documentation à mettre à jour avec le prototype

- `docs/security/CRYPTOGRAPHY_V3.md` pour la spécification finale ;
- `docs/security/THREAT_MODEL.md` et `SECURITY_INVARIANTS.md` ;
- `docs/architecture/PLATFORM_COMPATIBILITY.md` ;
- `docs/architecture/TRACEABILITY.md` ;
- contrats API et modèle de données de `TC-310`.

## Décisions humaines restantes

Aucune nouvelle décision de protocole n'est nécessaire pour le lot suivant.
Le propriétaire confirme le 2026-10-03 disposer uniquement d'Android et
Windows. Aucun accès SSH à son PC n'a été rouvert par cette tâche. Les runners
hébergés ne remplacent pas la validation physique et énergétique Apple.

Précision du 2026-10-04 : Samsung S23 disponible, mais préférence explicite
pour les émulateurs Pixel du SDK Android sur son PC Windows. Préparer les
tests locaux dans ce mode en priorité, sans réouvrir SSH. Une comparaison
V2/V3 dans le même émulateur doit rester identifiée comme émulée ; elle ne
valide ni batterie ni budgets physiques du S23 ou d'un iPhone.

- Valider le comportement utilisateur exact lors d'un changement de membre ou
  d'un conflit d'époque.
- Choisir le niveau de transparence des clés après le prototype `TC-303`.
- Accepter les mesures réelles sur Apple ; l'absence de matériel aujourd'hui ne
  vaut pas preuve.

## Modèle conseillé pour la reprise

Utiliser **GPT-6 Astra avec raisonnement maximal** pour le prototype,
l'intégration identité/stockage et la revue de sécurité. Un modèle plus rapide
convient seulement aux mises à jour mécaniques de documentation après validation.
