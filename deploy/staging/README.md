# Déploiement staging

Cette stack remplace les anciens projets génériques `app` et `infra`. Son nom Docker Compose est toujours `trust-circle-staging`.

## Propriétés

- PostgreSQL dédié et volume `trust-circle-staging-postgres-data`.
- Schéma construit exclusivement par le job ponctuel Sqitch avant le démarrage
  d'Auth et Messaging ; aucun SQL d'initialisation Docker parallèle.
- Réseaux `trust-circle-staging-edge` et `trust-circle-staging-data`.
- Réseau edge dédié et adressage statique : gateway `172.30.108.10`, Auth
  `172.30.108.11`, Messaging `172.30.108.12` dans `172.30.108.0/24`.
- Les services backend ne font confiance qu'à la gateway (`172.30.108.10/32`)
  pour les en-têtes proxy ; aucune origine navigateur n'est autorisée tant que
  le staging reste réservé aux clients natifs.
- Redis absent : aucun code backend actuel ne l'utilise.
- Auth/messaging non publiés sur l'hôte.
- Gateway liée par défaut uniquement à `127.0.0.1:18080`. Une adresse interne
  différente exige `TC_STAGING_BIND_ADDRESS`, un port dédié, un filtrage réseau
  limité à NPM et la procédure `TC-113` ; ne jamais utiliser `0.0.0.0`.
- Secrets générés hors dépôt : configuration en `0600`, répertoire de mots de
  passe PostgreSQL en `0700` et quatre fichiers distincts montés en lecture
  seule. Les valeurs DB ne figurent pas dans le fichier d'environnement ni
  dans la configuration Docker inspectable des runtimes.
- Images backend étiquetées avec le commit et la version de staging.
- Images backend basées sur Node fixé par digest et déclarant `USER node`.
- Images PostgreSQL/Nginx fournies par digest dans le fichier d'environnement privé.
- Configuration backend validée avant écoute selon `docs/operations/BACKEND_CONFIGURATION.md` ; aucun fallback de secret ou de connexion PostgreSQL.
- Tous les services utilisent un rootfs en lecture seule, un utilisateur
  non-root, `no-new-privileges`, `cap_drop: ALL` et des limites de ressources.
  PostgreSQL écrit seulement dans son volume et ses deux tmpfs dédiés.

## Déploiement sur LXC106

Le code source est copié dans un répertoire de release sous `/opt/trust-circle-staging/releases/<commit>`. La configuration reste dans `/opt/trust-circle-staging/shared/staging.env` et les quatre mots de passe PostgreSQL dans son répertoire frère `staging.env.d`.

1. Tirer les tags officiels approuvés, puis relever leurs `RepoDigests`.
2. Créer le fichier privé une seule fois :

```bash
bash deploy/staging/generate-env.sh \
  /opt/trust-circle-staging/shared/staging.env \
  <FULL_COMMIT> staging-<SHORT_COMMIT> \
  postgres@sha256:<DIGEST> nginx@sha256:<DIGEST> \
  sqitch/sqitch@sha256:<DIGEST>
```

3. Valider sans afficher la configuration résolue :

```bash
docker compose \
  --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml config --quiet
```

4. Construire et démarrer. Compose attend d'abord le bootstrap réussi des rôles,
   puis la fin réussie du job `migrate`, avant de lancer Auth et Messaging :

```bash
docker compose \
  --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml up -d --build
```

Vérifier que les deux jobs sont sortis avec le code `0` et que Sqitch connaît les sept
changements avant les smoke tests :

```bash
docker compose --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml ps --all
```

Ne pas employer `docker-entrypoint-initdb.d` ni exécuter `init.sql` : le plan
`infrastructure/postgres/sqitch.plan` est l'unique source de vérité.

Le passage à l'IPAM explicite recrée le réseau edge au premier déploiement de
ce changement. Vérifier que la stack `trust-circle-staging` est la cible,
arrêter uniquement cette stack puis la relancer sans `--volumes`; le volume
PostgreSQL n'est pas concerné. Ne jamais supprimer un réseau ou volume partagé
sans avoir démontré son absence d'usage.

Le durcissement PostgreSQL de `TC-204` ne requiert aucune recréation de volume.
Avant remplacement du conteneur, vérifier que le processus PostgreSQL courant
utilise bien l'UID attendu par le digest épinglé. Après démarrage, contrôler les
flags effectifs Docker et tenter une écriture refusée hors des tmpfs/volume,
selon `docs/security/CONTAINER_HARDENING.md`.

5. Attendre les healthchecks puis exécuter :

```bash
bash deploy/staging/smoke-test.sh \
  /opt/trust-circle-staging/shared/staging.env
```

Le smoke test lance aussi, dans le conteneur Messaging, le parcours réel de
confiance d'appareil : réauthentification du bootstrap, preuve Ed25519,
rejet du rejeu, second appareil `pending`, approbation/refus signés, isolation
du registre, preuve d'accès liée au token, publication et rotation signées des
clés de cercle, conservation de l'historique, refus des versions obsolètes et
course entre publication et révocation globale. Il vérifie ensuite le blocage
immédiat de l'appareil révoqué et la disponibilité des anciens messages. Il ne
journalise aucun mot de passe, token, grant ou matériel privé.

Le parcours crée et connecte ses comptes, renouvelle l'access token avec le
refresh token, puis appelle Messaging sans aucun secret d'application partagé.
Il vérifie également qu'une route Messaging reste refusée sans access token.

Depuis `TC-111`, il exerce aussi trois comptes réels et les rôles
propriétaire/administrateur/membre : accès croisés cercle, conversation,
messages et clés, preuve d'appareil altérée, appareil en attente ou révoqué,
usurpation d'expéditeur, traitement d'adhésion et élévation de rôle. Les refus
critiques sont suivis d'une lecture PostgreSQL via l'API afin de confirmer que
l'état métier est resté inchangé.

Ne jamais exécuter `docker compose config` sans `--quiet` dans une sortie partagée : la configuration résolue contient des secrets.

## Inspection sûre

```bash
docker compose --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml ps
```

Pour documenter les variables, extraire uniquement leurs noms via `docker inspect` et `jq`; ne pas copier la sortie brute. Les conteneurs Auth, Messaging et migration ne doivent exposer ni mot de passe, ni `PGPASSWORD`, ni `DATABASE_URL` dans `Config.Env`.

## Accès client

La première livraison est volontairement locale au LXC. L'ajout d'un domaine staging TLS, d'une restriction d'accès et d'une configuration Flutter dédiée reste requis avant un test sur appareil physique. Aucun client ne doit utiliser les domaines de production historiques.

Pour `TC-113`, le seul bind interne autorisé est `10.0.20.20:18081`. Installer
au préalable les deux fichiers de `host/` dans `/usr/local/sbin` et
`/etc/systemd/system`, puis activer le service. La chaîne `DOCKER-USER`
n'autorise sur ce port que NPM `10.0.10.20` et l'hôte Docker lui-même. Le
loopback historique `127.0.0.1:18080` n'est pas conservé simultanément.

## Destruction du staging

La suppression du volume PostgreSQL est irréversible. Elle exige une autorisation explicite distincte et une résolution exacte du projet :

```bash
docker compose --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml down
```

La commande ci-dessus conserve volontairement le volume. Ne pas ajouter `--volumes` sans décision explicite sur les données de staging.
