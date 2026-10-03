# TC-301 — preuves du prototype MLS natif

Mesures initiales : 2026-10-03. Mise à jour : 2026-10-04.
Statut : **lot A réalisé, TC-301 reste en cours**.
Code : `prototypes/mls`, branche `tc301-mls-prototype`.
Le backend staging et le client Flutter ne sont pas modifiés.

## Résultat et portée

Le laboratoire met en œuvre MLS 1.0/OpenMLS 0.9.0 avec la suite obligatoire
`0x0001`, sans primitive cryptographique inventée dans l'application.
Le stockage OpenMLS et l'outbox/inbox synthétiques partagent une transaction
SQLite. RustCrypto reste la référence de l'ADR ; libcrux est un comparatif,
pas une sélection finale sur la seule base de cet hôte Linux.

Les credentials restent des fixtures, sans liaison aux comptes/appareils
approuvés CircleHaven. Le stockage n'est pas chiffré. Ce code ne peut donc
être activé tel quel pour des données réelles.

## Preuves automatisées locales

15 tests réussis avec **chacun** des fournisseurs RustCrypto et libcrux :

| Ensemble | Preuve |
|---|---|
| Cycle de groupe | création, ajout, Welcome, mise à jour, retrait, échanges et exclusion des messages futurs |
| Entrées hostiles | corruption, rejeu, groupe/version incorrects, longueurs, surplus d'octets, taille excessive |
| Ordre et concurrence | 20 messages hors ordre, deux Commits concurrents, rejet de l'écho perdant et de l'écho falsifié |
| KeyPackage/Welcome | expiration, usage unique, Welcome rejeté sans consommation durable, reprise |
| Persistance | mêmes octets d'outbox après redémarrage, absence de texte publié avant transaction réussie |
| Arrêt brutal | 18 cas : avant/après commit SQL sur neuf chemins, processus enfants sans destructeurs |
| Stockage saturé | quota de pages SQLite atteint pendant l'envoi ; reprise après relèvement du quota |
| Interopérabilité | mls-rs rejoint le groupe OpenMLS, messages et Commits dans les deux sens |
| Vecteurs | sous-ensemble public épinglé : sérialisation MLS et SignWithLabel Ed25519 |

`cargo fmt --check`, Clippy `-D warnings` et les deux suites locales passent.
Le corpus RFC complet, le fuzzing, les erreurs matérielles d'E/S et l'audit
indépendant restent à réaliser. Les tests de processus prouvent l'atomicité
observée de SQLite, pas la résistance à une restauration malveillante d'une
ancienne base ni à un disque qui ment sur sa persistance.

## Point de sécurité découvert pendant le prototype

Avec des Commits privés, OpenMLS peut reconnaître son propre expéditeur sans
authentifier à nouveau le ciphertext. L'erreur `OwnPrivateMessage` ne doit
jamais autoriser à elle seule `merge_pending_commit`.

La copie exacte du Commit local pending est donc stockée avec l'état et
l'outbox. Seul son écho octet pour octet permet la fusion locale, et seulement
s'il reste pending. Un Commit distant passe par le traitement authentifié
OpenMLS. Ce mécanisme ne remplace pas l'ordre fort du futur Delivery Service
et ne constitue pas une défense complète contre un serveur qui crée des forks.

## Mesures natives Linux sur disque

Hôte partagé : Intel Core i3-12100, Linux x86_64, Rust 1.99.0, release,
SQLite `synchronous=FULL`, répertoires temporaires sur **ext4**, messages 1 Kio.
50 échantillons par opération ; 10 lots de 100 réceptions. Les premiers
résultats `/tmp` en tmpfs ont été exclus du tableau principal.

| Appareils, arbre dense | Réception p95 RustCrypto | Réception p95 libcrux | Lot 100 p95 RustCrypto | Lot 100 p95 libcrux |
|---|---:|---:|---:|---:|
| 2 | 6,10 ms | 6,11 ms | 708 ms | 616 ms |
| 10 | 6,10 ms | 6,08 ms | 604 ms | 620 ms |
| 64 | 6,03 ms | 6,12 ms | 606 ms | 856 ms |
| 256 | 8,11 ms | 8,10 ms | 804 ms | 802 ms |

Les groupes clairsemés sont également mesurés après retrait d'une feuille
sur deux : tailles initiales 10/64/256, restantes 6/33/129. Le groupe de
deux appareils ne présente pas ce scénario de retrait partiel.

Ces résultats ne démontrent pas une supériorité globale d'un fournisseur :
les écritures synchrones dominent ici et la charge d'un hôte partagé varie.
À 256 appareils, la préparation de l'ajout initial prend environ 58 ms avec
RustCrypto contre 102 ms avec libcrux ; il s'agit d'un échantillon de setup,
pas d'un p95. Conserver RustCrypto comme référence est cohérent, mais le
choix final attend les preuves mobiles et la revue complète des dépendances.

Le fournisseur crypto reste vivant, mais le groupe est rechargé à chaque
transaction. La colonne réception n'est donc ni un temps réseau, ni un temps
UI, ni une mesure de cache de groupe optimisé. Tous les appareils rejoignent
au départ, puis seuls l'auteur et un pair traitent les updates chronométrés.
Les 100 messages sont persistés dans 100 transactions, pas une transaction
de lot. Pas de comparaison directe aux résultats V2 d'un autre appareil.

Les [agrégats bruts des 14 scénarios](evidence/TC-301-linux-native.json)
consignent les commandes et le contexte. Le binaire natif Linux mesure
9 279 024 octets avec RustCrypto et 9 930 496 avec libcrux. Ce ne sont ni
la taille de l'APK/MSIX ni le surcoût final de l'intégration Flutter.
Un passage séparé du scénario dense à 256 appareils atteint 149 272 Kio de
RSS avec RustCrypto et 148 908 Kio avec libcrux (`/usr/bin/time`). Le processus
héberge les **256 appareils synthétiques** et leurs connexions SQLite ;
ce n'est pas la consommation d'un appareil CircleHaven ni une comparaison
significative de quelques centaines de Kio sur un hôte partagé.

## Compatibilité et CI

Workflow : `.github/workflows/mls-prototype.yml`.
Le [premier run](https://github.com/antoroute/Trust-Circle/actions/runs/37127130938)
valide Linux, Windows, macOS, les compilations iOS et la chaîne de dépendances.
Son résultat global reste en échec car le job Android n'a pas trouvé
`sdkmanager` dans le PATH. La correction appelle son chemin SDK explicite
et installe Rust explicitement, sans changer les primitives ni les tests.
Le [run de correction](https://github.com/antoroute/Trust-Circle/actions/runs/37158065352)
a validé les trois compilations Android, macOS/Linux, iOS et les dépendances.
Son dernier benchmark Windows reste en cours à cet instant ; ne pas annoncer
le run entier réussi avant son résultat final.

- Linux/Windows/macOS : compilation et exécution des mêmes tests, comparaison
  des deux fournisseurs, puis benchmark natif release.
- iOS arm64 et simulateur arm64 : compilation de bibliothèque de référence,
  **pas encore d'exécution dans un simulateur ni de liaison Flutter**.
- Android arm64/ARMv7/x86_64, API 28 : compilation d'un probe natif ;
  **pas encore d'exécution mobile**.

Le propriétaire confirme uniquement Android et Windows disponibles. Son accès
SSH n'a pas été réactivé ni utilisé. Les runners macOS ne remplacent pas les
mesures iPhone/Mac, notamment énergie, veille et stockage sécurisé.

Les [mesures natives du premier run](evidence/TC-301-ci-native.json),
RustCrypto, 10 appareils denses et messages 1 Kio, sont conservées :

| Runner hébergé | Architecture | Réception p95 | 100 réceptions p95 |
|---|---|---:|---:|
| Ubuntu 24.04 | x86_64 | 1,85 ms | 136 ms |
| Windows 2025 | x86_64 | 26,16 ms | 2 526 ms |
| macOS 15 | arm64 | 1,08 ms | 127 ms |

Machines et disques différents : aucun classement intrinsèque des OS n'en
est déduit. Windows 2025 est un **runner serveur**, pas le Windows 11 physique
du propriétaire. Le coût des 100 transactions durables sous Windows justifie
de mesurer explicitement la file native, le pont et les lots au prochain lot.
Il reste de la marge sur les budgets natifs observés, mais pas de preuve UX
Flutter, batterie, système minimal ou régression V2/V3 sur le même appareil.

## Dépendances, SBOM et licences

Le [registre du laboratoire](../../prototypes/mls/SUPPLY_CHAIN.md) donne les
versions, obligations MPL et commandes. Localement : zéro vulnérabilité
signalée par `cargo audit`, **un avertissement de maintenance conservé**
(`proc-macro-error2`, RUSTSEC-2026-0173). Aucun ignore audit ajouté.
Allowlist licences et sources : succès. SBOM CycloneDX généré pour le graphe
complet, y compris dépendances conditionnelles et interop.

Les quatre crates HPKE MPL-2.0 font l'objet d'exceptions exactes et documentées.
Il faudra distribuer notices et sources correspondantes dans le paquet final.
Ce contrôle n'attribue pas de licence au code du propriétaire et ne vaut pas
validation juridique du futur paquet store.

## Traçabilité et portes restantes

| Invariants | Ce que prouve le laboratoire | Ce qui reste |
|---|---|---|
| 14, 16, 17, 18 | CSPRNG fournisseur, authentification MLS avant inbox, erreurs assainies | approbation d'identité, UI/notifications, audit complet |
| 15 | version/suite/groupe MLS et décodage exact | contexte complet CircleHaven/AAD et spécification TC-302 |
| 21, 22 | outbox durable, reprise atomique, rejet des replays | ACK/cursor transport, invalidation/GC et livraison idempotente |
| 13, 20, 23 | aucune revendication produit étendue | base chiffrée, stockage OS, effacement et audit FS/PCS |

Prochaine intervention : **TC-301 lot B**, pont Flutter isolé et exécution
mobile, puis lot C, mesures physiques comparées. TC-302 ne doit pas être
présentée comme débloquée par une clôture fictive de TC-301.
Les comportements de conflit d'époque, de retard inter-époques et de
transparence doivent être explicitement spécifiés dans TC-302/303/304 : la
valeur de laboratoire `max_past_epochs=0` n'est pas une décision UX finale.

Aucune décision propriétaire supplémentaire n'est nécessaire pour poursuivre
le pont expérimental. L'accès matériel Apple reste une contrainte externe
pour la clôture complète, pas un obstacle au lot B.
