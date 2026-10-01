# TC-209 — Images immuables et provenance en CI

Statut : Terminée — livraison CI, promotion staging réservée à TC-210
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

- [x] Pull requests : tests et audits sans permission de publication (contrat du workflow vérifié statiquement).
- [x] Publication limitée au dépôt canonique et à main après les contrôles.
- [x] Actions épinglées par SHA, permissions explicites et checkout sans jeton persistant.
- [x] Images linux/amd64 publiées avec labels OCI, SBOM et provenance BuildKit.
- [x] Analyse des images et provenance signée par identité OIDC temporaire.
- [x] Vérification cryptographique du digest, du dépôt, du workflow et du commit source.
- [x] Téléchargement réel par digest et vérification du runtime non-root.
- [x] Références de livraison conservées et procédure TC-210 documentée.

## Validation

Exécuter les tests/audits npm, les migrations et le smoke PostgreSQL en CI,
puis vérifier les deux images exactes dans le registre. Un workflow rouge ou
une attestation manquante interdit de considérer une image comme livrable.

Preuve du 2026-10-01 : [run 36873395448](https://github.com/antoroute/Trust-Circle/actions/runs/36873395448)
réussi, commit `f6c8fe4e43a1a149e3f54a290a02b9e418877d5a`. Les cinq jobs sont
verts : 41 tests Auth, 105 Messaging, audits npm sans avis, intégration réelle
Sqitch/PostgreSQL/HTTP/Socket.IO, deux publications analysées et signées.
Actionlint 1.7.12, ShellCheck, syntaxe Bash et `git diff --check` passent.
Le contrôle du rapport rejette les cas synthétiques vide, sans résultats et
avec avis HIGH corrigible ; il accepte le rapport sain et conserve les avis
sans correctif selon la politique documentée.

Une vérification indépendante via GitHub CLI 2.102.0 réussit pour les deux
digests et rejette le commit précédent. Le pull par digest dans LXC106 et
l'exécution isolée confirment Node 24.21.0, UID 1000, absence des gestionnaires
de paquets/runtime de développement et fonctionnement de bcrypt.

Les dépendances corrigées sont Fastify 5.12.5, fast-uri 3.1.8/4.2.1 et
ip-address 10.7.2. Les images Node 24/Trixie reçoivent les correctifs PCRE2 et
OpenSSL épinglés ; npm/npx/Yarn sont retirés de l'image finale. Les deux runs
précédents ont démontré le blocage effectif des images vulnérables corrigibles.

Non exécuté : événement pull_request réel (permissions/conditions inspectées),
tests Flutter et plateformes (aucun changement client), promotion des nouvelles
images dans le staging persistant (TC-210). Le staging garde ses quatre
services sains et sa release antérieure.

## Risques et retour arrière

La CI peut déposer une image candidate avant que son analyse soit terminée.
Seul un run réussi et une attestation vérifiée autorisent sa promotion. Un tag
est un repère ; le digest constitue la référence immuable. Les durées de
construction et vérification n'ajoutent aucun travail au parcours utilisateur.
Un échec CI ne change pas le staging. Le retrait du workflow arrête les futures
publications sans supprimer les images ni leurs preuves.

Le scan conserve 43 occurrences HIGH sur 8 CVE Debian sans correctif indiqué,
aucune CRITICAL, aucun avis applicatif et aucun HIGH corrigible. Le détail et
la porte de triage avant bêta figurent dans IMAGE_SUPPLY_CHAIN. La fermeture de
TC-209 ne constitue pas une acceptation de ces risques en production.

## Documentation

Mettre à jour IMAGE_SUPPLY_CHAIN, DEPLOYMENT, CONTAINER_HARDENING, le contexte,
la roadmap et l'index des tâches. Prochaine tâche : TC-210.
