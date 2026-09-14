# Contrôle d'accès PostgreSQL

Statut : contrat déployable (`TC-203`)
Dernière mise à jour : 2026-09-14

## Objectif

PostgreSQL utilise quatre identités distinctes. Une compromission d'un service
applicatif ne doit donner ni les droits d'administration, ni les migrations, ni
les données privées de l'autre service. Cette séparation ne crée aucun appel
supplémentaire : Auth et Messaging conservent leur connexion et leur pool
habituels avec un utilisateur PostgreSQL différent.

## Identités

| Identité | Consommateur | Capacités |
|---|---|---|
| `trust_circle_admin` | conteneur PostgreSQL et bootstrap ponctuel | superutilisateur réservé à l'initialisation et à la rotation des rôles |
| `trust_circle_migrator` | job Sqitch ponctuel | connexion, création dans la base et propriété des objets ; aucune administration de rôle/base/cluster |
| `trust_circle_auth` | service Auth | opérations d'inscription, session et grant de bootstrap uniquement |
| `trust_circle_messaging` | service Messaging | opérations de cercles, appareils, clés, conversations et messages uniquement |

Les trois rôles non administrateurs sont `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION` et `NOBYPASSRLS`. Les runtimes
n'ont ni `CREATE` sur la base ou le schéma, ni accès au schéma du registre
Sqitch.

## Matrice runtime

| Objet | Auth | Messaging |
|---|---|---|
| `users` | `SELECT`, `INSERT` | `SELECT`, `UPDATE(created_at)` |
| `refresh_tokens` + séquence | `SELECT`, `INSERT`, `DELETE`; usage/lecture séquence | aucun |
| `device_bootstrap_grants` | `SELECT`, `INSERT`, `DELETE` | `SELECT`, `UPDATE(consumed_at)` |
| tables appareils et approbations | aucun | droits nécessaires aux parcours de confiance |
| cercles, appartenances, adhésions | aucun | droits nécessaires aux parcours cercle/ACL |
| clés courantes et historiques | aucun | lecture/écriture nécessaires à publication et rotation |
| conversations et participants | aucun | lecture/insertion, accusé de lecture et verrous bornés |
| `messages` | aucun | `SELECT`, `INSERT` uniquement |
| `notifications`, `join_request_votes` | aucun | aucun |
| registre `trust_circle_sqitch` | aucun | aucun |

La liste SQL exacte et normative est
`infrastructure/postgres/deploy/runtime_database_privileges.sql`.

Les droits `UPDATE(created_at)` sur `users`, `groups` et `conversations` sont
des droits de colonne minimaux requis par PostgreSQL pour les lignes ciblées
par `SELECT ... FOR SHARE`. Ils évitent un droit `UPDATE` global : les champs
métier tels que mot de passe, nom, type ou rattachement restent interdits. Les
autres mises à jour de colonnes correspondent à des opérations applicatives
réelles et bornées.

## Distribution des secrets

Les quatre mots de passe sont des valeurs hexadécimales aléatoires de 256 bits,
stockées dans quatre fichiers distincts sous le répertoire privé frère de
`staging.env`. Le répertoire hôte est en mode `0700`, le fichier d'environnement
en `0600` et les fichiers montés en lecture seule. `staging.env` contient leurs
chemins, jamais leurs valeurs.

Compose ne place pas les mots de passe ni `DATABASE_URL` dans `Config.Env` des
conteneurs. Chaque job ou runtime lit seulement son fichier secret au
démarrage, construit sa connexion en mémoire puis lance le processus final. Le
bootstrap est le seul composant auquel les quatre secrets sont présentés ; il
se termine avant Sqitch et les services.

## Source de vérité et ordre de démarrage

1. PostgreSQL initialise seulement `trust_circle_admin`.
2. `bootstrap_roles` crée ou fait tourner les trois autres identités de façon
   idempotente et fixe leurs attributs de cluster/base.
3. Sqitch se connecte comme `trust_circle_migrator`, crée les objets et déploie
   `runtime_database_privileges` en dernier.
4. Auth et Messaging ne démarrent qu'après la réussite et la vérification du
   plan Sqitch.

La frontière cluster/base est définie par `bootstrap-roles.sql`. La matrice des
objets applicatifs est versionnée par Sqitch afin qu'un ajout de table ne soit
jamais accessible implicitement aux runtimes.

## Vérifications

`infrastructure/postgres/test-migrations.sh` construit une base jetable avec
quatre secrets distincts, lance deux migrations concurrentes, vérifie le
catalogue, exécute de vraies commandes autorisées et refusées sous chaque rôle,
puis joue le smoke applicatif complet. Il exerce enfin réversion et
redéploiement depuis zéro et supprime toutes ses ressources.

Les refus obligatoires couvrent notamment : lecture des refresh tokens par
Messaging, lecture des cercles et modification des utilisateurs par Auth,
suppression des messages, lecture du registre Sqitch et création de table par
les deux runtimes.

## Limites et rotation

- Cette séparation réduit le rayon d'impact SQL ; elle ne remplace ni les ACL
  métier ni une future politique RLS si celle-ci devient nécessaire.
- Le bootstrap administrateur reste une opération privilégiée courte. Il ne
  doit jamais rester actif comme service permanent.
- Une rotation change les fichiers concernés puis relance bootstrap, Sqitch et
  les runtimes dans cet ordre. La rotation automatisée sera traitée avec les
  travaux d'exploitation ultérieurs.
- Les secrets JWT ne sont pas encore convertis en fichiers Compose dans ce lot.
