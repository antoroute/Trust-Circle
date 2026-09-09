# TC-108 — Durcir CORS, proxy de confiance, quotas et WebSocket

Statut : En cours — implémentation par lots
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
- Faire dériver `request.ip` d'un nombre explicite de proxies de confiance,
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

- [ ] Une origine inconnue ne reçoit aucun en-tête CORS permissif.
- [ ] Une requête native sans `Origin` continue de fonctionner.
- [ ] `request.ip` est correct derrière le nombre configuré de proxies et ne
      fait pas confiance à une chaîne arbitraire.
- [ ] Les routes sensibles et Messaging répondent `429` avec reprise bornée.
- [ ] Connexions et événements Socket.IO abusifs sont limités avant SQL/room.
- [ ] La frappe normale et les reconnexions par lots restent transparentes.
- [ ] Aucun nouveau stockage ou log de secret/payload n'est introduit.
- [ ] Tests locaux, analyse Flutter et smoke/probes staging réussissent.

## Hors périmètre

- Suppression du faux `APP_SECRET` public : `TC-109`.
- TLS et exposition externe du staging : `TC-113`.
- Quotas distribués Redis et plusieurs réplicas : Phase 2/exploitation.
- WAF, CDN, anti-DDoS opérateur et règles du proxy de production.
