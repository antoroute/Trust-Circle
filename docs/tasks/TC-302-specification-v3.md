# TC-302 — Spécification indépendante du protocole V3

Statut : En cours — lot A documentaire ; validation finale bloquée par TC-301
Priorité : critique avant intégration
Date : 2026-10-12
Responsable de décision : propriétaire du produit pour les compromis UX ; revue sécurité pour le contrat
Dépendances : ADR-0003 acceptée, ADR-0005, TC-301 pour la clôture

## Contexte et autorisation de travail

Le propriétaire demande de passer à l'étape suivante, sans lever sa décision
de suspendre les nouveaux paquets. La préparation de la spécification peut
avancer indépendamment de la disponibilité du fournisseur crypto. Cela ne
clôture pas TC-301, n'autorise pas de nouveaux paquets et ne lance pas TC-310/311.
Lire [la suspension](../quality/TC-301-SECURITY_HOLD.md).

Le laboratoire ne constitue pas la spécification produit : identités
synthétiques, SQLite non chiffré, transport simulé et absence de politique
hors ligne complète. Le transformer directement en moteur de production
laisserait ces lacunes implicites.

## Objectif mesurable

Produire [CRYPTOGRAPHY_V3.md](../security/CRYPTOGRAPHY_V3.md), lisible sans
connaître Rust ou Flutter, avec frontières de confiance, exigences numérotées,
séquences, erreurs, preuves attendues et décisions ouvertes attribuées.
Chaque exigence doit distinguer décision acquise, proposition et preuve réelle.

La spécification décrit l'intégration de MLS, pas de nouvelles primitives.
Les formats octet par octet et les politiques détaillées seront affinés dans
TC-303 à TC-305, puis intégrés sans changer silencieusement ce socle.

## Hors périmètre

- Changer de protocole, de suite ou de fournisseur, contourner l'audit.
- Modifier dépendances, lockfiles, paquets ou pipelines de distribution.
- Implémenter MLS dans le client principal ou de nouvelles routes backend.
- Modifier la VM, les règles réseau ou rouvrir l'accès au PC du propriétaire.
- Migrer comptes, conversations, historiques ou secrets V2 : aucun à conserver.
- Déclarer validés les budgets, le chiffrement au repos ou une protection contre
  un serveur d'identité compromis.

## Lots et ordre de travail

1. **A — socle documentaire (ce lot)** : vocabulaire, frontières, profil MLS,
   transactions, synchronisation, menace et matrice d'acceptation ; corriger
   TC-307 dans la roadmap pour refléter un démarrage à vide.
2. **B — revue contradictoire du contrat** : parcourir les scénarios de perte
   réseau, appareil révoqué hors ligne, Commit concurrent/invalide et Welcome
   prématuré ; préparer les choix produit nécessaires et les fiches TC-303/304/305.
   Travail documentaire possible pendant la suspension, pas validation runtime.
3. **C — stabilisation du socle** : incorporer les conclusions TC-301 après
   levée de la suspension et preuves manquantes, revoir les divergences documentaires,
   accepter le contrat de base avant d'engager l'implémentation.

TC-303/304/305 approfondissent ensuite le socle accepté. Leurs détails ne sont
pas présentés comme déjà résolus par TC-302 ; la spécification finale reste
évolutive jusqu'à ces compléments et à l'audit TC-312.

## Critères d'acceptation

- [x] Socle v0.1 rédigé, explicitement non approuvé et non implémenté.
- [x] Standard MLS séparé des règles CircleHaven et du comportement du laboratoire.
- [x] Relations compte/appareil/cercle/conversation/groupe et frontière serveur définies.
- [x] Création, ajout, retrait, message, reprise et échecs décrits au niveau contractuel.
- [x] Exigences de persistance, authenticité et performance reliées à des scénarios.
- [x] Absence de migration V2 et interdiction de downgrade consignées.
- [x] Décisions ouvertes et écarts avec les anciens documents attribués.
- [ ] Revue contradictoire du lot B achevée et constats traités/attribués.
- [ ] TC-301 close avec fournisseur, dépendances et budgets étayés.
- [ ] Socle accepté et références documentaires alignées, sans écraser les modifications du propriétaire.

## Plan de validation

- Vérification documentaire : liens relatifs, identifiants d'exigences/scénarios,
  cohérence roadmap/fiche/prompt, absence de promesse de sécurité non prouvée.
- Relecture des ADR, décisions V1, invariants et des fonctions/tests du
  laboratoire concernés ; les preuves existantes ne sont citées que dans leur périmètre.
- `git diff --check` ; vérifier que tous les changements du lot sont documentaires.
- Ne pas relancer les matrices CI, compiler de paquets ou déclencher un déploiement
  pour ce lot. Les tests nouveaux de la matrice sont des tests **à écrire**.

### Contrôles du lot A

Le 12 octobre (heure de Paris) : 118 liens relatifs vérifiés dans les documents
du lot et leurs index ; 20 identifiants d'exigences uniques, tous couverts par
les 20 scénarios ; cinq questions produit identifiées. `git diff --check`
réussi. Les deux verrous de distribution restent activés et inchangés.
Aucun test runtime, build, appel à la VM ou essai sur appareil n'est effectué
dans ce lot documentaire. Ces contrôles ne constituent pas une revue crypto.

## Risques, reset et retour arrière

La principale menace documentaire serait de transformer des hypothèses en
garanties, notamment révocation « immédiate », historique des nouveaux
appareils, ordre serveur et conservation d'anciennes époques. Le socle les
rend explicites et n'autorise aucun contournement des invariants.

Un retour arrière de ce lot retire seulement ses ajouts documentaires, par
modification ciblée. Aucun effacement de données ni changement d'environnement
n'est effectué. TC-307 préparera séparément un reset vérifié et borné ; la
décision de repartir à vide n'autorise pas une suppression opportuniste ici.

## Décisions humaines nécessaires

Aucune pour rédiger le lot A. Avant gel des politiques : arbitrer l'UX des
changements de groupe, la durée de fonctionnement hors ligne et les limites de
récupération ; voir les questions Q1–Q5 de la spécification. La suspension reste
une décision explicite en vigueur, pas une option à retirer automatiquement.

## Livrables et reprise

- [Socle V3 v0.1](../security/CRYPTOGRAPHY_V3.md).
- [Roadmap corrigée](../roadmap/ROADMAP.md) et index documentaire.
- [Prompt structuré TC-302](../prompts/CONTINUE_TC-302.md).

Prochaine sous-tâche : **TC-302 lot B**, sans nouveaux paquets. TC-301 C2 reste
à reprendre selon les conditions de sa suspension, sans être sauté.
