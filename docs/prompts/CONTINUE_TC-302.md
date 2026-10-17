# Reprise — TC-302, spécification V3 pendant la suspension

```text
Travaille dans /root/Projets/Trust-Circle. Vérifie branche et état Git ; la
préparation documentaire est sur tc301-mls-prototype, actualisée le 2026-10-17.
Objectif : TC-302 C1b, approfondissement des points structurels du socle V3 v0.4.
Ne pas activer MLS dans l'application ni déclarer TC-301 terminée.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md,
docs/tasks/TC-302-specification-v3.md, docs/security/SECURITY_INVARIANTS.md,
docs/adr/ADR-0003-protocole-crypto-v3.md,
docs/adr/ADR-0005-confiance-appareil-compte.md,
docs/adr/ADR-0008-partage-historique-optionnel.md (proposée),
docs/adr/ADR-0009-verification-identite-initiale.md (décision produit acceptée),
docs/product/V1_DECISIONS.md, docs/security/CRYPTOGRAPHY_V3.md,
docs/quality/TC-302-SPEC_REVIEW.md, docs/security/V3_FEASIBILITY_STUDY.md
et docs/quality/TC-301-SECURITY_HOLD.md ;
puis les documents et le code réellement
nécessaires à chaque constat. N'assimile pas le laboratoire au produit.

Décision propriétaire toujours en vigueur : suspendre les nouveaux paquets
en attendant une release amont compatible. Pas de fork, de mise en quarantaine
de libcrux, de changement de fournisseur ni d'ignore RustSec. Pas de nouvel
essai utilisateur avec les anciens paquets. Ne pas relancer les matrices CI
pour de simples changements documentaires. Une release amont ne lève pas
automatiquement le gel : suivre la procédure et demander l'accord de reprise.

La prochaine tâche peut avancer sous forme documentaire uniquement. TC-301 C2,
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

La première étude C1 est rédigée, pas à recommencer. Elle n'a exécuté aucun
test crypto : F01–F10 sont des cas à prouver. Aucun constat R01–R08 fermé.

Pour TC-302 C1b :
1. R02 : approfondir la piste de journal ordonné RFC 9750 §5.3. Établir le
   couplage Welcome/arbitrage vérifiable par un nouvel arrivant, la barrière
   de retrait et la reprise face à une divergence. Ne pas traiter une Proposal
   absente comme invalide ni affirmer que tous acceptent forcément le même
   Commit hostile. Pas de quorum/consensus maison, fusion ou external join
   automatique ; préparer l'addendum ADR-0003 nécessaire, sans l'accepter seul.
2. R07 : tenir compte du reuse_guard standard confirmé dans OpenMLS 0.9.0.
   Il n'apporte pas de fraîcheur. Comparer ancrage indépendant et reprise sans
   ancien état ; traiter image complète, marqueur OS restauré et snapshot RAM.
   Un témoin seulement au démarrage ou un contrôle à l'upload ne suffit pas.
   Ne pas affirmer que l'exclusion des backups détecte toutes les restaurations,
   ni limiter le modèle de menace sans décision explicite. Priorité au chemin
   courant sans aller-retour réseau supplémentaire par message.
3. R08 : Q4 est décidée et consignée le 17 octobre dans ADR-0009 : vérification
   initiale obligatoire hors bande, renouvelée après remplacement complet
   d'identité, pas par connexion/message. Ne pas redemander cet arbitrage.
   Décliner le parcours de groupe. QR direct n'est ni délégation de confiance au cercle
   ni transparence automatique. AKD est un candidat étudié, pas sélectionné ;
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
   implémentation. Présenter les arbitrages Q2/Q3/Q5 quand les options et coûts
   UX/sécurité sont établis ; le choix d'autorité Q1 ne doit pas être redemandé.
6. Mettre à jour la spécification et les fiches sans démarrer leur implémentation.
   Une architecture de base viable et TC-301 close sont requises pour accepter
   TC-302 ; aucune de ces conditions n'est actuellement annoncée acquise.
7. Vérifier liens, couverture exigences/scénarios/constats, diff et absence de
   code, dépendances, paquets ou infrastructure modifiés.

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
Vérifiée avec OpenAI Docs :
[fiche officielle GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
