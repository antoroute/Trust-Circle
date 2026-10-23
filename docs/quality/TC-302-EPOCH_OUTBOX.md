# TC-302 C1e — Anciennes sorties applicatives et preuve de retrait

Date de validation : 2026-10-23
Statut : correctif et preuves locales ; barrière Q3 complète non implémentée
Base : `0a7ad7d`, suite de [C1d](TC-302-ADMISSION_RELEASE.md)

## Résultat

Une fusion MLS réussie pouvait laisser d'anciens messages applicatifs accessibles
dans l'outbox, même après le retrait d'un membre. Le premier test de ce lot a
échoué sur ce comportement avant correction.

Désormais, la transaction de fusion invalide les sorties `application` du
groupe concerné, aussi bien pour l'auteur que pour un destinataire, y compris
l'appareil retiré. Elles deviennent `superseded` : aucun ancien ciphertext
renvoyé par `outbox` ou par retry. Leur identifiant et empreinte restent pour
empêcher une recréation silencieuse ; aucun rechiffrement automatique.

La politique est conservatrice : **toute transition d'époque** invalide les
anciennes sorties applicatives, pas seulement les retraits. Ce n'est pas encore
la politique produit de retransmission/rétention et ce n'est pas un effacement
physique des pages SQLite. L'inbox validée et les autres groupes sont préservés.

Les **Commit historiques et Welcome fusionnés sont conservés** : les contrôles
peuvent être nécessaires au rattrapage ordonné. Leur disponibilité locale ne
prouve pas une admission actuelle ni une autorisation de republication. Le
pending gagnant/perdant garde les règles C1d. Une préparation, un message
applicatif reçu ou un candidat invalide ne déclenche aucune invalidation.

## Atomicité, schéma et coût

`retire_epoch_applications` est appelé après fusion MLS, dans son même
`BEGIN IMMEDIATE`, avant commit SQLite. Si cette écriture échoue, toute la
fusion est annulée, comme les autres mutations. Aucun état MLS modifié ne
survit au rollback. L'API ne peut pas rappeler des octets retournés auparavant.

La migration [004](../../prototypes/mls/schema/004-epoch-outbox.sql) ajoute un
index partiel sur les sorties applicatives encore disponibles et porte le
schéma à 4. Les anciennes bases v3 ne stockent pas l'époque de création des
sorties : une outbox applicative existante active donc le garde de récupération,
sans tenter de deviner sa fraîcheur. Une base v3 sans sortie applicative ne
reçoit pas ce nouveau signal ; un garde déjà actif n'est jamais retiré. Les
migrations précédentes conservent leurs refus conservateurs pour v0/v2.
Historique préservé ; échec de migration sans version ou marqueur partiellement écrits.

Arrêter tous les acteurs avant changement de version. Pas de support des
anciens binaires simultanés, de migration descendante ou de déblocage manuel.
Pour revenir au code précédent, utiliser de nouvelles fixtures synthétiques
privées ; ne pas réutiliser une base qui doit rester bloquée. Ce n'est pas une
migration de comptes/conversations produit, ni un reset de la VM.

Coût ajouté : écriture locale lors d'un changement d'époque, ciblée par groupe
et index, proportionnelle aux sorties concernées. Ni appel d'annuaire ni
nouvel aller-retour réseau par message. Pas de budget p95 validé ici ; volumétrie,
nettoyage des tombstones et coût sur appareils restent à mesurer.

## Preuves exécutées

Linux local, Rust 1.99.0, OpenMLS 0.9.0/RustCrypto, dépendances verrouillées et
mode hors ligne. **48 fonctions moteur réussies**, dont dix nouvelles dans
[epoch_outbox.rs](../../prototypes/mls/tests/epoch_outbox.rs). Trois fonctions
pilotent au total **28 cas de crash de processus** : 20 initiaux, 4 C1d et
4 C1e. Ce ne sont pas des coupures électriques. Les trois tests Rust du pont
Flutter, Clippy et le formatage passent également.

| Preuve C1e | Portée et limite |
|---|---|
| Retrait appliqué par auteur, pair et appareil retiré | Anciennes sorties refusées, nouvel envoi lisible par le membre restant et rejeté par l'ancien ; autre groupe et inbox conservés |
| Retry, second handle et restart | Invalidation durable, conflit d'entrée conservé, pas de recréation automatique |
| Préparation, réception applicative, faux écho et candidat altéré | Aucune invalidation prématurée |
| Erreur SQL pendant invalidation | Rollback de la fusion propre ou distante, puis reprise réussie |
| Crash avant/après fusion propre ou distante | Époque et invalidation atomiques dans quatre sous-cas |
| Deux contrôles historiques repris dans l'ordre | Pair absent retrouve l'époque courante ; pas une preuve de rattrapage complet des messages |
| Ancienne base v3 et erreur DDL | Garde conservateur seulement si sortie applicative, inbox conservée, migration atomique |
| Update concurrent qui gagne contre un Remove | **Contre-exemple** : époque avancée, membre visé toujours présent et capable de lire ; pas de barrière Q3 dans ce moteur |
| Welcome ancien déjà obtenu | **Contre-exemple** : ouvre encore l'ancien état, pas le nouveau ; aucune preuve de fraîcheur/admission actuelle |
| Indice de feuille réutilisé | Un autre appareil peut occuper le même indice ; ce numéro n'est pas une identité stable |

Un test montre aussi qu'un appareil non encore informé du retrait peut toujours
lire les anciens octets déjà remis à l'appelant. La correction empêche leur
nouvelle extraction par cette outbox, pas leur divulgation rétroactive.

Commandes depuis la racine, avec la toolchain dans `PATH` :

```bash
cargo test --manifest-path prototypes/mls/Cargo.toml --locked --offline --features interop
cargo clippy --manifest-path prototypes/mls/Cargo.toml --locked --offline --all-targets --features interop -- -D warnings
cargo test --manifest-path prototypes/mls_flutter/rust/Cargo.toml --locked --offline
cargo fmt --manifest-path prototypes/mls/Cargo.toml --check
cargo fmt --manifest-path prototypes/mls_flutter/rust/Cargo.toml --check
git diff --check
```

Contrôles documentaires : 77 liens relatifs valides dans huit documents du lot,
20 exigences uniques couvertes par 20 scénarios, références des études/revue
cohérentes, TC-303/304/305 toujours « À faire ». Deux verrous de distribution
actifs et inchangés ; aucun manifeste, lockfile, client principal, backend ou
workflow modifié. `git diff --check` réussi.

## Contrat restant et absence de perte silencieuse

L'[ADR-0012 proposée](../adr/ADR-0012-livraison-admission-v3.md) précise maintenant
les conditions locales nécessaires à la levée d'une attente : identité cible
stable et authentifiée, état de groupe validé excluant toutes les cibles,
obligations connues traitées, persistance atomique et contrôle au départ réseau.
Ces conditions ne sont pas une preuve globale contre l'équivoque du serveur.

Le laboratoire n'a ni signal de révocation authentifié, ni état d'intention Q3,
ni stockage séparé des brouillons envoyés, ni transport réel. Il peut encore
envoyer après un Update concurrent qui n'a pas réalisé le retrait demandé :
le contre-test l'expose explicitement. Ne pas annoncer « Q3 implémentée ».

Avant intégration, conserver séparément l'intention et la copie locale chiffrée
du message : `Superseded` doit provoquer une reprise visible, pas une perte de
contenu. Publication antérieure inconnue : résoudre idempotence/déduplication
avant réémission. Ne pas reprendre automatiquement l'ancien ciphertext, réutiliser
son identifiant comme nouvel envoi ou reconsommer ses secrets. Aucun stockage
supplémentaire en clair n'est créé ici pour simuler ce parcours.

R02/R03/R04 restent ouverts, comme les autres constats. Q3 produit reste décidée,
pas à redemander. Prochaine sous-tâche : **TC-302 C1f, signal et portée de la
barrière Q3 / admission R02**, puis politique hors ligne Q2. Lier la cible au
compte/appareil/incarnation et aux autorisations avant de coder un déblocage.

## Non exécuté

Pas de nouveau benchmark, audit de dépendances, test libcrux, fuzzing, UI/Dart,
matrice OS, batterie, paquet ou déploiement. Aucun accès VM/PC. Les versions,
lockfiles et deux verrous de distribution restent inchangés ; aucune levée du
gel ni sélection finale de fournisseur. Le dernier audit consigné reste celui
du 11 octobre : ce lot ne vérifie pas la disponibilité actuelle d'un correctif amont.
