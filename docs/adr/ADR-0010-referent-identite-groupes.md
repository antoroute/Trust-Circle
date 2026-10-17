# ADR-0010 — Référent de confiance pour l'identité dans les groupes

Statut : Acceptée — décision produit ; contrat technique et preuves à produire
Date : 2026-10-17
Origine : réponse explicite du propriétaire pendant TC-302 C1b
Complète : ADR-0009, parcours de groupe uniquement

## Décision reçue

Le propriétaire accepte la « délégation explicite au référent » : chaque
membre vérifie un propriétaire/administrateur référent par QR ou empreinte,
puis fait confiance aux identités que ce référent a personnellement vérifiées
et attestées. Le risque présenté et accepté est qu'un référent compromis ou
trompé puisse valider une fausse identité. Les vérifications directes restent
possibles et sont distinguées dans l'interface.

Cette décision évite d'exiger des comparaisons entre toutes les paires de
personnes. Pour n personnes avec un même référent inclus dans le groupe, le
minimum théorique passe de n(n−1)/2 à n−1 comparaisons mutuelles : 45 contre
9 à dix personnes. Ce calcul suppose un référent commun, une vérification
mutuelle correcte et aucune identité remplacée ; ce n'est pas une mesure UX
ni la garantie d'un seul geste pour tout parcours multi-administrateurs.

## Conséquences produit

- L'obligation initiale n'est pas supprimée : le membre doit vérifier son
  référent sur un canal fiable et comprendre la délégation qu'il accepte.
- Afficher séparément « Vérifié directement » et « Attesté par [référent] ».
  Ni une clé fournie par le serveur ni le simple rôle admin ne vaut attestation.
- Le référent atteste une identité qu'il a lui-même vérifiée ; ne pas créer
  une chaîne arbitraire de recommandations transitives.
- Une identité remplacée exige une nouvelle vérification selon l'ADR-0009.
  Une attestation de l'ancienne identité ne couvre pas la nouvelle.
- Les appareils suivent toujours leur chaîne d'approbation propre ADR-0005.
  Le référent ne peut pas approuver à la place du titulaire un nouvel appareil
  de son compte.
- Attester une identité ne donne aucun droit de lecture ou d'administration
  supplémentaire. Les appartenances aux conversations privées restent
  indépendantes ; un admin extérieur ne reçoit pas leurs clés ou leur historique.
- La permission de partager l'historique reste celle de l'ADR-0008 : cette
  nouvelle décision n'accorde aucun partage automatique.

## Contrat à établir, non accepté par cette décision

TC-303/305 doivent lier l'attestation à l'identité exacte, son incarnation,
l'auteur autorisé et au périmètre accepté de délégation, avec domaine/version,
validation canonique et invalidation. Aucun format de signature ou QR n'est
inventé par cette ADR ; les formats de preuve V1 ne sont pas réutilisés hors domaine.

Restent notamment : initialisation du référent, acceptation vérifiable de la
politique, changement/perte/révocation de référent, pluralité d'admins,
conversations privées sans référent participant et transfert des vérifications
vers son propre appareil approuvé. Ni repli automatique sur l'annuaire, ni
remplacement silencieux du référent, ni quorum ne sont décidés ici.
Une contradiction avec une vérification directe connue doit bloquer la
transition concernée, pas être écrasée par une attestation.

La validation des droits se rapporte à un état antérieur authentifié : un
serveur ne peut pas promouvoir un membre et utiliser ce rôle auto-déclaré
pour rendre sa propre attestation acceptable. La fraîcheur et les révocations
cachées restent à traiter ; une attestation signée n'est pas une transparence
automatique ni une preuve d'accord de tous les membres sur leur état MLS.

## Preuves, coût et portée

Les cas G01–G03 du [rapport C1b](../security/V3_ADMISSION_RECOVERY_STUDY.md)
complètent S03/S04/S06/S12 : faux référent, substitution d'identité,
attestation hors périmètre, contradiction directe, référent remplacé et
confusion entre attestation, rôle et approbation d'appareil.
Ces tests ne sont pas encore exécutés.

Coût visé : vérifications à l'entrée et aux changements sensibles, cache
versionné, aucun aller-retour d'annuaire ajouté au message courant. Disponibilité
du référent lors des nouvelles vérifications et performances restent à mesurer.

Cette décision ne change pas MLS/OpenMLS ou le fournisseur et ne valide ni le
contrat complet TC-302 ni la levée de la suspension TC-301. Réexaminer avec
accord explicite si le modèle de délégation, sa portée ou son risque change.
