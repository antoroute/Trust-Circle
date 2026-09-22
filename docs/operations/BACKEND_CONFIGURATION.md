# Configuration des services backend

Statut : contrat opérationnel (`TC-101`, `TC-108`, `TC-109`, `TC-203`, `TC-206`)
Dernière mise à jour : 2026-09-22

Les services Auth et Messaging valident toute leur configuration avant de créer le serveur Fastify ou d'écouter sur le réseau. Les valeurs réelles restent dans le mécanisme de secrets de chaque environnement et ne doivent jamais être affichées, copiées dans Git ou placées dans une commande susceptible d'être journalisée.

## Variables

| Variable | Classe | Obligatoire | Validation |
|---|---|---:|---|
| `NODE_ENV` | opérationnelle | oui | `development`, `test`, `staging` ou `production` |
| `LOG_LEVEL` | opérationnelle | non | `fatal`, `error`, `warn`, `info`, `debug` ou `trace` ; défaut `info` |
| `JWT_ACCESS_PRIVATE_KEY_B64` | clé privée Ed25519 encodée | oui dans Auth seulement | base64 canonique d'une clé PKCS#8 correspondant à la clé publique |
| `JWT_ACCESS_PUBLIC_KEY_B64` | clé publique Ed25519 encodée | oui | base64 canonique d'une clé SPKI Ed25519 ; vérification seule dans Messaging |
| `JWT_REFRESH_SECRET` | secret serveur Auth uniquement | oui pour Auth | distinct de la clé access, mêmes contrôles minimaux |
| `DATABASE_URL` | secret serveur | oui | URL `postgres://` ou `postgresql://` avec hôte, base, utilisateur et mot de passe |
| `PORT` | opérationnelle | non | entier de 1 à 65535 ; défaut interne 3000 pour Auth et 3001 pour Messaging |
| `CORS_ALLOWED_ORIGINS` | sécurité réseau | non | liste CSV d'origines HTTPS exactes ; vide/absente interdit tout navigateur mais conserve les clients natifs |
| `TRUSTED_PROXY_CIDRS` | sécurité réseau | oui en staging/production | liste CSV de CIDR exacts ; jamais `true`, joker ou nombre de sauts implicite |

Depuis `TC-109`, aucun secret d'application partagé n'est attendu : une valeur
embarquée dans un client public serait extractible et ne prouverait pas son
origine. Les accès reposent sur les jetons JWT typés et, pour Messaging, sur la
preuve Ed25519 d'un appareil actif.

La clé privée access et la clé refresh ne sont jamais injectées dans Messaging : même une compromission de ce service ne lui donne pas la capacité de signer un access token ou d'accepter/émettre un refresh token. Le contrat complet est dans `docs/security/TOKEN_CONTRACT.md`.

## Comportement d'échec

- Une variable obligatoire absente, vide ou invalide arrête le processus avec un code non nul avant l'écoute réseau.
- Le message d'erreur nomme seulement la variable et la règle violée ; il ne reproduit jamais sa valeur.
- Aucune configuration de développement implicite n'existe. Un développeur utilise exclusivement des valeurs synthétiques explicitement injectées.
- La paire Ed25519 doit être valide et correspondante.
- Une valeur `LOG_LEVEL` inconnue arrête également le processus avant écoute ;
  le niveau ne modifie jamais les interdictions de données de la politique de
  journalisation.

## Staging

Compose exige `TC_DB_NAME`, les quatre chemins
`TC_DB_ADMIN_PASSWORD_FILE`, `TC_DB_MIGRATOR_PASSWORD_FILE`,
`TC_AUTH_DB_PASSWORD_FILE`, `TC_MESSAGING_DB_PASSWORD_FILE`, ainsi que les
variables JWT. Les mots de passe DB ne figurent pas dans le fichier
d'environnement. Chaque composant lit uniquement son secret Docker monté en
lecture seule et construit `DATABASE_URL` au démarrage, sans l'inscrire dans la
configuration inspectable du conteneur. Le fichier privé reste
`/opt/trust-circle-staging/shared/staging.env`, mode `0600`, et son répertoire
frère `staging.env.d` est en mode `0700`.

Les rôles et privilèges associés sont normatifs dans
`docs/security/DATABASE_ACCESS_CONTROL.md`.

Compose injecte une liste CORS vide, l'adresse `/32` fixe de la gateway staging
et explicitement `LOG_LEVEL=info`. La configuration est vérifiée sans
résolution visible :

```bash
docker compose \
  --project-name trust-circle-staging \
  --env-file /opt/trust-circle-staging/shared/staging.env \
  -f deploy/staging/compose.yml config --quiet
```

Ne jamais exécuter la même commande sans `--quiet` dans une sortie partagée.

## Rotation et rollback

Une rotation future doit coordonner tous les consommateurs, reconstruire les connexions et invalider les jetons lorsque la clé JWT change. Le rollback applicatif revient à l'image précédemment validée ; il ne doit jamais réintroduire une valeur par défaut. Un échec dû à une configuration manquante se corrige dans le mécanisme de secrets de l'environnement, après vérification du nom de variable, sans révéler sa valeur.
