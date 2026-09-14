# TC-203 — Séparer les comptes PostgreSQL et leurs privilèges

Statut : Terminée le 2026-09-14
Priorité : P0 sécurité et exploitation
Décision : mainteneur
Dépendances : TC-201, TC-202

## Contexte et problème

Le staging utilise encore un unique compte PostgreSQL pour l'initialisation du
cluster, les migrations et les deux services. Une compromission d'Auth ou de
Messaging donnerait donc des droits DDL et un accès à toutes les tables, dont
des données sans rapport avec le service compromis.

## Objectif mesurable

Séparer les identités administrateur, migrateur, Auth et Messaging ; distribuer
un secret distinct à chaque composant et prouver que chaque runtime peut
exécuter son parcours normal tout en étant refusé sur les tables et opérations
hors de son périmètre.

## Périmètre

- rôles PostgreSQL `trust_circle_admin`, `trust_circle_migrator`,
  `trust_circle_auth` et `trust_circle_messaging` ;
- fichiers secrets Docker distincts pour les quatre mots de passe ;
- matrice de privilèges versionnée par Sqitch ;
- bootstrap idempotent des rôles avant les migrations ;
- configuration Compose et génération des secrets staging ;
- tests backend, migrations, refus SQL et smoke staging.

## Hors périmètre

- rotation des clés JWT et conversion de tous les secrets applicatifs en
  secrets Docker ;
- row-level security et séparation en plusieurs bases ;
- production ;
- pipeline de rotation automatisée, traité avec les travaux d'exploitation
  ultérieurs.

## Invariants concernés

- invariant 8 : moindre privilège des rôles et comptes PostgreSQL ;
- invariant 24 : privilèges livrés par une migration versionnée ;
- invariant 28 : intervention limitée au staging explicitement autorisé.

## Critères d'acceptation

- [x] Chaque identité possède un mot de passe aléatoire distinct.
- [x] Les secrets DB ne figurent ni dans le fichier d'environnement ni dans la
  configuration inspectable des conteneurs runtime.
- [x] Le migrateur possède les objets sans être superuser, créateur de rôle ou
  créateur de base.
- [x] Auth ne peut lire/écrire que ses trois tables et sa séquence nécessaire.
- [x] Messaging n'accède pas aux refresh tokens et ne possède aucun droit DDL.
- [x] Aucun runtime ne peut lire le registre Sqitch, créer une table ou obtenir
  des privilèges d'administration.
- [x] Les opérations réellement utilisées par les deux services restent
  fonctionnelles avec leurs rôles restreints.
- [x] La montée, la vérification, la réversion jetable et le redéploiement
  complet réussissent.
- [x] Le staging est recréé sans donnée à conserver, puis le smoke complet
  réussit et ses fixtures sont nettoyées.
- [x] Documentation et matrice de traçabilité sont à jour.

## Résultat et preuves

- Implémentation : `2e74b544655549b3253bf4dbfd04798beb5d07c6` ;
  correctif de cohérence du smoke :
  `190abbce96a57c4714ad5501908d39cb26cefb6a`.
- Base PostgreSQL 16 jetable : deux déploiements concurrents, `check`, sept
  `verify`, tests de catalogue, commandes autorisées/refusées sous chaque rôle,
  smoke applicatif complet, réversion totale et reconstruction complète réussis.
- Suites locales : Auth `27/27`, Messaging `90/90`, zéro avis
  `npm audit --omit=dev` dans les deux services.
- Staging LXC106 recréé à vide : 17 tables, sept changements Sqitch, objets
  appartenant au migrateur, bootstrap et migration sortis avec le code `0`.
- Aucun mot de passe DB brut dans `staging.env` et aucune correspondance
  `DATABASE_URL`, `PGPASSWORD` ou mot de passe DB dans `Config.Env` des
  conteneurs bootstrap, migration, Auth ou Messaging.
- Smoke adversarial réel réussi via l'adresse staging configurée ; fixtures
  supprimées avec vérification table par table, registre Sqitch conservé.
- Auth, Messaging, PostgreSQL et Gateway sains, zéro redémarrage ; accès direct
  depuis NPM et proxy HTTPS tous deux en HTTP `200`.
- Les occurrences `Error` restantes correspondent uniquement aux rejets
  négatifs attendus `400/413` du smoke ; aucune erreur serveur `5xx`, fatale ou
  panique n'a été observée.

## Risques et retour arrière

Un privilège manquant empêche un parcours applicatif ; un privilège trop large
annule l'objectif de cloisonnement. Les tests combinent donc lecture du
catalogue, connexions réelles sous chaque rôle et smoke applicatif complet.

Le volume staging ne contenait aucune donnée à conserver et a été recréé afin
que tous les objets appartiennent réellement au migrateur. Les anciennes
releases et configurations privées sont conservées ; aucune opération
production n'a été réalisée.

## Documentation à mettre à jour

- `docs/security/DATABASE_ACCESS_CONTROL.md` ;
- `docs/operations/BACKEND_CONFIGURATION.md` ;
- `docs/operations/DEPLOYMENT.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/architecture/TRACEABILITY.md` ;
- `docs/roadmap/ROADMAP.md`.

## Prochaine tâche

`TC-204` — durcir les images, conteneurs, utilisateurs, systèmes de fichiers et
ressources.
