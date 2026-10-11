# Reprise — TC-302, spécification V3 pendant la suspension

```text
Travaille dans /root/Projets/Trust-Circle. Vérifie branche et état Git ; la
préparation documentaire est sur tc301-mls-prototype, datée du 2026-10-12.
Objectif : TC-302 lot B, revue contradictoire du socle V3 v0.1.
Ne pas activer MLS dans l'application ni déclarer TC-301 terminée.

Lis entièrement AGENTS.md, docs/PROJECT_CONTEXT.md,
docs/tasks/TC-302-specification-v3.md, docs/security/SECURITY_INVARIANTS.md,
docs/adr/ADR-0003-protocole-crypto-v3.md,
docs/adr/ADR-0005-confiance-appareil-compte.md,
docs/product/V1_DECISIONS.md, docs/security/CRYPTOGRAPHY_V3.md et
docs/quality/TC-301-SECURITY_HOLD.md ; puis les documents et le code réellement
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

Lot A disponible : CRYPTOGRAPHY_V3.md, exigences V3-001 à V3-020 et scénarios
S01 à S20. Tous sont des critères cibles ; les tests « partiel labo » ne
valident pas le contrat CircleHaven complet. Les formats binaires, l'identité,
les politiques d'époque et la gestion du hors ligne restent à préciser.

Pour le lot B :
1. Rejouer sur papier les séquences avec deux appareils du même compte,
   un troisième membre, coupure réseau et changement d'appartenance.
2. Chercher une contradiction entre ACK serveur, Commit accepté au transport,
   Commit vérifié, Welcome délivré et fusion locale. Un Commit privé est
   opaque au serveur : il ne peut pas en certifier la validité cryptographique.
3. Examiner le Commit perdant/invalide, l'écho exact de l'auteur et le serveur
   qui présente des vues différentes. OwnPrivateMessage n'est pas une preuve.
4. Définir les options pour appareil révoqué hors ligne, état ancien restauré,
   journal expiré, message retardé et lot contenant un élément hostile.
   Ne pas inventer une promesse de révocation instantanée universelle.
5. Présenter les décisions produit Q1–Q5 au moment où elles deviennent utiles,
   avec une recommandation motivée et ses coûts UX/sécurité. Ne pas transformer
   les propositions du brouillon en décisions déjà acceptées.
6. Préparer les fiches TC-303/304/305 à partir des constats, sans déclarer leur
   dépendance TC-302 satisfaite ni implémenter de formats non approuvés.
7. Vérifier liens, couverture des exigences, diff et absence de code modifié.

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
