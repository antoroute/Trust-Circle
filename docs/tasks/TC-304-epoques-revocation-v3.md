# TC-304 — Membres, époques, révocation et reprise MLS

Statut : À faire — fiche préparée dans TC-302 B, dépendance non satisfaite
Priorité : critique avant intégration
Date : 2026-10-12
Responsable de décision : propriétaire pour Q2/Q3/Q5 ; revue sécurité pour les transitions
Dépendances : TC-302 acceptée ; interfaces de confiance TC-303 à coordonner

## Contexte et objectif

MLS ne choisit pas les rôles CircleHaven, la rétention ni le mode de livraison.
Un Commit privé est opaque au serveur ; l'ordre de transport ne prouve pas sa
validité. Révocation réseau, retrait MLS et disponibilité locale sont distincts.

Objectif : définir une machine d'état produit/transport vérifiable sans
modifier les transitions MLS, avec préconditions, effets durables, reprises,
erreurs et conséquences UX pour chaque événement.

Références : [socle V3](../security/CRYPTOGRAPHY_V3.md),
[revue R01 à R08](../quality/TC-302-SPEC_REVIEW.md),
[décisions V1](../product/V1_DECISIONS.md). La résolution de faisabilité de
R02/R07/R08 doit déjà être exposée dans TC-302 avant acceptation du socle.

La [première étude C1](../security/V3_FEASIBILITY_STUDY.md) recommande un
journal de candidats sans verrouillage prématuré de l'époque. Ce n'est pas
encore un contrat accepté : distinguer rejet définitif, preuve/Proposal
manquante et erreur de stockage ; traiter fragmentation sélective et preuve
Welcome/arbitrage avant intégration. Aucun quorum ou external join de secours
automatique n'est retenu. Les cas F01–F07 complètent les preuves ci-dessous.

## Travail à réaliser

1. Définir qui peut ajouter/retirer/mettre à jour un appareil et comment les
   pairs vérifient ce droit, y compris au changement de rôle ou de propriétaire.
2. Définir création idempotente, transition pending, candidat ordonné, fusion
   locale, conflit, abandon, Welcome et effets sur l'outbox. Aucun succès MLS
   déduit d'un simple ACK ni de OwnPrivateMessage.
3. Définir le traitement d'un candidat invalide, des vues divergentes et de
   l'absence de membre capable de poursuivre ; ne pas inventer une fusion
   de branches ou un retour d'époque. Fournir les hypothèses de disponibilité.
4. Définir la barrière de retrait global par groupe, les messages hors ligne
   avant/après révocation et les retries d'une ancienne époque.
5. Fixer politique d'anciennes époques, bornes de hors ordre, rétention des
   contrôles et secrets, suppression, trous et réadmission après expiration.
6. Définir la fréquence des renouvellements de feuille pour la PCS et leurs
   déclencheurs, sans bloquer chaque message ni promettre une PCS automatique
   à chaque incrément d'époque.
7. Fixer le profil de Proposal/Commit/Welcome, external joins/ReInit et les
   extensions autorisées, en coordination avec TC-305.

## Critères d'acceptation

- [ ] Tableau de transitions complet : auteur, droit, entrée, état, transaction, effet, retry et erreur.
- [ ] Chaque époque a une branche acceptée localement ; équivocation détectable ou limite explicitement admise.
- [ ] Aucun Welcome d'une branche perdante accepté ; Commit invalide ne conduit pas à une progression fictive.
- [ ] Révocation spécifiée avec instants d'effet et conditions réseau, sans promesse universelle instantanée.
- [ ] Historique, secrets et journal ont des rétentions distinctes, chiffrées et justifiées.
- [ ] Hors ligne, dernier appareil perdu/révoqué et récupération totale ont un comportement visible et sûr.
- [ ] Q2/Q3/Q5 arbitrées ; borne d'accès du nouvel appareil cohérente avec Q1.
- [ ] Durées/limites de ressources proposées sont mesurables et aucun compromis n'affaiblit silencieusement les invariants.

## Tests et preuves attendues

S05/S11/S12/S13/S14/S15/S16 : deux Commit concurrents, ACK perdu, faux écho,
Welcome précoce/perdant, KeyPackage réutilisé, membre sans rôle, changement de
propriétaire, révocation globale multi-groupes, retour après plusieurs époques,
message tardif et contrôles expirés. Explorer chaque coupure avant/après écriture
locale, écriture serveur et traitement distant ; distinguer serveur honnête et hostile.

## Composants et hors périmètre

Spécification V3, contrat de livraison futur TC-310, outbox/synchronisation
TC-501 à TC-505 et invariants. Pas de route backend, migration, déploiement,
nouvelle primitive ou modification des bibliothèques dans cette tâche.
Le stockage/anti-rollback relève de TC-306 avec hypothèses cohérentes ici.

## Risques, reset, rollback et décisions

Convergence, disponibilité et confidentialité peuvent se contredire si les
états sont ambigus. Les délais ne sont pas des preuves d'échec définitif.
Une reprise ne doit ni rejouer une ancienne branche ni réactiver V2. Le reset
V3 de TC-307 est séparé de la récupération d'un groupe en cours d'utilisation.

Arbitrer Q2/Q3/Q5 avec le propriétaire, sans ajouter un quorum utilisateur
exclu du produit. La [suspension TC-301](../quality/TC-301-SECURITY_HOLD.md)
reste active ; aucune distribution ni implémentation n'est autorisée par cette fiche.
