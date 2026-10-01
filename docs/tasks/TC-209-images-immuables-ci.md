# TC-209 — Images immuables et provenance en CI

Statut : En cours
Priorité : P0 livraison
Responsable : mainteneur
Dépendance : TC-204

## Objectif et périmètre

Construire Auth et Messaging sur GitHub Actions, publier dans GHCR et fournir
des références par digest avec SBOM et provenance signée vérifiable. Les images
doivent provenir du commit testé. Les runners sont hébergés par GitHub et ne
possèdent aucun accès au homelab. Le déploiement/rollback relève de TC-210.

Le contrôle initial du 2026-10-01 révèle trois dépendances affectées par de
nouveaux avis npm et Node 20 en fin de support. Ce lot corrige Fastify et ses
dépendances transitives concernées, puis adopte Node 24 LTS avec base Docker
épinglée par digest. La régression sera vérifiée par les suites et le scénario
PostgreSQL jetable existants.

## Critères d'acceptation

- [ ] Pull requests : tests et audits sans permission de publication.
- [ ] Publication limitée au dépôt canonique et à main après les contrôles.
- [ ] Actions épinglées par SHA, permissions explicites et checkout sans jeton persistant.
- [ ] Images linux/amd64 publiées avec labels OCI, SBOM et provenance BuildKit.
- [ ] Analyse des images et provenance signée par identité OIDC temporaire.
- [ ] Vérification cryptographique du digest, du dépôt, du workflow et du commit source.
- [ ] Téléchargement réel par digest et vérification du runtime non-root.
- [ ] Références de livraison conservées et procédure TC-210 documentée.

## Validation

Exécuter les tests/audits npm, les migrations et le smoke PostgreSQL en CI,
puis vérifier les deux images exactes dans le registre. Un workflow rouge ou
une attestation manquante interdit de considérer une image comme livrable.

## Risques et retour arrière

La CI peut déposer une image candidate avant que son analyse soit terminée.
Seul un run réussi et une attestation vérifiée autorisent sa promotion. Un tag
est un repère ; le digest constitue la référence immuable. Les durées de
construction et vérification n'ajoutent aucun travail au parcours utilisateur.
Un échec CI ne change pas le staging. Le retrait du workflow arrête les futures
publications sans supprimer les images ni leurs preuves.

## Documentation

Mettre à jour IMAGE_SUPPLY_CHAIN, DEPLOYMENT, CONTAINER_HARDENING, le contexte,
la roadmap et l'index des tâches. Prochaine tâche : TC-210.
