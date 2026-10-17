# ADR-0009 — Vérification initiale obligatoire de l'identité

Statut : Acceptée — décision produit ; contrat technique et preuves à produire
Date de consignation : 2026-10-17
Origine : réponse du propriétaire à Q4 de TC-302 C1
Portée : première confiance et remplacement complet d'identité
Décision complétée : ADR-0003, caractère facultatif de la vérification hors bande

## Contexte

MLS authentifie des clés ; il faut encore vérifier à qui elles appartiennent.
Une clé reçue uniquement du service d'identité ne suffit pas à protéger le
premier contact si ce service est compromis. La comparaison et ses limites
sont décrites dans l'[étude C1](../security/V3_FEASIBILITY_STUDY.md).

Le propriétaire a choisi explicitement : « Oui, vérification initiale
obligatoire », par QR code ou empreinte comparée sur un autre canal fiable.
Le choix ne porte pas sur une vérification répétée à chaque connexion ou message.

## Décision produit

- Exiger la vérification initiale de l'identité de la personne par QR code
  ou comparaison d'empreinte sur un canal déjà authentifié.
- Ne pas demander à nouveau cette vérification lors des connexions et messages
  ordinaires, tant que la continuité de confiance vérifiée est conservée.
- La renouveler après un remplacement complet de l'identité, notamment après
  récupération totale ; ne pas accepter silencieusement la nouvelle racine.
- Un nouvel appareil approuvé par une identité dont la continuité est prouvée
  reste soumis au parcours ADR-0005 ; ne pas assimiler tout ajout d'appareil
  à un remplacement complet d'identité.
- Tant que la vérification requise n'est pas obtenue, ne pas déclarer la
  relation vérifiée ni transmettre le contenu protégé destiné à cette relation,
  y compris un partage d'historique. Préserver les brouillons et les autres
  conversations utilisables.

Le QR doit venir de l'appareil de la personne ou d'un canal fiable indépendant.
Un QR ou une empreinte simplement téléchargés du même annuaire suspect ne
constituent pas une vérification hors bande. Aucun bouton « continuer sans
vérifier » ne doit transformer silencieusement ce parcours en confiance au serveur.

## Ce qui n'est pas décidé ou prouvé

- Le format exact de l'empreinte/QR, son contexte et les preuves de liaison
  compte, appareil et clé MLS restent TC-303/305. Pas de protocole ou code court
  improvisé pour implémenter cette ADR.
- Une comparaison directe vérifie l'identité comparée. La politique de groupe
  a depuis été précisée par l'[ADR-0010](ADR-0010-referent-identite-groupes.md) :
  délégation explicite au référent vérifié acceptée, sans scans entre toutes
  les paires imposés. Le contrat technique reste à spécifier ; le simple rôle
  admin n'est toujours pas une preuve d'identité.
- Ce choix n'est pas un quorum d'approbation. Les rôles propriétaire/admin/membre
  et la décision de partage d'historique de l'ADR-0008 restent distincts.
- Le stockage durable du résultat, sa synchronisation vers un appareil approuvé,
  son invalidation et la protection contre un résultat restauré/périmé restent
  à concevoir. Perdre la preuve de continuité ne vaut pas conserver la confiance.
- La comparaison initiale ne prouve pas l'absence d'une révocation cachée,
  d'une branche divergente ou d'une compromission ultérieure d'un appareil.
  R08 n'est pas fermé et aucune transparence automatique n'est déclarée disponible.

## Alternatives et conséquences

La vérification facultative avec confiance au premier contact n'est pas retenue
comme parcours V1 par défaut. Une solution de transparence automatique reste
une piste complémentaire, pas une condition nouvelle de livraison décidée ici
ni un remplacement automatique de la vérification obligatoire.

Le coût UX est concentré sur la première confiance et le remplacement complet
d'identité. Aucun réseau ou calcul supplémentaire par message nominal n'est
imposé par cette décision. Les délais réels, l'accessibilité du parcours à
distance et le comportement des groupes attendent spécification et mesures.

Cette ADR remplace uniquement le caractère facultatif de la vérification
initiale dans l'ADR-0003 ; elle ne modifie ni MLS, ni sa suite, ni le fournisseur,
ni la confiance multi-appareil de l'ADR-0005. Elle n'accepte pas les autres
recommandations de l'étude C1, n'autorise aucune implémentation anticipée et
ne lève pas la suspension des nouveaux paquets.

## Preuves et réexamen

Avant intégration, couvrir S03/S04/S06/S12 et F08/F09 : fausse racine, QR
substitué, mauvaise personne/compte/conversation, remplacement d'identité,
ajout d'appareil avec chaîne valide/invalide, preuve périmée ou perdue,
partage d'historique avant vérification, annulation et reprise du parcours.
Ce sont des tests à écrire, pas exécutés par la décision.

Réexaminer si l'UX de groupe ne satisfait pas le besoin, si une analyse révèle
un contournement, ou si une transparence éprouvée permet de proposer un autre
parcours. Tout assouplissement de l'obligation demande un nouvel accord explicite.
