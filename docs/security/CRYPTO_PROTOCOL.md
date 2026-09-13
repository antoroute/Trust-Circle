# Protocole cryptographique

Statut : synthèse V2 observée et direction V3 acceptée
Dernière mise à jour : 2026-09-13

Ce document donne l'orientation de sécurité. La description champ par champ du code actuel, des clés, octets signés, caches et métadonnées est dans [`CRYPTOGRAPHY_V2.md`](CRYPTOGRAPHY_V2.md).

La preuve d'identité d'appareil au niveau du compte est un protocole distinct, documenté octet par octet dans [`DEVICE_TRUST_PROTOCOL_V1.md`](DEVICE_TRUST_PROTOCOL_V1.md). Elle ne modifie pas les enveloppes de message V2.

## État V2 observé

Le client emploie X25519 pour établir des secrets avec les clés publiques statiques des appareils, HKDF-SHA256 pour dériver des clés, AES-256-GCM pour le contenu et l'enveloppement, et Ed25519 pour signer. Une paire X25519 éphémère est produite par message et une clé de message aléatoire est enveloppée séparément pour chaque appareil destinataire.

Cette liste d'algorithmes ne suffit pas à démontrer un protocole sûr. La sérialisation canonique, le domaine signé, l'approbation des clés, la rotation, l'historique, la révocation, la protection contre rejeu et le traitement multi-appareil doivent être spécifiés ensemble.

## Limites connues

- Des clés destinataires statiques peuvent permettre de déchiffrer d'anciens messages capturés si leur clé privée est compromise plus tard.
- Aucune post-compromise security démontrée ne renouvelle automatiquement la confiance après compromission.
- Le format est lié à l'implémentation Dart et certaines conversions sont ambiguës entre texte et octets.
- Depuis `TC-114`, signature, contexte, appareil et tags sont imposés avant affichage, cache ou notification. Les calculs Ed25519/X25519 sont déportés dans l'isolate et le chemin nominal avec annuaire en cache n'ajoute aucun aller-retour réseau.
- Les octets signés sont une concaténation sans séparateurs ni longueurs ; le sel HKDF n'est pas signé et aucune AAD n'est fournie à AES-GCM.
- Le cycle de confiance d'un nouvel appareil reste incomplet côté serveur. Le lot A de `TC-106` isole cependant l'identifiant, les clés et caches locaux par compte et interdit la régénération silencieuse.
- La clé maître du cache persistant de clés de message est désormais aléatoire et propre au compte ; la base SQLite locale n'est toujours pas réellement chiffrée.
- Aucun ensemble de vecteurs de test interopérables ni audit indépendant n'est présent.

## Exigences pour V3

- Spécification indépendante de l'implémentation, version et domaine explicites.
- Encodage canonique binaire ou JSON canonique normé, avec tailles/limites définies.
- Authentification de tous les champs contextuels et protection anti-rejeu.
- Cycle complet : création d'identité, ajout d'appareil, distribution, rotation, révocation, perte et récupération.
- Définition exacte de l'historique accessible à un nouvel appareil.
- Forward secrecy et post-compromise security comme objectifs évalués, pas comme slogans.
- Vecteurs de test multi-implémentations, tests négatifs et fuzzing des parseurs.
- Plan de coexistence/migration des enveloppes V2 sans déchiffrement serveur.
- Revue par un spécialiste indépendant avant la promesse publique.

## Décision V3 acceptée

L'[ADR-0003](../adr/ADR-0003-protocole-crypto-v3.md) retient MLS 1.0
(RFC 9420/RFC 9750) avec OpenMLS en Rust et la suite obligatoire
`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`. Un appareil actif devient un
membre MLS distinct ; le backend reste un Delivery Service sans secret de
groupe. La comparaison, les limites d'audit, l'architecture de performance et
les sources sont dans
[CRYPTOGRAPHY_V3_DECISION.md](CRYPTOGRAPHY_V3_DECISION.md).

Cette décision fixe la cible, pas une propriété déjà fournie par l'application.
`TC-301` reste en cours jusqu'aux prototypes et mesures sur Android, iOS,
Windows et macOS. Les spécifications, migrations, tests négatifs et l'audit
complet restent `TC-302` à `TC-312`.

Ne pas étendre le protocole V2 à de nouveaux types de contenu. Ne pas publier de
revendication FS/PCS avant l'implémentation et l'audit de la V3.

Le format V2 historique ne doit pas être modifié silencieusement. Tout durcissement immédiat doit rester lisible de manière versionnée, et toute donnée non authentifiable doit être rejetée plutôt que présentée comme fiable.
