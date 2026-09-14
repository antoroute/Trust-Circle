# TC-204 — Durcir les images et conteneurs

Statut : Terminée
Priorité : P0 sécurité et exploitation
Décision : mainteneur
Dépendances : TC-004, TC-203

## Contexte et problème

Le staging limite déjà Auth, Messaging, Gateway et les jobs ponctuels, mais les
images backend n'imposent pas elles-mêmes leur utilisateur et PostgreSQL garde
un rootfs inscriptible, le jeu de capabilities par défaut et un processus init
root. Le comportement réel doit être durci et prouvé sans casser la
persistance, les migrations ou les budgets de réponse.

## Objectif mesurable

Faire fonctionner tous les composants avec un utilisateur explicite non-root,
un rootfs en lecture seule hors montages nécessaires, aucune capability Linux,
`no-new-privileges`, des limites CPU/mémoire/PID et seulement les écritures
temporaires ou persistantes prévues.

## Périmètre

- images Auth et Messaging et leur utilisateur par défaut ;
- conteneur PostgreSQL staging et test de migrations ;
- vérification effective des utilisateurs, capabilities, rootfs et montages ;
- tests backend, migrations, redémarrage persistant et smoke staging ;
- documentation de la posture et du rollback.

## Hors périmètre

- publication des images et provenance distante, traitées par `TC-209` ;
- isolation ou dé-privilégiement du LXC partagé ;
- règles réseau et proxy déjà traitées ;
- production ;
- observabilité et redaction des logs, traitées par `TC-206`.

## Critères d'acceptation

- [x] Les images Auth et Messaging déclarent un utilisateur runtime non-root.
- [x] PostgreSQL démarre directement non-root, sans capability et avec
  `no-new-privileges`.
- [x] Les six conteneurs ont un rootfs en lecture seule ; seuls le volume DB et
  les tmpfs explicitement nécessaires sont inscriptibles.
- [x] Chaque service conserve des limites CPU, mémoire et PID explicites.
- [x] Une écriture hors montage autorisé échoue réellement dans les conteneurs
  persistants.
- [x] PostgreSQL initialise un volume vide, redémarre avec le même volume et
  conserve les données.
- [x] Les migrations complètes, leur réversion jetable, les tests backend et le
  smoke adversarial réussissent.
- [x] Le staging reste vide après smoke, sain, sans redémarrage ni erreur 5xx.
- [x] Documentation, inventaire et roadmap sont à jour.

## Réalisation

Les commits applicatifs `c2d388a16bb0c5381904c4e05371936866a43db0`
et `079263be9dfa1304e36d9f24b526d138666a79ab` ont :

- épinglé les deux étapes des images Auth et Messaging sur l'image Node 20 par
  digest et déclaré `USER node` dans les images finales ;
- imposé à PostgreSQL l'utilisateur `postgres`, un rootfs en lecture seule,
  `no-new-privileges`, aucune capability et deux tmpfs bornés pour ses seuls
  besoins temporaires ;
- appliqué la même posture aux jobs bootstrap et Sqitch, avec respectivement
  les utilisateurs `postgres` et `sqitch` ;
- conservé pour les six composants des budgets CPU, mémoire et PID explicites ;
- masqué le `VOLUME` inutilisé de l'image PostgreSQL dans le job bootstrap par
  un bind vide suivi en Git et monté en lecture seule, afin de ne créer aucun
  volume Docker anonyme ;
- rendu le smoke Socket.IO robuste aux réponses de polling réparties sur
  plusieurs requêtes, sans augmenter le délai du chemin utilisateur réel.

## Preuves du 2026-09-14

Avant le déploiement, un PostgreSQL jetable soumis à la posture finale a été
initialisé, écrit, arrêté puis redémarré. La ligne de contrôle a survécu au
redémarrage et toute écriture sur le rootfs a été refusée. La suite isolée a
ensuite validé les sept migrations, leurs vérifications, la réversion complète,
un nouveau déploiement, la séparation réelle des privilèges et le smoke
PostgreSQL/HTTP/Socket.IO.

Les suites locales Auth et Messaging passent respectivement `27/27` et
`90/90`, et les deux audits npm ne signalent aucune vulnérabilité connue. Ce
contrôle npm ne remplace pas l'analyse des images/SBOM prévue par `TC-209` et
`TC-805`.

Le staging a été déployé depuis
`079263be9dfa1304e36d9f24b526d138666a79ab`. Les inspections Docker prouvent :

- utilisateurs `postgres`, `postgres`, `sqitch`, `node`, `node` et `101:101`
  pour PostgreSQL, bootstrap, migration, Auth, Messaging et Gateway ;
- `ReadonlyRootfs=true`, `no-new-privileges:true`, `CapDrop=[ALL]` et limites
  non nulles sur les six conteneurs ;
- refus effectif d'une écriture à la racine des quatre services persistants ;
- jobs bootstrap et migration terminés en code `0`, quatre services sains et
  aucun redémarrage ;
- aucun volume anonyme laissé par les jobs ; le volume nommé staging a gardé
  sa date de création `2026-09-14T18:34:16+02:00` après redémarrage ;
- assertions de schéma et de séparation des rôles réussies, sept changements
  Sqitch et zéro ligne dans chacune des 17 tables publiques après nettoyage ;
- zéro réponse 5xx Auth/Messaging dans la fenêtre finale ;
- réponses `200` sur les trois routes de santé, depuis NPM vers
  `10.0.20.20:18081` et via `https://trust-circle.kavalek.fr`.

## Rollback exercé et disponible

La réversion complète a été exercée uniquement sur la base jetable. Sur le
staging, les configurations antérieures sont conservées en mode `0600` sous
`staging.env.before-c2d388a16bb0` et `staging.env.before-079263be9dfa`, et les
releases antérieures restent présentes. Un rollback applicatif consiste à
repointer `current`, restaurer la configuration correspondante et recréer les
conteneurs sans `--volumes`. Le volume nommé ne doit pas être supprimé.

## Risques et rollback

Le principal risque était d'empêcher PostgreSQL d'initialiser ou d'écrire ses
fichiers PID/socket/temporaire. Le changement a donc été testé sur un volume
Docker jetable, puis par la suite de migrations complète. Le volume staging
n'a pas été supprimé dans TC-204. Les releases/configurations précédentes
restent disponibles pour repointer et recréer les conteneurs sans toucher aux
données.

## Documentation à mettre à jour

- `docs/security/CONTAINER_HARDENING.md` ;
- `deploy/staging/README.md` ;
- `docs/operations/DEPLOYMENT.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/roadmap/ROADMAP.md`.

## Prochaine tâche

`TC-205` — retirer Redis ou documenter son absence du chemin applicatif et de
la stack cible.
