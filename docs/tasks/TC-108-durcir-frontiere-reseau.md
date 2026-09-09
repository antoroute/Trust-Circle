# TC-108 — Durcir CORS, proxy de confiance, quotas et WebSocket

Statut : Terminée — validée localement et sur staging le 2026-09-09
Priorité : P0 sécurité et disponibilité
Dépendances : TC-102, TC-107 terminées

## Problème

Auth et Messaging reflètent actuellement toute origine CORS et activent les
credentials navigateur alors que la V1 ne possède pas de client Web. Auth
applique un quota global, mais Messaging et les événements Socket.IO ne sont
pas bornés en fréquence. Inversement, Fastify ne fait pas confiance au proxy :
derrière Nginx, tous les clients peuvent donc partager la même adresse pour les
quotas. Une activation naïve de `trustProxy: true` permettrait toutefois à un
client de forger son adresse via `X-Forwarded-For`.

## Objectifs

- Autoriser les applications natives sans en-tête `Origin`, mais ne répondre
  en CORS qu'aux origines navigateur explicitement configurées.
- Désactiver les credentials CORS inutiles et limiter méthodes/en-têtes.
- Faire dériver `request.ip` de CIDR explicites de proxies de confiance,
  jamais de toute la chaîne fournie par le client.
- Borner les rafales HTTP, connexions Socket.IO et événements coûteux sans
  ralentir connexion, chargement normal, frappe ni reconnexion.
- Retourner des erreurs déterministes avec délai de reprise, sans journaliser
  token, preuve, payload ou secret.

## Choix retenus après audit

- `CORS_ALLOWED_ORIGINS` : liste d'origines HTTPS exactes séparées par des
  virgules ; liste vide sur staging tant qu'aucun client Web n'existe.
- `TRUSTED_PROXY_CIDRS` : liste d'adresses ou CIDR exacts ; le staging ne fait
  confiance qu'à l'adresse fixe du gateway Nginx. Aucun booléen global
  `true`, et Nginx remplace la chaîne entrante par l'adresse réelle du client.
- Quotas en mémoire acceptables tant que chaque service possède une seule
  instance ; Redis/distribution relèvera de l'exploitation multi-réplique.
- Quotas généreux et à rafale : Auth ciblé par route, Messaging global avec
  limites d'écriture, Socket.IO séparant handshake, abonnements et frappe.
- Un dépassement éphémère de frappe est ignoré ou consolidé ; il ne déconnecte
  pas l'utilisateur et ne bloque pas le chargement REST des messages.
- Les abonnements Socket.IO répondent par ACK immédiat. Le délai client ne
  constitue qu'un filet de sécurité de transport, jamais le chemin nominal.
- Les limites distribuées, l'optimisation globale de présence et la refonte de
  reconnexion restent respectivement hors V1 mono-réplique, TC-510 et TC-505.

## Lots

### A — Configuration réseau commune

- Parser et valider origines exactes et CIDR des proxies.
- Configurer Fastify et Socket.IO avec la même politique d'origine.
- Tester origine absente, autorisée, interdite et valeur de configuration
  invalide.

### B — Quotas HTTP

- Définir des limites globales protectrices et des limites Auth sensibles.
- Ajouter Messaging au rate limiter sans partager tous les utilisateurs sous
  l'adresse du gateway.
- Tester rafale, `429`, `Retry-After`, remise à zéro et IP forgée.

### C — Quotas Socket.IO et UX

- Borner les handshakes par IP et les événements par socket/compte.
- Consolider côté Flutter les événements de frappe redondants.
- Préserver les réabonnements par batch et traiter une limitation sans boucle
  de reconnexion agressive.

### D — Gateway, documentation et staging

- Aligner Nginx sur les limites et en-têtes transmis réellement nécessaires.
- Documenter la topologie de confiance et le changement requis si un proxy
  externe est ajouté.
- Étendre tests et smoke staging, mesurer la latence nominale, vérifier santé,
  redémarrages et logs, puis documenter le rollback.

## Acceptation

- [x] Une origine inconnue ne reçoit aucun en-tête CORS permissif.
- [x] Une requête native sans `Origin` continue de fonctionner.
- [x] `request.ip` est correct derrière les CIDR configurés et ne
      fait pas confiance à une chaîne arbitraire.
- [x] Les routes sensibles et Messaging répondent `429` avec reprise bornée.
- [x] Connexions et événements Socket.IO abusifs sont limités avant SQL/room.
- [x] La frappe normale et les reconnexions par lots restent transparentes.
- [x] Aucun nouveau stockage ou log de secret/payload n'est introduit.
- [x] Tests locaux, analyse Flutter et smoke/probes staging réussissent.

## Preuves de fermeture

- Commit d'implémentation :
  `2ae191d792237979a1bcb54d95c649a6bba150d5` ; extension du smoke ACK :
  `054eabdf65624d4c5db654742ba7ddf77e88a4cc`.
- Suites locales : Auth `28/28`, Messaging `91/91`, Flutter `38/38` ; analyse
  Flutter sans erreur ni warning, avec 85 lints informatifs historiques.
- Staging LXC106 : quatre services sains, zéro redémarrage, labels sur
  `054eabdf65624d4c5db654742ba7ddf77e88a4cc`, aucun log sévère dans la
  fenêtre post-déploiement.
- Smoke réel : origines HTTP inconnues sans ACAO, handshake Socket.IO avec
  origine inconnue refusé, client natif sans `Origin` admis, appareil actif
  authentifié et ACK d'abonnement conversation reçu.
- Latence de santé via la gateway sur 40 appels : Auth moyenne `1,074 ms`,
  maximum `1,604 ms` ; Messaging moyenne `1,069 ms`, maximum `1,666 ms`.
- Aucun schéma ni volume n'a changé. Le volume PostgreSQL a été conservé
  pendant la recréation des réseaux.

## Rollback

La release précédant `TC-108`,
`9ffc84f36e47aee5d86eb03f14307c93f5ef02dd`, reste disponible. La
configuration antérieure est conservée en mode `0600` sous
`/opt/trust-circle-staging/shared/staging.env.before-2ae191d79223`. Aucun
rollback de base n'est nécessaire.

## Hors périmètre

- Suppression du faux `APP_SECRET` public : `TC-109`.
- TLS et exposition externe du staging : `TC-113`.
- Quotas distribués Redis et plusieurs réplicas : Phase 2/exploitation.
- WAF, CDN, anti-DDoS opérateur et règles du proxy de production.
