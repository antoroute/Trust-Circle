# Images backend : construction et vérification

Statut : TC-209 validée, images publiées et vérifiées indépendamment
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

La base finale est Node 24.21.0 / Debian 13 Trixie slim. Les versions de PCRE2
(`10.46-1~deb13u3`) et OpenSSL (`3.5.7-1~deb13u3`) sont fixées explicitement
pour intégrer les correctifs publiés après l'image amont. Les paquets sont
vérifiés par APT. Si ces versions quittent les dépôts, une reconstruction peut
échouer : il faudra mettre à jour les versions après revue, et non retirer
l'épinglage. La promotion réutilise toujours les images déjà construites.
Les gestionnaires npm/npx/Yarn sont absents du runtime final.

## Références

- `ghcr.io/antoroute/circlehaven-auth@sha256:<digest>`
- `ghcr.io/antoroute/circlehaven-messaging@sha256:<digest>`

Les deux packages sont publics et rattachés au dépôt public
`antoroute/Trust-Circle`. Les attestations publiques sont inscrites dans le
journal de transparence Sigstore. Elles ne contiennent aucun secret de build.

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

## Première livraison vérifiée — 2026-10-01

Le [run 36873395448](https://github.com/antoroute/Trust-Circle/actions/runs/36873395448)
a réussi ses cinq jobs pour le commit
`f6c8fe4e43a1a149e3f54a290a02b9e418877d5a`. La paire de digests est conservée dans
`deploy/releases/f6c8fe4e43a1a149e3f54a290a02b9e418877d5a.json`.
Les deux archives de preuves CI et les vérifications indépendantes sont aussi
conservées en mode `0600` sous
`/root/homelab/sauvegardes/incidents/tc209-ci-20261001/`, hors de la rétention
de 90 jours des artefacts GitHub.

Les 41 tests Auth et 105 tests Messaging, les audits npm complets/runtime et
l'intégration PostgreSQL passent sur Node 24. Les deux preuves ont également
été vérifiées depuis le serveur de travail avec GitHub CLI 2.102.0. Une demande
de vérification contre le commit précédent `aec529c…` est refusée pour les
deux images. Le téléchargement public par digest dans LXC106 puis une
exécution éphémère sans réseau confirment l'UID 1000, Node 24.21.0, l'absence
de npm/Yarn/TypeScript et le fonctionnement de bcrypt. Aucun service staging
n'a été remplacé et aucun conteneur de test ne subsiste.

Le scan Trivy final de chacune des deux images contient zéro avis applicatif,
zéro CRITICAL et zéro HIGH avec correctif. Il conserve 43 occurrences HIGH
(8 CVE uniques), 57 MEDIUM, 59 LOW et 2 UNKNOWN. Les 8 CVE HIGH sont :

| Famille Debian | CVE sans correctif indiqué par le scan |
|---|---|
| util-linux et bibliothèques associées | CVE-2026-76642, CVE-2026-78408, CVE-2026-78409, CVE-2026-78410 |
| libacl | CVE-2026-54369 |
| bibliothèques systemd | CVE-2026-16742 |
| ncurses | CVE-2025-69720 |
| perl-base | CVE-2026-9538 |

Une CVE peut apparaître sur plusieurs paquets du même projet ; 43 occurrences
ne signifient pas 43 failles distinctes. Le runtime non-root, les capabilities
retirées et le rootfs en lecture seule réduisent certaines possibilités
d'exploitation, sans constituer une démonstration de non-exploitabilité. Le
triage des chemins réellement présents/utilisés, une éventuelle réduction
supplémentaire de la base et les nouveaux correctifs sont obligatoires avant
acceptation de la bêta (TC-805). Ce run valide la livraison technique, pas une
acceptation de risque en production.

Les deux premières tentatives sont rouges : le contrôle a effectivement
bloqué les dépendances npm intégrées à l'image puis les correctifs Debian
manquants. Leurs images candidates ne doivent pas être promues.

## Références officielles

- [Attestations Docker et SBOM](https://docs.docker.com/build/ci/github-actions/attestations/)
- [Attestations GitHub](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [Vérification avec GitHub CLI](https://cli.github.com/manual/gh_attestation_verify)
- [Cycle de support Node.js](https://nodejs.org/en/about/previous-releases)
