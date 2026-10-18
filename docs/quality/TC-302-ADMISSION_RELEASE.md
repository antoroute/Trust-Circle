# TC-302 C1d — Libération locale du Welcome et invalidation du perdant

Date : 2026-10-18
Statut : réalisé et testé dans le laboratoire isolé ; contrat produit non accepté
Suite de [C1c](TC-302-RECOVERY_GUARD.md), sous la suspension [TC-301](TC-301-SECURITY_HOLD.md)

## Résultat et portée

Le laboratoire conserve désormais le Welcome chez son auteur jusqu'à la
fusion durable de son Commit exact. Si un Commit concurrent valide est fusionné
à sa place, son ancienne sortie devient définitivement indisponible via l'API,
y compris après redémarrage ou répétition de l'opération. L'invalidation et
la fusion MLS partagent la même transaction SQLite.

Ce lot poursuit la mise en place locale demandée, sans intégration produit.
Il ne constitue ni un service de livraison, ni une preuve d'accord global,
ni la résolution de R02/R03. L'[ADR-0012 proposée](../adr/ADR-0012-livraison-admission-v3.md)
sépare le comportement prouvé des décisions et mécanismes encore nécessaires.

## Fonctionnement exact

| État local de l'outbox | Sortie accessible | Transition |
|---|---|---|
| `pending` | Commit exact, jamais le Welcome | Fusion locale durable de ce Commit, ou d'un concurrent valide |
| `merged` | Commit et éventuel Welcome persistés | Aucun cycle ACK/GC implémenté |
| `superseded` | Erreur `Superseded` ; aucun ciphertext ni Welcome retourné | Terminal pour cet identifiant d'opération |
| `application` | Message applicatif exact | Cycle historique inchangé |
| `legacy` | Aucune sortie autorisée | Ancienne base arrêtée par le garde, pas de reprise automatique |

`add`, `update`, `remove`, leur retry et `outbox` suivent cette politique.
Après son écho exact et sa fusion, l'auteur relit `outbox(operation)` pour
obtenir le Welcome. Un écho altéré, un candidat invalide ou une erreur de
persistance ne libère ni n'invalide le Welcome. Une réception applicative
valide pendant l'attente conserve le pending. Le traitement reste local :
aucun nouvel aller-retour réseau n'est introduit par ce lot.

Un perdant conserve identifiant, groupe et empreinte d'entrée pour empêcher
sa recréation par retry ; sa colonne `wire` devient vide. Cette suppression
est **logique**, pas une preuve d'effacement de pages SQLite/WAL/SSD. Des octets
déjà remis à un transport ne peuvent pas être rappelés. Un Welcome déjà
libéré ne prouve pas que ses destinataires ont encore des droits aujourd'hui.
Le garde de restauration C1c reste prioritaire sur la lecture de toute outbox.

Le test d'admissions concurrentes a aussi révélé que les appareils ayant
rejoint un groupe ne conservaient pas la configuration d'inclusion de l'arbre
utilisée par le créateur. Leur propre Welcome suivant était inutilisable par
notre parcours sans arbre externe. `MlsGroupJoinConfig` active désormais la
même extension standard `ratchet_tree` que la création ; un test couvre un
participant rejoint qui ajoute à son tour un troisième appareil. Aucune
nouvelle extension expérimentale, dépendance ou primitive n'est ajoutée.

## Schéma et compatibilité du laboratoire

La migration [003-admission.sql](../../prototypes/mls/schema/003-admission.sql)
porte `user_version` à 3 et impose au plus une outbox pending par groupe.
Les anciennes bases de test v0/v2 n'ont pas de preuve durable permettant de
classer leurs sorties. Si elles contiennent une outbox ou un pending, leur
garde est donc activé et l'inbox est conservée, sans supposer le Welcome sûr.
Une base neuve ou la fixture ne contenant que l'inbox ne perd pas son historique.
Cette migration n'est pas une migration de données produit ou une réactivation.

Reprise du laboratoire : utiliser de nouvelles fixtures synthétiques privées.
Ne pas débloquer une ancienne base ni y exécuter un ancien binaire ignorant
ces états ; pas de migration descendante fournie. Les anciens états MLS
persistés ne sont pas convertis vers une nouvelle configuration de groupe.
Les fichiers et données réels du propriétaire ne sont pas concernés.

## Preuves exécutées

Linux local, Rust 1.99.0, fournisseur RustCrypto, dépendances verrouillées et
mode hors ligne. **38 fonctions de test moteur réussies**, dont huit nouvelles
dans [admission.rs](../../prototypes/mls/tests/admission.rs). Deux fonctions
pilotent au total **24 cas de crash de processus** : les vingt existants et
quatre nouvelles combinaisons avant/après transaction, gagnant/perdant.
Ce ne sont pas des coupures électriques du stockage.

1. Welcome absent avant fusion, y compris retry/restart/faux écho/rollback ;
   octets exacts disponibles après fusion durable.
2. Invalidation uniquement après fusion d'un concurrent valide ; observation
   depuis un second handle et après restart ; autre groupe préservé ; retry
   terminal et conflit d'identifiant conservés.
3. Erreur SQL lors de la libération : aucune avance partielle de l'état MLS ;
   reprise réussie après suppression de la panne synthétique.
4. Anciennes outboxes v0/v2 : arrêt conservateur et historique conservé.
5. Crash brutal avant/après libération ou invalidation : résultat atomique.
6. Retrait de l'auteur : son admission pending est également invalidée.
7. Appareil rejoint qui devient auteur d'une admission : Welcome utilisable.
8. **Contre-exemple de divergence** : un serveur simulé livre uniquement à
   chacun de deux auteurs son propre Commit concurrent. Tous deux fusionnent
   et libèrent un Welcome ; les deux nouveaux appareils rejoignent des branches
   incompatibles malgré un même numéro d'époque. Le test démontre une limite,
   pas une défense contre ce serveur ni une détection automatique du fork.

Le premier test a échoué sur le code initial (Welcome retourné prématurément).
Le contre-exemple a échoué sur la configuration de jonction avant sa correction.
Les trois tests Rust du pont de laboratoire Flutter réussissent après adaptation
de ses deux lectures de Welcome. Interopérabilité mls-rs, Clippy et formatage passent.
Contrôles documentaires : 82 liens relatifs valides dans neuf documents, 20
exigences uniques et 20 scénarios conservés ; TC-303/304/305 restent « À faire ».
Les deux verrous de distribution sont actifs et inchangés ; `git diff --check` passe.

Depuis la racine, avec la toolchain dans `PATH` :

```bash
cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop
cargo clippy --manifest-path prototypes/mls/Cargo.toml --locked --offline --all-targets --features interop -- -D warnings
cargo test --manifest-path prototypes/mls_flutter/rust/Cargo.toml --locked --offline
cargo fmt --manifest-path prototypes/mls/Cargo.toml --check
cargo fmt --manifest-path prototypes/mls_flutter/rust/Cargo.toml --check
git diff --check
```

## Non exécuté et suite

Aucun benchmark, audit de dépendances actualisé, test libcrux, fuzzing, test
Flutter/Dart graphique, matrice OS, essai matériel ou déploiement. Les résultats
ne valident donc ni budgets de latence/batterie ni sécurité du produit. Aucun
nouveau paquet, lockfile, fournisseur ou verrou de distribution modifié ;
aucun accès au PC ou à la VM. Les neuf modifications documentaires préexistantes
sont préservées et exclues du commit de ce lot.

G04/G05 et S05/S12 ont désormais des preuves **locales partielles** ; réservation
KeyPackage, politiques d'identité/rôle, preuve d'admission du destinataire,
transport et barrière de révocation restent ouverts. R01–R08 ne sont pas fermés.
La prochaine sous-tâche reste **TC-302 C1 : contrat R02 et barrière Q3, puis Q2**.
Le propriétaire accepte Q3 le 18 octobre : attendre le retrait sécurisé si aucun
appareil habilité n'est disponible, avec lecture/brouillons et autres conversations
disponibles. Cette décision UX ne prouve pas la barrière technique ; ne pas la redemander.
