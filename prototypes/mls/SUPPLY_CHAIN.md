# Dépendances du laboratoire TC-301

Revue : 2026-10-03. Ce document n'autorise pas une publication sur les stores.

## Versions et frontières

OpenMLS `0.9.0`, traits/basic-credential/RustCrypto `0.6.0`, stockage SQLite
`0.3.0`, fournisseur libcrux comparatif `0.4.0`, Rust `1.99.0` sont verrouillés.
`Cargo.lock` fixe également les dépendances transitives et leurs checksums.
`mls-rs 0.56.0` / RustCrypto `0.22.1` sont réservés à l'interopérabilité ;
le fournisseur RustCrypto de mls-rs est annoncé expérimental en amont.

`scripts/check-features.mjs` refuse les options OpenMLS de debug, brouillon,
test-utils, conversion non vérifiée et fork-resolution. La façade impose MLS
1.0 et la suite `0x0001`. Certaines dépendances libcrux/PQ existent néanmoins
dans le graphe transitif de HPKE : cela ne signifie pas qu'une suite MLS PQ
est activée. Ne pas présenter ce contrôle comme une preuve d'absence de tout
code PQ dans les artefacts.

## Licences

OpenMLS est MIT. L'allowlist couvre les licences permissives rencontrées.
Les quatre crates HPKE `hpke-rs`, `hpke-rs-crypto`, `hpke-rs-rust-crypto` et
`hpke-rs-libcrux`, toutes en `0.7.0`, sont MPL-2.0. L'exception de
`deny.toml` est limitée à ces versions ; il ne s'agit pas d'une permission
générale pour toute nouvelle dépendance copyleft.

La [licence MPL-2.0, sections 3.1–3.3](https://www.mozilla.org/en-US/MPL/2.0/)
et la [FAQ Mozilla, Q8 et Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
permettent l'intégration dans une œuvre plus large, notamment commerciale,
avec des obligations sur le code couvert. Avant distribution :

- fournir les notices et le texte de licence ;
- rendre accessibles les sources exactes des composants MPL distribués,
  ainsi que nos modifications éventuelles de ces fichiers ;
- indiquer clairement aux destinataires comment obtenir ces sources ;
- ne pas restreindre leurs droits MPL par les conditions de l'application ;
- revoir la conformité du paquet final, de ses conditions et du store ciblé.

Les dépendances ne sont pas modifiées ici. Aucune licence n'est attribuée au
code du propriétaire par cette tâche. `private.ignore` concerne uniquement
le crate local `publish=false`, pas ses dépendances. Cette revue technique
ne remplace pas une validation juridique avant publication.

## Avis de maintenance non masqué

L'audit du lockfile relève `RUSTSEC-2026-0173` : `proc-macro-error2 2.0.1`
n'est plus maintenu, sans correctif publié dans l'avis. Ce n'est pas un avis
de vulnérabilité exploitée ni une preuve d'innocuité.

Chemin : `hax-lib-macros → hax-lib`, via les dépendances de vérification
libcrux. Le graphe `--target all` l'inclut, contrairement aux graphes natifs
de référence testés. Garder l'alerte visible ; ne pas ajouter d'ignore audit.
Avant sélection finale du fournisseur, vérifier les graphes pour chaque OS
et obtenir une trajectoire de remplacement amont si ce chemin est activé.
Un nouveau diagnostic doit faire l'objet d'une nouvelle revue.

Complément du 2026-10-04 : le lockfile propre au pont Flutter inclut et compile
`hax-lib-macros` sur Linux via `openmls_rust_crypto → hpke-rs → libcrux-sha3`.
L'absence constatée dans certains graphes du lot A ne s'étend donc pas au pont.
Voir `../mls_flutter/README.md` ; l'avis reste visible, sans exception audit.

Sources : [avis RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0173.html),
[dépôt archivé du mainteneur](https://github.com/GnomedDev/proc-macro-error-2/issues/17).

## Commandes reproductibles

```bash
cargo audit
cargo deny check licenses sources
cargo metadata --locked --all-features --format-version 1 | node scripts/check-features.mjs
cargo cyclonedx --format json --all-features --target all --override-filename mls.cdx
```

Le SBOM global contient aussi les dépendances de test/interop et celles
conditionnelles ; ce n'est pas la liste minimale du futur binaire Flutter.
La CI conserve le SBOM comme artefact, sans y placer de secrets ni de messages.
