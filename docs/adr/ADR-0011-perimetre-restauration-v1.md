# ADR-0011 — Périmètre V1 de restauration de l'état cryptographique

Statut : Acceptée — périmètre produit/menace ; mécanismes et preuves à produire
Date : 2026-10-17
Origine : réponse explicite du propriétaire pendant TC-302 C1b
Portée : R07 et partie restauration de Q5 ; pas la rétention hors ligne Q2

## Décision

Le propriétaire accepte le « périmètre V1 explicite » présenté ainsi :

- Un crash courant reprend normalement depuis l'état transactionnel durable.
- Une restauration détectée impose une réactivation sécurisée avant de pouvoir
  envoyer ; l'historique local encore lisible est conservé.
- Les sauvegardes ordinaires excluent l'état cryptographique actif.
- La V1 ne garantit pas la détection d'une ancienne image complète du PC ou
  d'un snapshot d'émulateur restauré avec tous ses secrets. Cette limitation
  doit être annoncée, pas renommée « anti-rollback garanti ».

La dernière limite concerne plus généralement la restauration conjointe de
l'état opérationnel et de ses témoins locaux : ne pas promettre une meilleure
garantie équivalente sur Android/iOS/macOS sans preuve. Un état ancien peut
être cohérent et correctement chiffré ; cela ne le rend pas récent.

## Motivation et compromis

L'[analyse C1b](../security/V3_ADMISSION_RECOVERY_STUDY.md) distingue le crash,
le retour d'une sauvegarde et la restauration complète. Détecter toutes ces
dernières restaurations demanderait un ancrage indépendant de l'image ou une
reprise qui abandonne systématiquement l'ancien état ; aucune solution à ce
jour démontrée ne satisfait l'ensemble des contraintes OS/UX du projet.

Le choix borne donc une garantie, il ne corrige pas techniquement tout rollback.
Les risques d'état ancien, de générations réutilisées, de révocations cachées
et de copies de secrets restent à expliquer pour les restaurations non couvertes.
`reuse_guard` MLS n'est pas une preuve de détection. Aucun mécanisme standard
de nonce/ratchet n'est modifié et aucun nouvel appel réseau par message courant
n'est accepté par cette ADR.

## Contrat de mise en œuvre à prouver

- Séparer contenu historique et état opérationnel ; définir exactement les
  fichiers/stockages exclus des backups cloud et transferts entre appareils,
  ainsi que le comportement quand la clé OS est absente. Ne pas croire que
  désactiver une sauvegarde cloud couvre nécessairement les autres mécanismes.
- Définir les signaux de restauration pour chaque OS et les cas couverts.
  Une absence de signal n'est pas une preuve universelle de fraîcheur.
- Lorsqu'une restauration ou une incohérence est détectée, ne pas chiffrer de
  nouveau depuis l'ancien état, même pour un contrôle MLS privé. Suspendre
  également la republication aveugle de son outbox ; conserver les intentions
  et les contenus encore lisibles sans les déclarer fraîchement authentifiés.
- Prévoir une réadmission avec matériel neuf, droits vérifiés, remplacement
  de l'ancienne feuille et approbateur habilité. Ni ancien ratchet transféré,
  ni external join automatique sur la seule foi du serveur.
- Si les preuves d'identité sont perdues, appliquer la récupération renforcée
  et la nouvelle vérification requise ; ne pas réactiver le bootstrap initial.
- Permettre lecture locale et brouillons si leur stockage reste accessible.
  L'absence d'approbateur ou de réseau peut retarder la réactivation ; aucun
  délai instantané ni récupération d'historique perdu n'est promis.

La conservation de l'historique ne signifie pas qu'une sauvegarde utilisateur
de cet historique est déjà développée ou que son chiffrement au repos est validé.
Elle ne modifie pas le partage facultatif et ses permissions (ADR-0008).

## Preuves et conséquences documentaires

R07 reste ouvert pour la mise en œuvre et les preuves de ce périmètre :
S08/S10/S16/S17, F05–F07 et G07–G08. Tester crash, clé absente, backup/transfert,
base seule, base avec marqueur, restauration détectée et approbateur indisponible.
Les images complètes servent aussi de tests de limites : ne pas les déclarer
protégées si elles ne sont pas détectées. Aucun test n'accompagnait l'acceptation
du périmètre. Le [lot C1c ultérieur](../quality/TC-302-RECOVERY_GUARD.md) teste
le garde après signal injecté et le contre-exemple du marqueur restaurable,
sans détecteur OS, réactivation ni protection au repos. R07 reste ouvert.

Cette ADR précise V3-017 et remplace l'exigence non bornée d'anti-rollback du
brouillon TC-302. Elle ne réduit pas la protection contre un annuaire/DS
compromis et ne ferme pas R02/R04/R08. La durée hors ligne, la rétention des
contrôles et la reprise après journal expiré restent à décider en Q2/Q5.
Les références historiques contradictoires doivent être alignées lors du gel
du socle, en préservant les modifications locales du propriétaire.

Ne pas redemander cet arbitrage de périmètre. Réexaminer avec accord explicite
si l'on veut prendre en charge les images complètes ou si les tests révèlent
une restauration ordinaire non couverte. Aucun paquet, changement de dépendance,
déploiement ou levée de la suspension TC-301 n'est autorisé par cette décision.
