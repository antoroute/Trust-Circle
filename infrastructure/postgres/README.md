# Schéma PostgreSQL et migrations

La source de vérité du schéma est le plan Sqitch `sqitch.plan`. Il reconstruit
la baseline V2 historique puis les cinq changements appliqués pendant TC-104 à
TC-106. Depuis `TC-202`, le staging est lui aussi construit exclusivement par
Sqitch. Le fichier `init.sql` est une archive historique : ne pas l'utiliser
pour une nouvelle base.

## Règles

- utiliser Sqitch 1.6.1 sous licence MIT ;
- ajouter un changement, ne jamais modifier un changement déployé ;
- fournir `deploy/<change>.sql`, `revert/<change>.sql` et
  `verify/<change>.sql` ;
- garder les scripts transactionnels, sauf impossibilité PostgreSQL documentée ;
- ne jamais mettre d'URI, d'utilisateur ou de mot de passe dans `sqitch.conf` ;
- exécuter un unique job de migration avec un rôle DDL, avant les services ;
- ne jamais lancer automatiquement un `revert` sur une base persistante.

Tous les scripts de réversion sont bloqués hors de la base jetable
`trust_circle_migration_test`. Une intervention persistante exige en plus une
activation explicite de session :

```bash
PGOPTIONS='-c trust_circle.allow_destructive_revert=on' sqitch revert ...
```

Cette option ne remplace ni la sauvegarde, ni la lecture du SQL, ni
l'approbation. Plusieurs réversions suppriment des comptes/appareils, rôles,
approbations, messages ou historiques de clés ; `device_key_propagation`
réactive aussi le matériel `legacy`. L'extension `pgcrypto` n'est jamais
supprimée automatiquement, car elle peut préexister au projet.

## Test reproductible

Depuis ce répertoire, sur un hôte Docker :

```bash
bash test-migrations.sh
```

Le script utilise PostgreSQL 16 et Sqitch par digests, un mot de passe aléatoire
éphémère, un réseau interne et un projet Compose unique. Il démontre deux
déploiements concurrents, la vérification, le no-op, la réversion complète sur
base jetable puis le redéploiement. Le volume et le secret éphémère sont
supprimés à la fin.

Pour une cible réelle, injecter les informations de connexion au runtime selon
la documentation Sqitch. Le staging a été recréé à vide et adopté par `TC-202`.
Ne jamais rejouer cette baseline sur une base non vide ou adopter une autre base
persistante sans procédure dédiée.
