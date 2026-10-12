# TC-305 — Encodages, domaines et limites V3

Statut : À faire — fiche préparée dans TC-302 B, dépendance non satisfaite
Priorité : critique avant implémentation des parseurs
Date : 2026-10-12
Responsable de décision : revue sécurité ; propriétaire si les limites modifient l'UX
Dépendances : TC-302 acceptée ; contrats d'identité/transitions TC-303/304 stabilisés pour geler les octets

## Contexte et objectif

Le laboratoire transporte des messages synthétiques sans le binding complet
au contexte CircleHaven. Copier son JSON de stockage dans un format réseau
réintroduirait les ambiguïtés que l'adoption de MLS doit éviter.

Objectif : spécifier octet par octet les seuls éléments applicatifs qui
entourent MLS, avec codec canonique existant, domaines distincts, capacités,
limites individuelles/cumulées et exemples vérifiables ; conserver les formats
MLS standard produits et validés par la bibliothèque.

Références : [socle V3](../security/CRYPTOGRAPHY_V3.md),
[revue R03/R06/R08](../quality/TC-302-SPEC_REVIEW.md), ADR-0003,
invariants 14 à 19 et 21/22.

## Travail à réaliser

1. Dresser la liste des champs : type, taille, cardinalité, visibilité,
   provenance, validateur et emplacement (routage, AAD, contexte, contenu).
2. Choisir un codec canonique maintenu pour les champs applicatifs et expliquer
   pourquoi il suffit ; ne pas redéfinir le codec MLS.
3. Figer les domaines et versions pour credential/liaison de clé, contexte de
   conversation, messages et preuves de changement d'appartenance.
4. Définir les égalités exigées entre routage externe et contexte authentifié,
   les identifiants d'opération/message et leurs scopes de déduplication.
5. Figer versions/capacités/extensions admises selon le profil TC-304 ; traiter
   les champs inconnus selon les règles MLS plutôt que par rejet global arbitraire.
6. Définir tailles de texte en octets UTF-8, enveloppes, Welcome, groupes,
   preuves, lots, files, allocations et budgets de travail avant décodage.
   Justifier les bornes de laboratoire avant de les transformer en contrat.
7. Préparer les fixtures positives/négatives avec provenance et résultats
   attendus pour le corpus interopérable TC-308 et le fuzzing TC-309.

## Critères d'acceptation

- [ ] Chaque champ a une représentation unique, sans ambiguïté Unicode, ordre, longueur ou valeur absente.
- [ ] Tous les champs de sécurité sont authentifiés et liés à l'environnement/conversation/génération attendus.
- [ ] Aucun secret/contenu confidentiel placé dans une AAD ou métadonnée visible.
- [ ] Sérialisation/desérialisation définies sans traitement cryptographique Dart ou primitive maison.
- [ ] Limites pré-décodage et cumulées couvrent le pire cas de 256 appareils, y compris arbre clairsemé et preuves.
- [ ] Rejets définis pour troncature, octets résiduels, encodage non canonique, overflow et type/version non admis.
- [ ] Exemples et schémas relus contre TC-303/304, sans prétendre que les tests TC-308/309 ont déjà passé.

## Tests et preuves attendues

S01/S02/S03/S07/S11/S15 : modification de chaque champ, mauvais cercle,
conversation, environnement, génération, auteur, appareil ; collisions de
domaines ; frontières N-1/N/N+1 en octets ; Unicode multi-octets ; doublons de
champs ; longueur déclarée énorme et structure imbriquée. Prévoir versions
inconnues, extensions autorisées/inconnues selon leur règle et alias Base64 si
un transport textuel est retenu. Chiffrer/valider via la bibliothèque standard.

## Composants et hors périmètre

Spécification V3, futurs contrats FFI/API/OpenAPI et fixtures. Pas de contrat
de stockage OpenMLS publié comme protocole réseau ; pas de nouvelles routes,
clé réelle, nouveau codec cryptographique ou test sur la VM dans cette tâche.

## Risques, reset, rollback et décisions

Une limite trop petite empêche les grands groupes de rejoindre ; trop grande,
elle expose au DoS. Une donnée de routage traitée comme authentifiée autorise
la confusion de contexte. Versionner tout changement d'encodage et refuser
les downgrades ; aucune migration d'historique V2 n'est nécessaire.

Demander une décision si taille des messages, nombre d'appareils ou erreur de
compatibilité changent le périmètre produit. La [suspension TC-301](../quality/TC-301-SECURITY_HOLD.md)
n'est pas levée par la rédaction de formats ou de fixtures.
