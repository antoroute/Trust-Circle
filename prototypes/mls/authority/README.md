# C1g-2b.1 — banc de preuves d'autorité

**Expérimental, synthétique et uniquement en mémoire.** Aucun module de ce
dossier n'est importé par le moteur Rust, Flutter ou le backend. Ce n'est pas
un profil V3 accepté : ni QR réel, ni registre durable, ni reprise MLS. Voir les
rapports [C1g-2b.1](../../../docs/quality/TC-302-AUTHORITY_PROOFS.md) et
[C1g-2b.2](../../../docs/quality/TC-302-DELEGATED_AUTHORITY.md).

Depuis la racine du dépôt, Node ≥20 et dépendances Messaging déjà installées
conformément à son lockfile :

```bash
node --test prototypes/mls/authority/model.test.mjs
```

Le banc charge fast-jwt **6.3.3** existant et refuse une autre version. Il ne
démarre aucun serveur, n'accède à aucun secret et ne télécharge rien. Les clés
de fixture sont générées en mémoire, jamais écrites. Aucun manifest/lockfile
nouveau ; si la dépendance manque, ne pas improviser un encodeur ou modifier
les versions pour contourner le gel.

`Account` vérifie approbations/possessions/révocations depuis une genèse ancrée.
`TrustedAccounts` interdit la substitution d'une racine déjà enregistrée.
`Circle` ancre séparément sa genèse, vérifie transitions de rôles et demandes
liées aux états exacts de compte/cercle. `Binding` éprouve le lien entre identité
et octets de clé/credential dans un contexte ; **il ne valide pas un objet MLS**.
Les helpers d'émission de fixtures ne constituent pas une outbox fiable.

`IdentityDelegation` distingue confiance attestée propre au cercle et confiance
directe, sans ajouter de membre ou de droit. L'historique public de compte sert
à vérifier une clé antérieure ET encore active ; il ne réactive aucun appareil.
Circle ajoute un garde mémoire contre un frère de rôles autorisé/signé, sans
quarantaine globale ni méthode de déblocage. Aucun état ne survit au processus.

47 tests, dont contre-exemples : révocation cachée, référent menteur et perte
de connaissances après reconstruction complète. La durée du runner n'est pas
une mesure de latence produit. Ne pas réutiliser les objets JSON retournés
comme preuves reçues du serveur ni effacer un hold après un refus.

JWS/EdDSA est un outil disponible pour cet essai, **pas le choix natif final** :
RFC 9864 recommande l'identifiant entièrement spécifié Ed25519. Le banc fixe
le type réel de clé ; aucune bibliothèque/primitive n'est patchée. La politique
JSON last-wins testée n'est pas un contrat de canonicalisation interlangage.
