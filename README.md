# project-app

> **Documentation historique.** Ce fichier décrit l'intention initiale et contient des choix désormais obsolètes (RSA, client admin React, secret partagé, Redis/CI supposés). Pour travailler sur l'état réel et la cible V1, commencer par [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md), puis [`docs/README.md`](docs/README.md) et [`AGENTS.md`](AGENTS.md).

# 📦 Contexte Technique — Application de Messagerie Sécurisée Multiplateforme

## 🎯 Objectif général

Construire une **application de messagerie sécurisée multiplateforme**, avec chiffrement de bout en bout (E2EE), auto-hébergée, conteneurisée et déployée localement.

Fonctionnalités principales :
- Application mobile Flutter (iOS & Android)
- Interface Web Admin React (gestion/modération)
- Backend REST + WebSocket pour les messages
- Authentification par e-mail + mot de passe uniquement (JWT)
- Chiffrement côté client (type Telegram)
- Déploiement local sur serveur via Docker & Portainer (gratuit)
- TLS et domaines gérés par un reverse proxy NGINX externe (`kavalek.fr`)

---

## 🧱 Architecture technique

### 🔹 Frontend

- **Flutter** : application mobile (auth, chat, chiffrement, WebSocket)
- **React** : interface admin (dashboard, stats, modération)

### 🔹 Backend

- **Auth Service** (Node.js ou FastAPI)
  - Enregistrement, connexion
  - Bcrypt pour hachage des mots de passe
  - JWT pour authentification
  - Pas d’authentification OAuth (pas de Google/Apple)

- **Messaging Service** (Node.js + Socket.IO ou Python)
  - API REST : messages, conversations
  - WebSocket : échange en temps réel sécurisé (JWT)
  - Redis pour Pub/Sub des sockets
  - PostgreSQL (ou MongoDB) pour le stockage

- **Redis**
  - Pub/Sub pour événements temps réel
  - Cache pour connexions actives

- **PostgreSQL (ou MongoDB)**
  - Stockage structuré des utilisateurs, messages (chiffrés), conversations

- **NGINX (externe)**
  - Reverse proxy indépendant
  - TLS via Let’s Encrypt
  - Routage vers `/auth`, `/api`, `/socket`
  - Domaine principal : `kavalek.fr` et sous-domaines

---

## 🔐 Sécurité & chiffrement

- **Chiffrement de bout en bout (E2EE)**
  - X25519 et HKDF-SHA256 pour envelopper les clés de message par appareil
  - AES-256-GCM pour le contenu et Ed25519 pour authentifier l'enveloppe
  - Chiffrement/déchiffrement exclusivement côté client (Flutter)
  - Serveur ne stocke que des messages chiffrés
- **JWT** : access Ed25519 et refresh HS256 strictement séparés
- **Appareils** : preuve Ed25519 liée à chaque access token et état de confiance serveur
- **Protection API** : ACL, validation stricte, CORS exact, quotas HTTP/Socket.IO
- Aucun secret partagé n'est embarqué pour prétendre reconnaître l'application officielle

Le protocole actuel et ses limites sont documentés dans
[`docs/security/CRYPTOGRAPHY_V2.md`](docs/security/CRYPTOGRAPHY_V2.md).

---

## 🐳 Déploiement & infrastructure

- Tous les composants tournent dans des **conteneurs Docker**
- Déploiement local sur **un serveur personnel** géré via **Portainer (gratuit)**
- Aucun usage de Kubernetes (non prévu)
- Le reverse proxy NGINX externe gère TLS + routage domaine
- CI/CD prévu avec **GitHub Actions** :
  - Lint, test, build des images
  - Push vers Docker Hub ou GHCR
  - Déploiement automatique (Portainer webhook ou Watchtower)

---

## 📁 Arborescence projet

```plaintext
project-app/
├── backend/
│   ├── auth/
│   │   ├── Dockerfile
│   │   ├── index.js
│   │   ├── .env
│   │   └── README.md
│   └── messaging/
│       ├── Dockerfile
│       ├── index.js
│       ├── .env
│       └── README.md
├── frontend-admin/     # à remplir plus tard
├── frontend-mobile/    # à remplir plus tard
├── infrastructure/
│   ├── docker-compose-infra.yml
│   ├── Makefile
│   ├── postgres/
│   │   └── init.sql
│   └── redis/
│       └── redis.conf
├── app/
│   ├── docker-compose-app.yml
│   ├── Makefile
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── site.conf
│   └── certbot/
│       └── README.md
├── scripts/
│   ├── deploy_infra.sh
│   ├── deploy_app.sh
│   └── teardown.sh
└── README.md
```
