# Reprise — TC-302, spécification V3 pendant la suspension

```text
Travaille dans /root/Projets/Trust-Circle. Vérifie branche et état Git ; la
préparation et preuves locales C1c–C1f sont sur tc301-mls-prototype, actualisées le 2026-10-23.
Objectif : TC-302 C1g, validateur d'autorité/succession et obligations de retrait,
puis Q2 à partir du socle V3 v0.5.
Ne pas activer MLS dans l'application ni déclarer TC-301 terminée.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md,
docs/tasks/TC-302-specification-v3.md, docs/security/SECURITY_INVARIANTS.md,
docs/adr/ADR-0003-protocole-crypto-v3.md,
docs/adr/ADR-0005-confiance-appareil-compte.md,
docs/adr/ADR-0008-partage-historique-optionnel.md (proposée),
docs/adr/ADR-0009-verification-identite-initiale.md (décision produit acceptée),
docs/adr/ADR-0010-referent-identite-groupes.md (décision produit acceptée),
docs/adr/ADR-0011-perimetre-restauration-v1.md (périmètre accepté, preuves ouvertes),
docs/adr/ADR-0012-livraison-admission-v3.md (proposée, Q3 produit décidée),
docs/product/V1_DECISIONS.md, docs/security/CRYPTOGRAPHY_V3.md,
docs/quality/TC-302-SPEC_REVIEW.md, docs/security/V3_FEASIBILITY_STUDY.md,
docs/security/V3_ADMISSION_RECOVERY_STUDY.md,
docs/quality/TC-302-RECOVERY_GUARD.md,
docs/quality/TC-302-ADMISSION_RELEASE.md,
docs/quality/TC-302-EPOCH_OUTBOX.md,
docs/quality/TC-302-REVOCATION_SIGNAL.md,
et docs/quality/TC-301-SECURITY_HOLD.md ;
puis les documents et le code réellement
nécessaires à chaque constat. N'assimile pas le laboratoire au produit.

Décision propriétaire toujours en vigueur : suspendre les nouveaux paquets
en attendant une release amont compatible. Pas de fork, de mise en quarantaine
de libcrux, de changement de fournisseur ni d'ignore RustSec. Pas de nouvel
essai utilisateur avec les anciens paquets. Ne pas relancer les matrices CI
pour de simples changements documentaires. Une release amont ne lève pas
automatiquement le gel : suivre la procédure et demander l'accord de reprise.

La demande explicite « continue en mettant en place » du 17 octobre a autorisé
C1c : un garde et des tests dans le laboratoire natif, pas l'intégration produit.
La continuation du 18 octobre réalise C1d : Welcome différé et outbox perdante
invalidée, avec deux lectures adaptées dans le consommateur Rust du pont isolé.
La continuation validée le 23 octobre réalise C1e : anciennes sorties applicatives
invalidées atomiquement après fusion, contrôles historiques conservés pour le
rattrapage, contre-exemples de levée de barrière insuffisante. Ce n'est pas Q3 complète.
La poursuite C1f ajoute un arrêt ciblé injecté au laboratoire, sans authentifier
le signal ni débloquer automatiquement ; sources/portées proposées dans son rapport.
Ne pas revenir par défaut à une reprise exclusivement documentaire ; distinguer
les preuves locales réalisables des contrats encore ouverts. Ne pas étendre cette
autorisation à de nouveaux paquets, à une réadmission non spécifiée ou au backend.
TC-301 C2,
les budgets, les preuves physiques et le fournisseur final restent ouverts.
Aucune donnée V2 à migrer. TC-307 signifie démarrage V3 à vide et retrait de
V2 sans downgrade ; ce n'est pas l'autorisation d'effacer une VM maintenant.
Ne modifier ni staging/production, ni OPNsense, ni accès SSH au PC.

Lots A/B disponibles : CRYPTOGRAPHY_V3.md, exigences V3-001 à V3-020 et scénarios
S01 à S20. Tous sont des critères cibles ; les tests « partiel labo » ne
valident pas le contrat CircleHaven complet. Les formats binaires, l'identité,
les politiques d'époque et la gestion du hors ligne restent à préciser.

La revue interne du lot B a produit R01–R08. Ils sont attribués, NON résolus.
Les fiches TC-303/304/305 existent et restent « À faire ». Ne pas répéter leur
création ni présenter la revue sur papier comme des tests exécutés.

Les études C1/C1b sont rédigées, pas à recommencer. Elles n'ont exécuté aucun
test crypto. C1c, réalisé ensuite sur demande, fournit une preuve G06 synthétique
et des preuves partielles G07/G08 : 30 tests moteur RustCrypto dont 10 nouveaux,
dont un test pilote 20 cas de crash ; 3 tests Rust du pont, fmt et Clippy réussis.
Depuis C1d, 38 fonctions moteur réussissent, dont 8 nouvelles ; deux pilotent
24 cas de crash. Trois tests Rust du pont, fmt et Clippy passent. G04/G05
partiels : crash/libération/invalidation et contre-exemple de deux admissions
divergentes, pas un transport, une preuve globale ou une détection de fork.
Les autres aspects F01–F10/G01–G08 restent à prouver. Aucun constat fermé.
Depuis C1e, 48 fonctions moteur réussissent, dont 10 nouvelles ; trois pilotent
28 cas de crash. Trois tests Rust du pont, fmt et Clippy passent. S08/S10/S13
partiels : sorties applicatives périmées bloquées, rollback/restart, autre groupe
et rattrapage des contrôles. Contre-exemples : Update gagnant sans retrait,
Welcome ancien encore ouvrable et indice de feuille réutilisé. Aucun benchmark,
audit de dépendances actualisé ou test OS dans ce lot ; aucun constat fermé.
Depuis C1f, 57 fonctions moteur réussissent, dont 9 nouvelles ; quatre pilotent
30 cas de crash. Trois tests Rust du pont, fmt et Clippy passent. Arrêt ciblé
avant fusion, Welcome masqués, autre groupe et réception préservés, pas d'unlock.
Lire le code et les tests C1c–C1f avant de prolonger : ne pas les réécrire.

Pour la stabilisation restante TC-302 C1 :
1. R02 : approfondir la piste de journal ordonné RFC 9750 §5.3. Établir le
   couplage Welcome/arbitrage vérifiable par un nouvel arrivant, la barrière
   de retrait et la reprise face à une divergence. Ne pas traiter une Proposal
   absente comme invalide ni affirmer que tous acceptent forcément le même
   Commit hostile. Pas de quorum/consensus maison, fusion ou external join
   automatique ; compléter l'ADR-0012 proposée, sans l'accepter seul.
   C1d implémente dans le laboratoire la libération du Welcome après fusion locale durable,
   sans prépublication sur le DS. Cela ne prouve pas un consensus global et ne
   résout pas l'auteur hostile. Définir les garanties sous chaque adversaire,
   ne pas renommer un ACK, GroupInfo ou défi au même auteur en preuve indépendante.
   La barrière de révocation doit rester distincte d'un compteur d'époque SQL.
   API du laboratoire : add/retry/outbox masquent le Welcome pending ; après
   fusion durable, relire outbox(operation). Un perdant retourne Superseded,
   avec tombstone d'idempotence ; pas de réémission automatique d'anciens octets.
   Migration v3 : anciennes outboxes/pending sans preuve arrêtent les opérations,
   inbox préservée ; nouvelles fixtures privées, pas de déblocage ou downgrade.
   Migration v4 : v3 avec sorties application d'époque inconnue active le
   garde ; v3 sans ces sorties n'ajoute pas de signal et ne retire jamais un
   garde existant. Arrêter les anciens acteurs avant mise à niveau.
   C1e invalide seulement les anciennes sorties application à chaque fusion,
   pas les contrôles historiques utiles au rattrapage. Superseded conserve
   l'idempotence, pas les octets ; le produit devra conserver séparément
   intention et copie chiffrée pour éviter perte ou réémission aveugle.
   C1f propose les sources/portées ; C1g doit valider le signal, la cible compte/appareil/incarnation
   et la génération de conversation. L'indice de feuille seul est réutilisable.
   Vérifier l'absence de toutes les cibles dans l'état validé, les obligations
   connues et les autres gardes, avec atomicité et sérialisation du départ.
   Une époque supérieure, un pending perdu ou un ACK ne suffisent pas ; un
   Update concurrent peut laisser la cible présente. Aucune intention durable
   Q3 authentifiée n'est implémentée dans le laboratoire. C1f offre seulement
   hold_group_synthetic(group, fault) : arrêt irréversible par cette API,
   schéma v5, sends/retries/adds refusés et Welcome masqués dans l'outbox.
   Réception et Update/Remove restent disponibles, sans contrôle de rôle produit.
   Le garde global C1c reste prioritaire. Échec de persistance : latch du seul
   acteur courant ; avant commit, un crash perd le signal. Une source durable
   doit le rejouer avant publication. Aucun compteur/ACK/Remove ne lève le hold.
   Pas d'appel du hook depuis un événement V1 ni de SQL DELETE pour simuler une
   reprise. Il ne contient pas une cible/autorité et n'est pas le parcours produit.
   Conditions nécessaires proposées dans ADR-0012, pas preuve suffisante contre
   l'équivoque ; un Welcome ancien valide ne prouve pas une admission actuelle.
   Création et jonction utilisent la même extension standard ratchet_tree.
   OpenMLS peut consommer le KeyPackage dès la préparation du Welcome : inclure
   les contrôles applicatifs dans la transaction ; pas d'attente réseau sous verrou.
2. R07 : tenir compte du reuse_guard standard confirmé dans OpenMLS 0.9.0.
   Il n'apporte pas de fraîcheur. Comparer ancrage indépendant et reprise sans
   ancien état ; traiter image complète, marqueur OS restauré et snapshot RAM.
   Un témoin seulement au démarrage ou un contrôle à l'upload ne suffit pas.
   ADR-0011 est désormais acceptée : crash courant repris ; backups ordinaires
   sans état actif ; réactivation après restauration détectée avec historique
   lisible préservé ; images complètes/snapshots sans garantie de détection.
   Ne pas redemander ce périmètre ni prétendre que ses mécanismes sont prouvés.
   Ne pas affirmer que l'exclusion des backups détecte toutes les restaurations.
   C1c reçoit seulement un signal externe : require_reactivation persiste un
   arrêt, chaque transaction le relit avant MLS, outbox bloquée, inbox lisible.
   Aucun détecteur OS ni déblocage ; le marqueur est restaurable avec la base.
   Échec d'écriture : acteur courant bloqué, pas de garantie durable ou globale
   avant retry réussi. Des octets déjà retournés ne peuvent pas être rappelés.
   Ne pas ajouter une méthode de reset/unlock ou réutiliser les anciens secrets
   pour simuler une réadmission. Le futur transport doit sérialiser son départ.
   Cette décision ne réduit pas le modèle de menace DS/identité. Priorité au chemin
   courant sans aller-retour réseau supplémentaire par message.
3. R08 : Q4 est décidée et consignée le 17 octobre dans ADR-0009 : vérification
   initiale obligatoire hors bande, renouvelée après remplacement complet
   d'identité, pas par connexion/message. Ne pas redemander cet arbitrage.
   ADR-0010 décide la délégation explicite au référent propriétaire/admin vérifié,
   pour les identités qu'il a personnellement vérifiées et attestées, avec risque
   du référent compromis/trompé accepté. Distinguer UI directe/attestée ; aucun
   rôle JSON, délégation supplémentaire implicite ou droits privés étendus.
   Ne pas redemander cet arbitrage ; préciser portée, rotation et contrat.
   Une attestation ne vaut pas transparence automatique. AKD est un candidat
   étudié, pas sélectionné ;
   ses licences et celles de Signal KT ne sont pas une validation stores.
   Stabiliser ancre/continuité/rôles et préciser les limites d'équivoque.
4. Documenter options, recommandation, limites, preuves requises et effets UX.
   Les sources amont datées/épinglées et les contre-exemples sont dans l'étude.
   Ne pas activer une feature MLS en brouillon pour combler un contrat ouvert.
   Une attribution à TC-303/304/306 ne ferme pas ces bloqueurs structurels.
5. Réponse Q1 reçue le 12 octobre : le propriétaire veut choisir de partager
   l'historique ou non, vers appareil ET nouvelle personne, si ressources et
   complexité restent raisonnables. Ne pas lui attribuer un accord au seul
   accès futur. Autorité décidée le 12 octobre : propriétaire ou administrateur
   participant à la conversation, choix de période et événement visible pour
   les membres ; vers son propre appareil, confirmation depuis un appareil
   déjà approuvé. Ne pas redemander ce choix. Lire ADR-0008 pour les limites.
   Étudier copie sélective rechiffrée, source disponible, provenance distincte,
   destinataires limités et priorité au direct, sans exporter clés/états MLS.
   Contrat détaillé, faisabilité et inclusion V1 restent à valider ; cette
   décision d'autorité n'accepte pas l'ADR entière et ne lance aucune
   implémentation. Q3 décidée le 18 octobre : si aucun appareil habilité ne peut
   achever le retrait, les nouveaux envois attendent ; lecture locale/brouillons
   et autres conversations disponibles, potentiellement jusqu'au retour d'un
   appareil habilité. Ne pas redemander ce choix. Il n'efface pas les messages
   reçus et ne couvre pas une révocation cachée par un serveur compromis.
   C1f-A1 posée, réponse en attente : permettre à un participant autorisé
   d'exécuter un retrait déjà demandé/authentifié par la bonne autorité, ou
   limiter cette exécution au propriétaire/admin participant. Ne pas confondre
   décision de retrait et exécution. Consigner une réponse si elle arrive ;
   ne pas la présumer ni redemander Q3. Pas de rôle supplémentaire implémenté.
   Le mécanisme levant la barrière reste à spécifier/tester ; ADR-0012 n'est pas
   intégralement acceptée. Présenter Q2 et journal expiré de Q5 une fois leurs
   options et coûts établis ; ne pas répéter les arbitrages déjà reçus.
6. Mettre à jour la spécification et les fiches sans démarrer l'intégration produit.
   Garder les preuves locales dans prototypes/mls sur données synthétiques,
   sans nouvelles dépendances ni changement de fournisseur. Pas d'activation
   du parcours de récupération dans Flutter avant contrat et détecteurs éprouvés.
   Une architecture de base viable et TC-301 close sont requises pour accepter
   TC-302 ; aucune de ces conditions n'est actuellement annoncée acquise.
7. Vérifier liens, couverture exigences/scénarios/constats, diff et absence de
   dépendances, paquets ou infrastructure modifiés. Pour le code laboratoire :
   cargo fmt --check, cargo test --locked --offline --features interop,
   cargo clippy --locked --offline --all-targets --features interop -- -D warnings,
   puis les tests Rust du pont si l'API native change. Commandes exactes dans C1e.
   Aucun résultat local ne valide les budgets ou la matrice des OS cibles.

Préserve les neuf documents déjà modifiés par le propriétaire : contexte,
index, ADR-0003, PLATFORM_COMPATIBILITY, TRACEABILITY, CRYPTOGRAPHY_V2,
CRYPTOGRAPHY_V3_DECISION, CRYPTO_PROTOCOL et THREAT_MODEL. Certains contiennent
des formulations anciennes (« V3 à décider », migration V2) ; signale l'écart,
ne fais pas git restore ni un commit global. En cas de modification nécessaire,
isole strictement ton ajout et les corrections approuvées.

Fin : résultat, fichiers, contrôles réellement exécutés, validations non faites,
risques et prochaine sous-tâche. Le travail documentaire n'est pas un audit
cryptographique et ne suffit pas à fermer TC-302 ou la Phase 3.
```

Modèle conseillé : **GPT-6 Astra, raisonnement élevé** pour la conception et
la revue contradictoire. Réserver le niveau maximal aux cas difficiles qui
le justifient ; un effort faible suffit aux liens et mises à jour mécaniques.
Recommandation de travail, pas mesure comparative réalisée sur ce projet.
Vérifiée le 23 octobre 2026 avec OpenAI Docs :
[fiche officielle GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
