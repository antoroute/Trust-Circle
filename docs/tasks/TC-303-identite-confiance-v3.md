# TC-303 — Identité et confiance des appareils MLS

Statut : À faire — fiche préparée dans TC-302 B, dépendance non satisfaite
Priorité : critique avant intégration
Date : 2026-10-12
Responsable de décision : propriétaire pour Q1/Q4 ; revue sécurité pour le contrat
Dépendances : TC-302 acceptée, ADR-0003, ADR-0005 et règles produit V1

## Contexte et objectif

Un credential MLS signé ne prouve pas à lui seul que l'appareil est approuvé
pour un compte CircleHaven. Les identités synthétiques du laboratoire ne
résolvent ni première confiance ni substitution par un annuaire compromis.

Objectif : spécifier les preuves et la machine d'état nécessaires pour relier
identité de compte, identité d'appareil approuvée, clé de signature MLS,
credential et KeyPackage, avec validation avant admission. Documenter ce que
le système garantit face à un serveur honnête ou compromis.

Références : [socle V3](../security/CRYPTOGRAPHY_V3.md),
[revue R01/R03/R08](../quality/TC-302-SPEC_REVIEW.md),
[confiance existante V1](../security/DEVICE_TRUST_PROTOCOL_V1.md).

## Travail à réaliser

1. Inventorier ce qui peut être conservé du registre TC-106 sans réutiliser
   ses transcriptions signées pour un nouveau domaine.
2. Définir l'ancrage initial, bootstrap, preuve de possession, approbation et
   liaison de la clé MLS ; distinguer compte connecté et appareil actif.
3. Définir versions, rotation, expiration, révocation, fraîcheur du cache et
   absence de requête d'annuaire sur chaque message nominal.
4. Définir le cycle de KeyPackage, réservation concurrente, consommation,
   abandon et tombstones, avec TC-304/310 ; jamais de réutilisation silencieuse.
5. Comparer les options de détection d'équivoque/transparence maintenues et
   leur impact UX/licences/exploitation ; demander la décision Q4.
6. Décrire l'approbation multi-conversations et le début d'accès Q1, puis
   transférer les formats exacts et vecteurs à TC-305.

## Critères d'acceptation

- [ ] Racine de confiance et limites du premier contact explicites.
- [ ] Chaque preuve possède émetteur, validateur, domaine, contexte et conditions de refus.
- [ ] Les liens credential/clé/appareil/compte et l'autorisation de conversation sont vérifiables côté client.
- [ ] Rotation/révocation et réponses périmées ne permettent aucun downgrade silencieux.
- [ ] KeyPackage expiré, rejoué ou associé à une branche perdante ne crée pas une double admission.
- [ ] Q1/Q4 décidées ; aucun mécanisme absent présenté comme déjà déployé.
- [ ] Contrat indépendant et matrice de tests négatifs revus, intégrés au socle.

## Tests et preuves attendues

S03/S04/S05/S06/S11/S12 : mauvais compte/appareil, signature valide d'une clé
non approuvée, fausse racine, appareil révoqué, credential ancien, substitution
de clé MLS, KeyPackage concurrent, vues d'annuaire divergentes et changement
de compte local. Prévoir horloge incorrecte, cache périmé et service indisponible.
Les tests de confiance V1 ne valent pas validation du contrat MLS.

## Composants et hors périmètre

Documents ADR-0005, CRYPTOGRAPHY_V3, modèle de menace et invariants ; contrat
du registre backend et façade Rust à préparer. Pas de nouvelles primitives,
de serveur de transparence inventé, de code produit ou de déploiement dans cette
tâche de spécification. L'intégration relève de TC-310/311.

## Risques, reset, rollback et décisions

La compromission du service d'identité peut permettre des appareils fantômes
si l'ancrage et la cohérence ne sont pas assurés ; lister honnêtement les risques
acceptés. Aucun ancien compte/secret à migrer. Revenir sur le document ne révoque
aucun appareil réel ; toute modification future du registre exige migrations,
tests et plan de retour arrière dédiés.

Q1 a reçu une demande de partage facultatif appareil/personne, pas un accord au
seul historique futur. Finaliser sa politique selon l'[ADR-0008 proposée](../adr/ADR-0008-partage-historique-optionnel.md)
et demander Q4 avant gel. La [suspension TC-301](../quality/TC-301-SECURITY_HOLD.md)
reste active ; cette fiche n'autorise aucun paquet ni changement de fournisseur.
