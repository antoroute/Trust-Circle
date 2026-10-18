# ADR-0012 — Livraison ordonnée, admission et attente de révocation V3

Statut : Proposée — Q3 produit décidée ; contrat technique à compléter et faire accepter
Date : 2026-10-18
Complète si acceptée : ADR-0003, sans changer MLS 1.0 ni la suite 0x0001
Suivi : TC-302 R02/R03, Q3 ; détails TC-304/310

## Contexte

Le service de livraison ne déchiffre pas les Commit privés. Il ne peut donc
pas choisir leur validité cryptographique par une transaction SQL. Retenir le
premier ciphertext puis refuser tous les suivants pour cette époque permettrait
à un candidat invalide de bloquer le groupe. La formulation historique de
l'ADR-0003 doit être précisée sans lui attribuer une garantie qu'elle ne fournit pas.

La RFC 9750 décrit le couplage entre arbitrage et Welcome, ainsi que les risques
des différentes organisations du service de livraison. Le journal ordonné est
une piste, pas un consensus obtenu par le seul compteur serveur.
[RFC 9750 §5.2.3–5.3](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.2.3).

## Proposition de contrat

1. Ordonner les **candidats** admissibles au transport : identité d'accès,
   autorisation, tailles, quota et idempotence. Ne pas prétendre valider leur
   contenu MLS ni avancer irréversiblement une époque cryptographique serveur
   après le premier candidat opaque.
2. Côté client, traiter un préfixe complet dans cet ordre, vérifier MLS et
   les autorisations CircleHaven, puis retenir le premier candidat valide.
   Une Proposal ou une preuve manquante n'est pas un rejet cryptographique :
   résoudre la dépendance avant de choisir un concurrent.
3. Chez un auteur honnête, conserver le Welcome localement jusqu'à fusion
   durable de son propre Commit exact. Invalider atomiquement son pending et
   sa sortie si un concurrent valide est fusionné à sa place. Ne pas précharger
   le Welcome sur le serveur en lui confiant seul son verrou de livraison.
4. Ne pas transformer la fusion locale, un ACK serveur ou un GroupInfo signé
   en preuve globale d'admission. Définir encore ce que le nouvel appareil doit
   vérifier, la gestion des divergences et la reprise sûre avant acceptation.

Le point 3 est partiellement éprouvé dans le [laboratoire C1d](../quality/TC-302-ADMISSION_RELEASE.md).
Le journal, les preuves de rôles, les contrôles côté nouvel arrivant et la
reprise ne sont pas implémentés. Le nouvel arrivant ne doit pas consommer
irréversiblement son KeyPackage avant la fin de ses validations : les contrôles
applicatifs doivent appartenir à la transaction d'admission, sans attente réseau
sous verrou. Les preuves C1c ne couvrent pas encore l'ensemble de ces contrôles.

## Garanties et adversaires à ne pas confondre

| Situation | Ce que la proposition permet ou ne permet pas |
|---|---|
| Clients honnêtes, livraison cohérente | Empêcher une libération prématurée locale et invalider une sortie perdante ; preuve locale C1d, contrat transport encore requis |
| Serveur qui diverge ou cache des événements | Deux auteurs peuvent chacun fusionner et libérer un Welcome incompatible ; contre-exemple C1d, pas de garantie de convergence |
| Membre/auteur hostile | Peut violer la politique de publication ou produire un Commit dont le traitement diffère selon les destinataires ; premier valide ne suffit pas |
| Indisponibilité réseau ou dépendance absente | Attendre/réessayer sans inventer une époque ni déclarer l'opération définitivement perdue |

Un UpdatePath malveillant peut provoquer des acceptations différentes selon
les sous-arbres. Détecter et traiter cette situation exige un contrat
supplémentaire ; le fait de distribuer les mêmes octets ne la résout pas.
[RFC 9420 §16.12](https://www.rfc-editor.org/rfc/rfc9420.html#section-16.12).
Pas de quorum cryptographique maison, fusion de branches ou external join
automatique ajouté pour masquer cette limite. Accepter cette ADR nécessitera
une garantie réaliste, ses preuves et un arbitrage explicite si la cible change.

## Q3 — décision UX acceptée le 18 octobre

Si un retrait d'appareil est connu et qu'aucun appareil habilité n'est
disponible pour l'achever cryptographiquement dans une conversation, le propriétaire
accepte de mettre ses nouveaux envois en attente jusqu'à réalisation du retrait.
La lecture locale et les brouillons restent disponibles ; les conversations
non concernées continuent. L'interface doit expliquer l'attente, qui peut durer
jusqu'au retour d'un appareil habilité. Pas de chiffrement dans l'ancienne époque
pour afficher artificiellement un envoi réussi.

Réponse explicite : « Oui, attendre le retrait sécurisé ». Ne pas redemander
cet arbitrage. Ce choix n'efface
pas les messages déjà reçus et ne garantit pas une révocation que le serveur
compromis cache aux clients. La preuve levant la barrière reste à spécifier :
ni compteur SQL, ni ACK d'un appareil, ni simple rôle admin fourni par le serveur
ne suffisent à eux seuls. La délégation d'identité ADR-0010 ne confère pas un
accès à toutes les conversations ni un droit implicite de modifier leurs membres.

## Alternatives et coûts

- Verrou SQL au premier candidat : rejeté comme preuve de validité d'un Commit privé.
- Welcome immédiatement publié : expose l'admission perdante avant arbitrage ;
  retiré de l'API du laboratoire, pas encore d'API produit V3.
- ACK renommé preuve globale : insuffisant contre l'équivoque ; non retenu.
- Journal ordonné : recommandé sous hypothèses explicites ; quotas, dépendances,
  preuve d'admission et traitement des branches à compléter.

Pas d'aller-retour réseau ajouté au chiffrement de chaque message par C1d.
Les changements de groupe attendent déjà leur traitement ; coût réseau global,
latence, reprise et rétention restent à mesurer. L'absence d'un appareil habilité
peut créer une attente UX longue : ne pas la présenter comme un budget garanti.

## Acceptation, migration et réexamen

Avant acceptation technique : préciser preuve d'admission et barrière de
révocation, garantir une reprise sûre sous chaque adversaire retenu, compléter
les tests R02/R03 et le contrat hors ligne Q2. La décision Q3 ne vaut pas
acceptation de toute cette ADR. Aucune primitive, feature MLS en brouillon,
dépendance, permission produit ou levée du gel n'est décidée ici.

Aucune donnée V2 à migrer. Le schéma SQLite C1d concerne uniquement les fixtures
du laboratoire ; il ne remplace pas le plan de démarrage V3 à vide. Réexaminer
cette proposition après preuves contradictoires, résultats TC-301 et revue du
socle TC-302 ; consigner explicitement tout changement de garantie.
