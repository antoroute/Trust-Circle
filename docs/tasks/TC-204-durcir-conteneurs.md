# TC-204 — Durcir les images et conteneurs

Statut : En cours
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

- [ ] Les images Auth et Messaging déclarent un utilisateur runtime non-root.
- [ ] PostgreSQL démarre directement non-root, sans capability et avec
  `no-new-privileges`.
- [ ] Les six conteneurs ont un rootfs en lecture seule ; seuls le volume DB et
  les tmpfs explicitement nécessaires sont inscriptibles.
- [ ] Chaque service conserve des limites CPU, mémoire et PID explicites.
- [ ] Une écriture hors montage autorisé échoue réellement dans les conteneurs
  persistants.
- [ ] PostgreSQL initialise un volume vide, redémarre avec le même volume et
  conserve les données.
- [ ] Les migrations complètes, leur réversion jetable, les tests backend et le
  smoke adversarial réussissent.
- [ ] Le staging reste vide après smoke, sain, sans redémarrage ni erreur 5xx.
- [ ] Documentation, inventaire et roadmap sont à jour.

## Risques et rollback

Le principal risque est d'empêcher PostgreSQL d'initialiser ou d'écrire ses
fichiers PID/socket/temporaire. Le changement sera d'abord testé sur un volume
Docker jetable, puis par la suite de migrations complète. Le volume staging ne
sera pas supprimé dans TC-204. Les releases/configurations précédentes restent
disponibles pour repointer et recréer les conteneurs sans toucher aux données.

## Documentation à mettre à jour

- `docs/security/CONTAINER_HARDENING.md` ;
- `deploy/staging/README.md` ;
- `docs/operations/DEPLOYMENT.md` ;
- `docs/operations/STAGING_INVENTORY.md` ;
- `docs/roadmap/ROADMAP.md`.

## Prochaine tâche

`TC-205` — retirer Redis ou documenter son absence du chemin applicatif et de
la stack cible.
