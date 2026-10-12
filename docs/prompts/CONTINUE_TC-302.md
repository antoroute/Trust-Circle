# Reprise — TC-302, spécification V3 pendant la suspension

```text
Travaille dans /root/Projets/Trust-Circle. Vérifie branche et état Git ; la
préparation documentaire est sur tc301-mls-prototype, datée du 2026-10-12.
Objectif : TC-302 C1, faisabilité des points structurels du socle V3 v0.3.
Ne pas activer MLS dans l'application ni déclarer TC-301 terminée.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md,
docs/tasks/TC-302-specification-v3.md, docs/security/SECURITY_INVARIANTS.md,
docs/adr/ADR-0003-protocole-crypto-v3.md,
docs/adr/ADR-0005-confiance-appareil-compte.md,
docs/adr/ADR-0008-partage-historique-optionnel.md (proposée),
docs/product/V1_DECISIONS.md, docs/security/CRYPTOGRAPHY_V3.md,
docs/quality/TC-302-SPEC_REVIEW.md et docs/quality/TC-301-SECURITY_HOLD.md ;
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

Pour TC-302 C1 :
1. R02 : étudier le traitement d'un candidat Commit privé invalide ordonné par
   le serveur. Distinguer position de transport et époque validée par un client.
   Préciser disponibilité et reprise sans fusion de branches ni rollback de
   secrets. Aucun quorum utilisateur n'est autorisé par le périmètre V1.
2. R07 : étudier l'ancrage de fraîcheur d'un état restauré sur les OS cibles,
   avant tout nouveau chiffrement. Un compteur dans la base restaurée ne suffit
   pas. Séparer protection contre crash, restauration et appareil compromis ;
   comparer des solutions maintenues, leurs limites et le coût de reprise.
3. R08 : identifier les options d'ancrage de première confiance et de détection
   des vues divergentes du service d'identité ; vérifier les sources primaires,
   licences et hypothèses, sans créer un protocole de transparence maison.
4. Documenter options, recommandation, limites, preuves requises et effets UX.
   Une attribution à TC-303/304/306 ne ferme pas ces bloqueurs structurels.
5. Réponse Q1 reçue le 12 octobre : le propriétaire veut choisir de partager
   l'historique ou non, vers appareil ET nouvelle personne, si ressources et
   complexité restent raisonnables. Ne pas lui attribuer un accord au seul
   accès futur. Lire ADR-0008 et toute réponse à la question sur l'autorité
   de partage (propriétaire/admin participant, ou chacun ses propres messages).
   Étudier copie sélective rechiffrée, source disponible, provenance distincte,
   destinataires limités et priorité au direct, sans exporter clés/états MLS.
   Ni autorisations finales ni inclusion V1 décidées ; aucune implémentation
   automatique. Présenter Q2–Q5 seulement avec options et coûts UX/sécurité.
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
