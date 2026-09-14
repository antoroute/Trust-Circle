# Durcissement des images et conteneurs

Statut : contrat déployable (`TC-204`)
Dernière mise à jour : 2026-09-14

## Objectif

Une compromission applicative ne doit pas obtenir automatiquement root dans le
conteneur, modifier l'image en cours d'exécution, ajouter un binaire persistant
ou disposer de capacités noyau inutiles. Les limites visent aussi à contenir un
emballement de processus ou de mémoire sans ajouter d'étape au parcours
utilisateur.

## Défenses obligatoires

Tous les conteneurs de la stack staging appliquent :

- un utilisateur explicite non-root ;
- un système de fichiers racine en lecture seule ;
- `no-new-privileges` ;
- suppression de toutes les capabilities Linux et aucune capability ajoutée ;
- limites CPU, mémoire et PID ;
- montages de code/configuration en lecture seule ;
- répertoires temporaires bornés en tmpfs avec `noexec`, `nosuid` et `nodev`.

Les images Auth et Messaging déclarent également `USER node`. Cette seconde
barrière reste valable lorsqu'une image est lancée en dehors du Compose prévu.
Leur image de base Node 20 slim est fixée par digest dans chaque étage de
build. La publication dans un registre, le SBOM et la provenance signée restent
du ressort de `TC-209`/`TC-805`.

## Écritures autorisées

| Service | Écritures persistantes | Écritures temporaires |
|---|---|---|
| PostgreSQL | `/var/lib/postgresql/data` seulement | `/tmp`, `/var/run/postgresql` |
| Auth | aucune | `/tmp` |
| Messaging | aucune | `/tmp` |
| Gateway | aucune | cache Nginx, `/var/run`, `/tmp` |
| Sqitch | aucune | `/tmp` |
| Bootstrap/privilèges | aucune | `/tmp` ; masque vide en lecture seule sur le `VOLUME` hérité de l'image PostgreSQL |

Le masque en lecture seule de `/var/lib/postgresql/data` sur les jobs ponctuels
est nécessaire car l'image officielle PostgreSQL déclare ce chemin comme
`VOLUME`. Sans masque explicite, Docker crée un volume anonyme inscriptible et
inutile pour chaque job.

PostgreSQL utilise l'utilisateur de l'image `postgres` (UID/GID 70 dans le
digest Alpine actuellement fixé). Les UID des tmpfs sont explicites ; une mise
à jour d'image qui les modifie doit donc échouer au test plutôt que dégrader
silencieusement la posture.

## Preuves automatisées

`infrastructure/postgres/test-migrations.sh` inspecte les conteneurs réels et
échoue si l'utilisateur, le rootfs, les capabilities, `no-new-privileges`, les
limites ou les montages divergent. Il tente aussi :

- une écriture à la racine, qui doit échouer ;
- une écriture dans le tmpfs prévu, qui doit réussir ;
- l'initialisation PostgreSQL sur volume vide ;
- migrations, smoke, réversion et redéploiement complets sous contraintes.

Avant staging, une sonde séparée crée une ligne PostgreSQL sur un volume
jetable, supprime puis recrée le conteneur durci et exige que la ligne soit
toujours présente. Le déploiement staging ne doit jamais supprimer son volume
pour appliquer TC-204.

## Performance et disponibilité

Le durcissement ne change ni le protocole, ni le nombre de requêtes, ni le
chemin cryptographique. Les quotas Compose sont des plafonds de protection, pas
des temporisations. Les healthchecks et le smoke doivent réussir avec ces
plafonds ; la charge/capacité complète reste à mesurer dans `TC-806`.

## Limites

- Le LXC Docker reste partagé et privilégié : le confinement du conteneur ne
  transforme pas cette plateforme en frontière de sécurité forte.
- Le profil seccomp par défaut de Docker reste utilisé ; un profil personnalisé
  exige des traces représentatives et une tâche dédiée pour éviter les
  régressions multi-architecture.
- Les images backend sont encore construites localement sur le staging et non
  publiées avec provenance ; voir `TC-209`.
- La sécurité hôte, les mises à jour du moteur Docker et l'accès administratif
  restent des contrôles d'exploitation distincts.
