# ADR-0008 — Partage facultatif d'historique

Statut : Proposée
Date : 2026-10-12
Origine : réponse du propriétaire à Q1 de TC-302
Portée : autorité de partage décidée ; contrat détaillé, faisabilité et inclusion V1 à valider
Décisions concernées : ADR-0002, volet historique d'ADR-0003 ; aucune remplacée à ce stade

## Contexte et demande

Le propriétaire souhaite pouvoir choisir de partager ou non l'historique,
vers un nouvel appareil **et vers une nouvelle personne**, si cela reste
raisonnable en ressources et en complexité. Cette réponse ne valide pas la
proposition antérieure de limiter systématiquement l'accès aux messages futurs.

La baseline V1 excluait le transfert d'historique. La présente ADR étudie son
élargissement ; elle n'autorise pas encore une implémentation, un partage réel
ou une promesse de livraison. « Aucune donnée V2 à migrer » reste inchangé :
il s'agit de futurs historiques V3, pas de conserver les données du prototype.

MLS ne donne pas automatiquement l'historique à un nouveau client. L'application
peut ajouter ce service, en évaluant ses effets sur FS/PCS :
[RFC 9750, §6.7](https://www.rfc-editor.org/rfc/rfc9750.html#section-6.7).
Les propositions suivantes sont des choix CircleHaven à examiner, pas une
fonction d'import prête à l'emploi fournie par OpenMLS.

## Orientation proposée

### Parcours utilisateur

- Choix explicite par conversation : aucun historique, période sélectionnée
  ou tout l'historique **disponible et autorisé**, avec volume annoncé.
- Aucun transfert implicite. L'admission MLS pour les nouveaux messages et
  le transfert d'historique ont des progressions distinctes.
- La conversation devient utilisable sans attendre tout l'import. Transfert
  fractionné, reprenable, annulable et de priorité inférieure aux messages courants.
- Identifier la source, la période, les destinataires et les éventuels trous.
  « Tout » ne signifie pas que le service peut retrouver un historique effacé.

### Autorité de partage — décision produit du 12 octobre 2026

Le propriétaire a choisi « Propriétaire ou administrateur de la conversation »
en réponse à la question sur l'autorisation d'un partage vers une nouvelle
personne. La règle retenue comprend la participation à la conversation, le
choix de la période et un événement visible par les membres. La question
précisait aussi la confirmation depuis un appareil déjà approuvé pour un
transfert vers son propre appareil. Ne pas redemander cet arbitrage.

| Cas | Règle produit retenue |
|---|---|
| Nouvel appareil du même compte | Confirmation depuis un appareil déjà approuvé du compte, qui possède l'historique ; vérification de l'appareil destinataire et des conversations autorisées |
| Nouvelle personne | Propriétaire/administrateur autorisé dans la conversation et participant à celle-ci, avec historique disponible ; période explicite, confirmation et événement visible par les membres |

Être administrateur du cercle ne donne pas accès à une conversation privée dont
on n'est pas membre. Posséder une copie ne doit pas à lui seul donner un droit
applicatif de la republier à un nouvel utilisateur. L'alternative limitant
chacun au partage de ses propres messages n'est pas la politique retenue.

Cette décision produit n'accepte pas l'ensemble de l'ADR ni un protocole de
transfert. Il reste à préciser la portée de cette permission pour les messages
d'anciens membres et les informations montrées avant confirmation. Un événement
visible ne vaut pas consentement individuel de tous les auteurs. Le contrat,
la faisabilité, les performances et l'inclusion V1 restent à valider.

### Transfert de contenu, pas de secrets anciens

Un appareil source sélectionne des copies locales déjà vérifiées et les
retransmet sous un nouveau chiffrement E2EE limité aux appareils destinataires
validés. La sélection respecte suppressions, contenu masqué et droits retenus ;
elle ne doit pas ressusciter automatiquement un élément supprimé. Interdire
l'export de base brute, des secrets d'époque, des ratchets,
des clés privées d'identité ou des anciens états MLS.

Piste à évaluer en priorité : transport via la pile MLS retenue dans un groupe
technique de transfert restreint à la source et aux destinataires validés,
lié à une conversation et à une opération. Ce n'est ni un message privé global
hors cercle ni un changement de la suite MLS. Cette réutilisation évite une
nouvelle pile de primitives, mais ajoute un cycle de groupe et ne constitue
pas encore un protocole de transfert spécifié/audité. Son coût et ses limites
doivent être comparés avant choix final.

Ne pas diffuser l'archive dans le groupe de conversation courant : certains
autres membres pourraient alors lire un passé qu'on ne voulait partager
qu'avec un destinataire précis. Le serveur ne transporte que du chiffré et
des métadonnées minimales, avec quotas et expiration des données temporaires.
Le transport concret et les durées ne sont pas décidés ici.

Le contrat de transfert doit authentifier source et destinataires, conversation,
version, identifiant d'opération, sélection, ordre et intégrité des fragments.
Revalider autorisations et révocations aux frontières appropriées ; une autorisation
initiale ne doit pas permettre une copie illimitée après retrait. Un retry
reprend son état durable, sans réutiliser aveuglément une ancienne clé/nonce.

### Authenticité et limites de confidentialité

Authentifier le transfert prouve qui le transmet, **pas automatiquement qui a
écrit chaque message original**. Un appareil source malveillant peut fabriquer
ou omettre des éléments. Sans preuve originale vérifiable adaptée, afficher
« historique partagé par … » avec provenance conservée ; ne pas faire passer
ces éléments pour des messages directement authentifiés de leur auteur initial.
Un import ne peut écraser silencieusement une copie locale déjà vérifiée.

Ne pas copier les anciennes clés préserve la séparation des états MLS, mais
ne rend pas le partage neutre pour la confidentialité : le passé sélectionné
devient volontairement accessible sur davantage d'appareils. Une compromission
ultérieure de ces copies peut l'exposer. Pas de promesse que les garanties de
confidentialité du passé restent identiques après partage.

L'annulation arrête le reste du transfert ; elle n'efface pas ce qui a déjà
été reçu. Si aucun appareil accessible ne possède le contenu, les ciphertexts
restants sur le serveur ne suffisent pas à recréer les secrets supprimés.
La récupération de compte ne promet toujours pas de restaurer l'historique.
Une éventuelle retransmission par un membre après récupération devra suivre
une autorisation explicite, sans être confondue avec la récupération elle-même.

## Ressources et expérience utilisateur

Le coût est au moins proportionnel au volume exporté/importé : lecture locale,
chiffrement, réseau, écritures et indexation. Pour du texte, un transfert ponctuel
semble faisable, **sans mesure de vitesse ni de batterie à ce stade**. À titre
de calcul seulement, 10 000 messages de 1 Kio représentent environ 9,8 Mio avant
métadonnées ; une longue archive ou plusieurs destinataires multiplient le travail.

Mesures de maîtrise proposées : lecture et import par curseur, fragments bornés,
file d'attente limitée, déduplication, reprise après coupure, quotas de disque et
de débit. Ne pas construire toute l'archive en RAM ou en fichier temporaire clair.
La priorité aux nouveaux messages doit concerner CPU, verrouillage de base et
indexation, pas seulement l'affichage d'une barre de progression.

Les gros transferts peuvent attendre le Wi-Fi selon le choix utilisateur ;
aucune compression ou optimisation coûteuse n'est imposée avant mesure.
Le coût principal de développement n'est pas le chiffrement du texte : ce sont
les droits, la provenance, les interruptions et les courses avec la révocation.
Pas d'estimation de délai fiable avant prototype représentatif.

## Options considérées

1. **Copie sélective rechiffrée (préférée pour l'étude)** : ne redonne pas les
   anciennes clés, mais requiert une source et un contrat d'import robuste.
2. **Transférer anciens secrets/états MLS** : rejeté comme raccourci ; étend
   l'accès au passé et crée des risques de rejeu/réutilisation d'état.
3. **Sauvegarde permanente de tout l'historique** : pas nécessaire à la demande,
   complexifie récupération, rétention, stockage et gestion de clés ; hors étude initiale.
4. **Ne partager aucun historique** : baseline initiale, mais ne répond pas au
   nouveau souhait. Ne la retenir à nouveau qu'après décision explicite si les
   coûts ou risques rendent l'option demandée inacceptable.

## Plan conditionnel et preuves d'acceptation

| Lot proposé | Livrable / porte |
|---|---|
| H1 — politique et contrat | Autorité décidée ; contrat détaillé de période, source, destinataires, provenance et conséquences à valider ; TC-302/303/304/305 |
| H2 — transfert vers son appareil | Prototype synthétique borné, stockage chiffré, reprise, import sans écraser l'état MLS ; TC-306/310/311 après les dépendances |
| H3 — transfert vers une nouvelle personne | Même moteur, droits supplémentaires, changement de membre et visibilité ; pas de second protocole crypto |
| H4 — validation | Charge simultanée messages/import, mémoire/disque/batterie, négatifs, plateformes et audit TC-312 incluant ce périmètre |

Les lots H sont une proposition de découpage, pas des tâches achevées. Une fiche
d'implémentation dédiée et les dépendances de l'audit seront ajoutées si la
politique et la faisabilité sont validées. L'étude ne remplace pas TC-302 C1.

Tests indispensables : mauvais compte/appareil/conversation, destinataire non
admis ou révoqué en cours, période dépassée, source usurpée, archive tronquée,
fragments réordonnés/rejoués, conflit avec message local vérifié, provenance
forgée, message supprimé réintroduit, export contenant un secret interdit,
manque de disque, crash et reprise.
Mesurer petits/grands historiques sous messages en direct, sans dégrader les
budgets du chemin courant de l'ADR-0003 ; tester les limites de ressources et
le résultat partiel honnêtement affiché. Aucun de ces tests n'est exécuté ici.

## Conséquences, migration et réexamen

Si acceptée, cette ADR remplacera uniquement l'exclusion de transfert
d'historique des ADR-0002/0003 et des documents V1 ; MLS/OpenMLS ne change pas.
Adapter alors TC-303 à TC-306, synchronisation, UX appareils/invitations, rétention,
modèle de menace, invariants et audit. Les fichiers et appels restent hors V1 :
un transfert interne de messages texte n'est pas un partage de documents utilisateur.

Les imports doivent rester isolables et désactivables sans effacer les messages
directement reçus, restaurer un ancien état MLS ni réactiver V2. Pas de données
V2 à migrer. Réexaminer après mesures, évolution des ACL/récupération ou audit
révélant un défaut de provenance, de confidentialité ou de performance.

La suspension des nouveaux paquets TC-301 reste intégralement en vigueur ;
cette proposition ne lève aucun verrou et ne déclenche aucune implémentation.
