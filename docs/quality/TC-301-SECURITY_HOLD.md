# TC-301 — suspension des nouveaux paquets

Date : 2026-10-11. Décision explicite du propriétaire : **attendre une version
amont compatible**, sans fork ni mise en quarantaine du fournisseur comparatif.
Les versions et lockfiles restent inchangés ; aucun ignore RustSec n'est ajouté.

## Déclencheur et portée

Les deux CI du 2026-10-05 sur `27ab9c6` sont fonctionnellement vertes. Une
réexécution locale de `cargo audit` le 2026-10-11 échoue après actualisation
de RustSec (1 296 avis chargés). Ces nouveaux avis ont été **publiés le 7 octobre**,
bien que leurs dates de signalement soient antérieures :

| Avis | Dépendance verrouillée | Correction annoncée | Graphe détecté |
|---|---|---|---|
| [RUSTSEC-2026-0329](https://rustsec.org/advisories/RUSTSEC-2026-0329.html) | libcrux-hmac-drbg 0.0.1 | ≥0.0.2 | moteur natif |
| [RUSTSEC-2026-0330](https://rustsec.org/advisories/RUSTSEC-2026-0330.html) | libcrux-kem 0.0.9 | ≥0.0.10 | moteur et lockfile du pont |
| [RUSTSEC-2026-0331](https://rustsec.org/advisories/RUSTSEC-2026-0331.html) | libcrux-kem 0.0.9 | ≥0.0.10 | moteur et lockfile du pont |

Il s'agit de possibilités de panic/déni de service : longueur de sortie
particulière pour HMAC-DRBG, seeds ou clés hybrides trop courts pour KEM.
Les avis n'annoncent pas une fuite des messages ou une rupture du chiffrement.
L'avis de maintenance `RUSTSEC-2026-0173` reste également visible.
Les [résultats structurés des deux audits](evidence/TC-301-security-hold-20261011.json)
conservent leurs codes d'échec ; aucun résultat rouge n'est renommé en succès.

La suite MLS autorisée est toujours `0x0001`, pas une suite hybride PQ.
`cargo tree --locked --all-features -i libcrux-hmac-drbg` et `-i libcrux-kem`
dans le moteur montrent le fournisseur comparatif `openmls_libcrux_crypto`.
Dans le pont, `cargo tree --locked --target all -i libcrux-kem` ne retourne
**aucun chemin compilé** : sa présence dans le lockfile ne démontre pas une
exploitation du scénario RustCrypto. Cette précision n'est ni une exemption
d'audit ni une preuve générale d'innocuité. La porte de distribution reste fermée.

## Pourquoi ne pas forcer la mise à jour

Au contrôle du 2026-10-11, la version publiée de `openmls_libcrux_crypto` reste
0.4.0 : HPKE 0.7 et HMAC-DRBG 0.0.1. `hpke-rs-libcrux 0.7.0` exige exactement
`libcrux-kem =0.0.9`. Les corrections existent dans HPKE 0.8 / nouvelles crates
libcrux, mais une simple actualisation du lockfile ne peut franchir ces contraintes.

L'amont a intégré une actualisation au
[commit e0b21a7](https://github.com/openmls/openmls/commit/e0b21a70a55a9014b8de2772b36bf3d638adad51)
le 9 octobre. Ce commit n'est pas une nouvelle release publiée du fournisseur.
Ni dépendance Git mouvante, ni patch local de primitives, ni fournisseur remplacé
sans décision ne sont introduits. La sortie séparée d'OpenMLS 0.9.1 ne suffit
pas à corriger les versions imposées par ce fournisseur.

## Garde-fous appliqués

- `scripts/distribution-policy.json` bloque le script de packaging avant toute
  écriture, pour Windows et Android ; test de régression dédié.
- Le workflow Flutter désactive explicitement construction/validation/upload
  des paquets autonomes via `TC301_BUNDLES_SUSPENDED=true`.
- Les jobs runtime dépendent désormais du succès de `supply-chain`, même lors
  d'une relance ciblée. Un audit rouge ne peut plus coexister avec un nouvel
  upload de paquet par ce workflow.
- Les artefacts historiques ne sont pas supprimés : ils conservent leur valeur
  de preuve, **pas une recommandation d'installation actuelle**. Aucun nouvel
  essai sur le PC du propriétaire n'est demandé avec ces paquets.
- Pas de changement de backend, SSH, protocole, fournisseur ou primitive.

Validation du 11 octobre : analyse Flutter sans erreur, 18 tests Dart/FFI,
3 tests Node dont le refus des deux cibles suspendues, `actionlint` et
`git diff --check` réussis. Le test PowerShell est ignoré localement faute de
`pwsh` (son scénario inchangé avait passé la CI Windows du 5 octobre).
La CI multiplateforme n'est pas relancée sur ces seuls garde-fous : son audit
échouerait avec les lockfiles inchangés. La dépendance des jobs à l'audit est
validée statiquement ; aucune nouvelle exécution GitHub n'est revendiquée.

## Reprise, dans cet ordre

1. Vérifier une release publiée compatible du fournisseur et ses dépendances,
   ses notes de version et ses licences. Ne pas confondre branche `main` et release.
2. Actualiser de façon ciblée les manifestes/lockfiles, notices épinglées et SBOM.
3. Refaire les deux audits, les contrôles de features et les tests natifs
   RustCrypto/libcrux, interop, crash/reprise puis le pont sur les quatre OS.
4. Réévaluer les mesures, sans comparer silencieusement deux versions différentes.
5. Obtenir l'accord de reprise du propriétaire, lever les **deux** verrous
   script/workflow, reconstruire et revalider les paquets autonomes.
6. Reprendre TC-301 C2 : baseline V2 équivalente, essais Windows 11 / Pixel,
   puis preuves matérielles et décision finale de fournisseur.

Cette suspension ne clôture pas TC-301 et ne lance pas de surveillance
automatique. Elle n'empêche pas la préparation documentaire indépendante.
