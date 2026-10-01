# Images backend : construction et vérification

Statut : implémentation TC-209, première exécution en cours
Dernière mise à jour : 2026-10-01

## Chaîne de livraison

`.github/workflows/backend-images.yml` exécute sur runners GitHub Ubuntu :

1. les deux suites Node 24, audits npm runtime et complets ;
2. les migrations Sqitch, la séparation des rôles, le durcissement et le smoke
   adversarial contre PostgreSQL jetable ;
3. sur `main` du dépôt canonique seulement, la construction depuis le contexte
   Git du commit testé et la publication de deux images `linux/amd64` ;
4. l'analyse Trivy du digest publié : les vulnérabilités HIGH/CRITICAL avec
   correctif disponible bloquent la suite ; le rapport complet reste conservé ;
5. l'inspection du SBOM SPDX, de la provenance BuildKit et du runtime non-root ;
6. la signature de provenance via GitHub OIDC, puis sa vérification et un test
   négatif exigeant le refus d'un autre commit.

Les pull requests ne publient rien. Les jobs de validation disposent seulement
de `contents: read`. Le job de publication ajoute les permissions packages,
attestations et OIDC. Aucun secret durable ni accès au homelab n'est fourni.
Les actions sont fixées par SHA complet ; les images Node des Dockerfiles sont
fixées par digest. Les mises à jour demandent une revue et un nouveau run.

## Références

- `ghcr.io/antoroute/circlehaven-auth@sha256:<digest>`
- `ghcr.io/antoroute/circlehaven-messaging@sha256:<digest>`

Le tag contient le commit complet, l'identifiant du run et sa tentative. Il ne
constitue pas une garantie d'immuabilité : seule la référence `@sha256:` est
utilisée pour la promotion. Aucun tag `latest` n'est publié.

Les artefacts `image-evidence-<service>-<commit>-<tentative>` gardent pendant
90 jours le rapport Trivy, le SBOM, les provenances, le résultat de vérification
et `release.json` (image, commit, run, plateforme). Une livraison exige que le
workflow complet soit réussi, donc les deux images validées. Avant publication
réelle, conserver ces preuves avec le dossier de release au-delà des 90 jours.

## Vérification avant promotion

Installer GitHub CLI récent avec `gh attestation verify`, et Docker pour le
pull. Pour un package privé, fournir des identifiants de lecture via le
gestionnaire de credentials, sans les placer dans un script ou un argument.
Choisir le commit et les digests depuis un run réussi et revu, puis :

```bash
bash deploy/ci/verify-image.sh \
  ghcr.io/antoroute/circlehaven-auth@sha256:<digest-auth> <commit>
bash deploy/ci/verify-image.sh \
  ghcr.io/antoroute/circlehaven-messaging@sha256:<digest-messaging> <commit>
docker pull ghcr.io/antoroute/circlehaven-auth@sha256:<digest-auth>
docker pull ghcr.io/antoroute/circlehaven-messaging@sha256:<digest-messaging>
```

Le vérificateur refuse les tags, dépôts et noms d'image inattendus. Il exige
une signature valide, le dépôt canonique, le workflow exact, `refs/heads/main`,
le commit source et celui du workflow attendus, et un runner hébergé GitHub.
Le digest vérifié est celui transmis ensuite à Docker ; aucun tag intermédiaire
ne doit être résolu après la vérification.

## Limites et TC-210

Une provenance prouve l'origine et l'intégrité ; elle ne prouve pas l'absence
de vulnérabilité. Le rapport complet peut contenir des avis de sévérité moindre
ou sans correctif : ils doivent être triés avant la bêta. La sécurité du compte
mainteneur et la revue des changements du workflow restent essentielles.

Le staging en service conserve sa release précédente. TC-210 remplacera les
builds locaux par les deux références vérifiées, exercera migration, smoke et
rollback, et consignera la paire de digests. Les images PostgreSQL, Nginx et
Sqitch restent des images tierces épinglées dans la configuration de déploiement.
Le Dockerfile PostgreSQL historique n'est pas publié par ce workflow.

## Références officielles

- [Attestations Docker et SBOM](https://docs.docker.com/build/ci/github-actions/attestations/)
- [Attestations GitHub](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [Vérification avec GitHub CLI](https://cli.github.com/manual/gh_attestation_verify)
- [Cycle de support Node.js](https://nodejs.org/en/about/previous-releases)
