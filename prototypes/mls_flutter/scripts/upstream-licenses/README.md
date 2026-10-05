# Pinned notices for the internal laboratory

Retrieved 2026-10-05. These texts supplement Cargo archives that omit their
license text. `index.json` binds each exact package/version, declared SPDX
expression and `.cargo_vcs_info.json` commit to a reviewed source URL. Unknown
versions fail packaging; packaging never downloads a replacement license.

Upstream repository LICENSE texts use immutable commit URLs. For the four HPKE
crates declaring MPL-2.0, their new repository does not ship an MPL text: the
canonical Mozilla 2.0 text is included, together with each unchanged Cargo
source archive in `third-party/mpl-sources`. This is not a relicensing under the
libcrux repository's root Apache license. See
https://www.mozilla.org/en-US/MPL/2.0/ and its sections 3.1–3.4.

For alternative expressions we select MIT when offered (including r-efi's
AUTHORS notice). No LGPL option is selected. Original notices remain intact.
Trailing blank lines were normalized by the source patch: `upstream_sha256`
records downloaded bytes, `sha256` records the stored UTF-8 text.

This inventory deliberately over-includes Cargo's platform/build/test graph.
It is not a minimal runtime SBOM, an independent legal opinion, a store
submission review, or a license grant for CircleHaven's own code.
