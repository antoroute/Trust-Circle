# TC-203 — Séparer les comptes PostgreSQL et leurs privilèges

Statut : En cours
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

- [ ] Chaque identité possède un mot de passe aléatoire distinct.
- [ ] Les secrets DB ne figurent ni dans le fichier d'environnement ni dans la
  configuration inspectable des conteneurs runtime.
- [ ] Le migrateur possède les objets sans être superuser, créateur de rôle ou
  créateur de base.
- [ ] Auth ne peut lire/écrire que ses trois tables et sa séquence nécessaire.
- [ ] Messaging n'accède pas aux refresh tokens et ne possède aucun droit DDL.
- [ ] Aucun runtime ne peut lire le registre Sqitch, créer une table ou obtenir
  des privilèges d'administration.
- [ ] Les opérations réellement utilisées par les deux services restent
  fonctionnelles avec leurs rôles restreints.
- [ ] La montée, la vérification, la réversion jetable et le redéploiement
  complet réussissent.
- [ ] Le staging est recréé sans donnée à conserver, puis le smoke complet
  réussit et ses fixtures sont nettoyées.
- [ ] Documentation et matrice de traçabilité sont à jour.

## Risques et retour arrière

Un privilège manquant empêche un parcours applicatif ; un privilège trop large
annule l'objectif de cloisonnement. Les tests combinent donc lecture du
catalogue, connexions réelles sous chaque rôle et smoke applicatif complet.

Le volume staging ne contient aucune donnée à conserver. Il pourra être recréé
une nouvelle fois afin que tous les objets appartiennent réellement au
migrateur. L'ancienne release et la configuration privée seront conservées ;
aucune opération production n'est autorisée.

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
