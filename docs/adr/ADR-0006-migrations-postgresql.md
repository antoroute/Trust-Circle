# ADR-0006 — Gestion des migrations PostgreSQL avec Sqitch

Statut : Acceptée
Date : 2026-09-13
Décision : mainteneur, dans le cadre de `TC-201`

## Contexte

Le schéma PostgreSQL était créé par `infrastructure/postgres/init.sql`, puis
cinq couples de scripts montant/descendant ont été appliqués manuellement.
L'initialisation contient désormais l'état final de ces changements : la
rejouer puis appliquer les migrations échoue ou masque des écarts. Aucun
registre ne prouve en outre l'ordre, la vérification ou la réversion des
changements.

Le projet exige des migrations SQL relisibles, réversibles et testables, sans
ajouter de travail au chemin d'exécution des services ni dépendre d'une offre
propriétaire.

## Décision

Adopter **Sqitch 1.6.1** pour PostgreSQL, sous licence MIT. Sqitch s'exécute
comme un job Docker unique avant le démarrage ou la promotion des services ;
Auth et Messaging ne lancent jamais eux-mêmes les migrations.

Chaque changement comporte obligatoirement :

- un script `deploy` transactionnel ;
- un script `revert` explicite, même si son usage en environnement persistant
  doit être précédé d'une analyse de données et d'une sauvegarde ;
- un script `verify` sans mutation persistante ;
- une dépendance explicite dans `sqitch.plan` et une description traçable.

L'image approuvée pour cette baseline est `sqitch/sqitch:v1.6.1`, à figer par
digest dans les environnements par `TC-209`. Le digest observé pendant
`TC-201` est consigné dans la fiche de tâche, mais ne remplace pas la future
preuve de provenance.

## Alternatives considérées

- **dbmate** : SQL simple et licence MIT, mais pas de verrou de migration
  concurrente ni de checksum des scripts appliqués dans la version évaluée.
- **node-pg-migrate** : bon verrou PostgreSQL et transactions, mais le contrôle
  strict du contenu des migrations reste annoncé pour une version future ; il
  apporte aussi un couplage Node inutile au schéma partagé par deux services.
- **Flyway Community** : registre, checksum et verrou robustes, mais la commande
  d'annulation des migrations n'est pas disponible dans l'édition libre.
- **Liquibase Community** : fonctionnalités riches, mais la version courante
  utilise une licence source-available différée et une chaîne Java plus lourde.
- **golang-migrate/goose** : bons formats SQL, mais historique et détection de
  dérive moins complets ou verrouillage CLI insuffisant pour ce besoin.

## Conséquences

- Les migrations n'affectent pas la latence de connexion ou de messagerie : le
  conteneur Sqitch est absent du chemin d'exécution nominal.
- Le plan et le registre Sqitch fournissent l'ordre, l'historique et le verrou
  d'exécution ; `sqitch check` compare les empreintes SHA-1 des scripts de
  déploiement au registre, et `sqitch verify` valide les propriétés SQL
  attendues.
- Le contrôle de changement de Sqitch n'est pas une preuve de supply chain :
  Git, revue, image par digest, SBOM et provenance restent requis par `TC-209`.
- La baseline historique et les cinq changements existants sont conservés
  séparément. `init.sql` devient une compatibilité transitoire, pas la source de
  vérité.
- L'adoption du registre sur une base existante est interdite dans `TC-201`.
  `TC-202` devra d'abord comparer le catalogue réel, corriger les écarts, faire
  une sauvegarde restaurable, puis enregistrer l'état sans rejouer aveuglément
  les scripts.

## Sécurité, migration et rollback

Un seul job de migration dispose du rôle DDL. Les comptes applicatifs seront
séparés et privés de DDL par `TC-203`. Les URI et mots de passe ne sont ni dans
le plan ni dans la configuration versionnée ; ils sont injectés à l'exécution.

Sur une base jetable, le cycle obligatoire est `deploy --verify`, `check`,
`revert`, puis redéploiement. Sur une base persistante, un `revert` destructif
n'est jamais automatique : privilégier un changement correctif compatible vers
l'avant ; sinon sauvegarde, aperçu, approbation, procédure de restauration et
activation explicite du garde `trust_circle.allow_destructive_revert`.

Les réversions historiques peuvent supprimer rôles, comptes et preuves
d'appareils, approbations, messages et historique de clés. Celle de
`device_key_propagation` peut en outre remettre des clés `legacy` à l'état
`active`. `pgcrypto` n'est pas supprimée automatiquement, car elle peut avoir
préexisté à la baseline ou être partagée.

## Critères de réexamen

Réexaminer cette décision si Sqitch n'est plus maintenu, si sa licence cesse
d'autoriser l'usage commercial prévu, si PostgreSQL n'est plus le moteur cible,
ou si un outil libre apporte à la fois vérification sémantique, historique
chaîné, verrouillage, réversion SQL et provenance supérieure avec un coût
opérationnel moindre.

## Références officielles

- [manuel et commandes Sqitch](https://sqitch.org/docs/manual/)
- [fonctionnement de `sqitch check`](https://sqitch.org/docs/manual/sqitch-check/)
- [image Docker Sqitch](https://sqitch.org/download/docker/)
- [licence MIT](https://github.com/sqitchers/sqitch/blob/develop/LICENSE.md)
- [version 1.6.1](https://github.com/sqitchers/sqitch/releases/tag/v1.6.1)
