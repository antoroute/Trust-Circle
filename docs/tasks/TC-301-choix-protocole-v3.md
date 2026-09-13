# TC-301 — Choisir et prototyper le protocole E2EE V3

Statut : En cours — ADR acceptée, prototypes et preuves plateforme non réalisés
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

## Hors périmètre de ce premier lot documentaire

- Ajouter Rust, OpenMLS ou un pont FFI au client.
- Modifier le schéma ou déployer une route MLS.
- Migrer un groupe ou une enveloppe V2.
- Revendiquer publiquement FS, PCS, post-quantique ou un niveau équivalent à
  une autre messagerie.
- Commencer la Phase 2 ou l'implémentation de la Phase 3.

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
- [ ] Prototype crée un groupe, ajoute/retire un appareil, renouvelle une
      feuille et échange des messages.
- [ ] Crash/reprise prouve l'atomicité de chaque transition et l'absence de
      rollback d'époque silencieux.
- [ ] Vecteurs RFC et interopérabilité avec une deuxième implémentation passent.
- [ ] Android, iOS, Windows et macOS compilent et exécutent le même scénario.
- [ ] Les budgets p95, la mémoire, la batterie et la taille binaire sont mesurés
      face à la baseline V2 sur les appareils cibles.
- [ ] Le fournisseur cryptographique final est choisi après comparaison
      RustCrypto/libcrux et revue de leurs dépendances.
- [ ] SBOM et allowlist de licences transitives passent en CI.

## Plan de tests et preuves restantes

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
- La migration crée un groupe V3 neuf ; aucune dérivation depuis V2.
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

- Valider le comportement utilisateur exact lors d'un changement de membre ou
  d'un conflit d'époque.
- Choisir le niveau de transparence des clés après le prototype `TC-303`.
- Accepter les mesures réelles sur Apple ; l'absence de matériel aujourd'hui ne
  vaut pas preuve.

## Modèle conseillé pour la reprise

Utiliser **GPT-6 Astra avec raisonnement maximal** pour le prototype,
l'intégration identité/stockage et la revue de sécurité. Un modèle plus rapide
convient seulement aux mises à jour mécaniques de documentation après validation.
