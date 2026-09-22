// backend/messaging/src/index.ts
// Point d'entrée Fastify + Socket.IO pour le service Messaging (v2).
// – JWT obligatoire (même secret que ton service Auth)
// – CORS/Helmet/Rate Limit conseillés (ajoute selon ton projet)
// – Enregistre les routes et services (presence, ACL, messages v2, groups, conversations)

import Fastify, { type FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Server as IOServer } from 'socket.io';

import { loadConfig } from './config.js';
import { corsOptions } from './httpSecurity.js';
import { assertAccessClaims, registerAccessJwt } from './security/jwt.js';
import dbPlugin from './plugins/db.js';
import enforceVersion from './middlewares/enforceVersion.js';
import socketAuth from './middlewares/socketAuth.js';
import { registerDeviceAuth } from './middlewares/deviceAuth.js';
import type { AppDatabase } from './plugins/db.js';
import {
  MESSAGING_BODY_LIMIT_BYTES,
  SOCKET_PAYLOAD_LIMIT_BYTES,
  parseStrictConversationBatch,
  parseStrictConversationEvent,
} from './schemas/input.schema.js';
import {
  createObservabilityOptions,
  observeSocketTask,
  registerObservability,
  safeError,
  safeStartupFailure,
  socketLogger,
} from './observability.js';

// Routes 
import keysDevicesRoutes from './routes/keys.devices.js';
import accountDeviceRoutes from './routes/account.devices.js';
import accountDeviceApprovalRoutes from './routes/account.deviceApprovals.js';
import messagesV2Routes from './routes/messages.v2.js';
import conversationsRoutes from './routes/conversations.js';
import groupsRoutes from './routes/groups.js';

// Services 
import { initPresenceService } from './services/presence.js';
import { initAclService } from './services/acl.js';
import {
  MAX_CONVERSATION_ROOMS_PER_SOCKET,
  SocketConnectionLimiter,
  SocketEventQuotas,
  socketAllowRequest,
  createAckResponder,
} from './security/socketSecurity.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    io: IOServer;
    services: {
      presence: ReturnType<typeof initPresenceService>;
      acl: ReturnType<typeof initAclService>;
    };
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

async function build() {
  const config = loadConfig();
  const app = Fastify({
    ...createObservabilityOptions(config.nodeEnv, config.logLevel),
    bodyLimit: MESSAGING_BODY_LIMIT_BYTES,
    ajv: { customOptions: { removeAdditional: false } },
    trustProxy: [...config.trustedProxyCidrs],
  });
  registerObservability(app);

  // Pré-déclarer les décorateurs AVANT démarrage
  app.decorate('io', undefined as unknown as IOServer);
  app.decorate('services', {} as any);

  // Plugins Fastify
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCors, corsOptions(config.corsAllowedOrigins));
  const rateLimitPlugin = rateLimit as unknown as FastifyPluginAsync<{
    max: number;
    timeWindow: string;
    enableDraftSpec: boolean;
  }>;
  await app.register(rateLimitPlugin, {
    max: 600,
    timeWindow: '1 minute',
    enableDraftSpec: true,
  });
  await registerAccessJwt(app, config.jwtAccessPublicKey);

  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      const payload = await req.jwtVerify();
      req.user = assertAccessClaims(payload);
    } catch {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  // DB + health
  await app.register(dbPlugin, { connectionString: config.databaseUrl });
  registerDeviceAuth(app);

  // Health AVANT enforceVersion (et whiteliste dans le middleware)
  app.get('/health', async () => ({ ok: true }));

  await app.register(enforceVersion);

  // Routes REST
  await app.register(keysDevicesRoutes);
  await app.register(accountDeviceRoutes);
  await app.register(accountDeviceApprovalRoutes);
  await app.register(messagesV2Routes);
  await app.register(conversationsRoutes);
  await app.register(groupsRoutes);

  // S’assurer que tous les plugins/routes sont prêts
  await app.ready();

  // Attacher Socket.IO au serveur natif Fastify
  const io = new IOServer(app.server, {
    path: '/socket',
    cors: { origin: [...config.corsAllowedOrigins], credentials: false },
    allowRequest: socketAllowRequest(config.corsAllowedOrigins),
    maxHttpBufferSize: SOCKET_PAYLOAD_LIMIT_BYTES,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // NE PAS re-déclarer ici : on assigne sur les décorateurs déjà posés
  (app as any).io = io;

  // Services (présence, ACL)
  (app as any).services = {
    presence: initPresenceService(io, app),
    acl: initAclService(app),
  };

  // Auth WS + rooms
  const socketConnectionLimiter = new SocketConnectionLimiter();
  io.use(socketAuth(app));
  io.use((socket, next) => {
    const { userId, deviceId } = (socket as any).auth ?? {};
    if (!userId || !deviceId || !socketConnectionLimiter.reserve(io, userId, deviceId)) {
      return next(new Error('socket connection limit reached'));
    }
    next();
  });
  io.on('connection', (socket) => {
    const { userId, deviceId } = (socket as any).auth;
    const { log: connectionLog } = socketLogger(app.log, socket.request);
    socketConnectionLimiter.release(userId, deviceId);
    socket.join(`user:${userId}`);
    const quotas = new SocketEventQuotas();
    
    // Métriques de connexion
    connectionLog.info({
      event: 'socket_connected',
      outcome: 'success',
    }, 'WebSocket connected');
    
    // CORRECTION: Rejoindre automatiquement les rooms de groupes de l'utilisateur
    app.services.acl.listAccessibleGroupIds(userId)
      .then((groupIds: string[]) => {
        groupIds.forEach((groupId: string) => {
          socket.join(`group:${groupId}`);
        });
      })
      .catch((err: any) => {
        connectionLog.error({
          event: 'group_room_join_failed',
          outcome: 'failure',
          ...safeError(err),
        }, 'Failed to auto-join group rooms');
      });
    
    // ✅ OPTIMISATION: Fonction helper pour émettre les événements de présence de manière optimisée
    async function emitBatchPresenceEvents(
      socket: any, 
      convIds: string[], 
      userId: string, 
      app: any
    ) {
      // Pour chaque conversation, envoyer un seul événement avec toutes les présences
      for (const convId of convIds) {
        const conversationRoom = `conv:${convId}`;
        const socketsInConversation = app.io.sockets.adapter.rooms.get(conversationRoom);
        
        if (!socketsInConversation) continue;
        
        // Compter les sockets par utilisateur
        const presenceMap = new Map<string, number>();
        const otherUsersPresence: Array<{userId: string, online: boolean, count: number}> = [];
        
        for (const socketId of socketsInConversation) {
          const otherSocket = app.io.sockets.sockets.get(socketId);
          if (otherSocket && otherSocket.id !== socket.id) {
            const otherUserId = (otherSocket as any).auth?.userId;
            if (otherUserId) {
              presenceMap.set(otherUserId, (presenceMap.get(otherUserId) || 0) + 1);
            }
          }
        }
        
        // ✅ OPTIMISÉ: Envoyer un seul événement avec toutes les présences
        if (presenceMap.size > 0) {
          for (const [otherUserId, socketCount] of presenceMap.entries()) {
            otherUsersPresence.push({
              userId: otherUserId,
              online: true,
              count: socketCount
            });
          }
          
          // Envoyer toutes les présences en un seul événement
          socket.emit('presence:conversation:batch', {
            conversationId: convId,
            presences: otherUsersPresence
          });
          
        }
        
        // Notifier les autres utilisateurs de la présence du nouvel arrivant
        const userSocketsInConversation = Array.from(socketsInConversation || []).filter(socketId => {
          const s = app.io.sockets.sockets.get(socketId);
          return s && (s as any).auth?.userId === userId;
        });
        
        socket.to(conversationRoom).emit('presence:conversation', {
          userId,
          online: true,
          count: userSocketsInConversation.length,
          conversationId: convId
        });
      }
    }

    // Gestion des abonnements aux conversations
    socket.on('conv:subscribe', (data: unknown, ack?: (response: Record<string, unknown>) => void) => {
      const respond = createAckResponder(socket, 'conv:subscribe', ack);
      void observeSocketTask(connectionLog, 'conv:subscribe', async () => {
        if (!quotas.allowSubscription()) {
          respond({ success: false, error: 'rate_limited' });
          return;
        }
        const convId = parseStrictConversationEvent(data);
        if (!convId) {
          respond({ success: false, error: 'invalid_payload' });
          return;
        }
        const roomName = `conv:${convId}`;

        const hasAccess = await app.services.acl.hasConversationPermission(
          userId,
          convId,
          'socket:subscribe',
        );
        if (!hasAccess) {
          respond({ success: false, error: 'forbidden' });
          connectionLog.warn({
            event: 'conversation_subscription_refused',
            outcome: 'failure',
            socketEvent: 'conv:subscribe',
          }, 'Unauthorized conversation subscription attempt');
          return;
        }

        // L'accès est revérifié même si le socket se trouve déjà dans la room.
        const room = app.io.sockets.adapter.rooms.get(roomName);
        if (room && room.has(socket.id)) {
          respond({ success: true, convId, alreadySubscribed: true });
          return;
        }

        const currentConversationRooms = [...socket.rooms].filter((room) => room.startsWith('conv:')).length;
        if (currentConversationRooms >= MAX_CONVERSATION_ROOMS_PER_SOCKET) {
          respond({ success: false, error: 'conversation_room_limit' });
          return;
        }

        socket.join(roomName);
        respond({ success: true, convId });

        // ✅ OPTIMISÉ: Utiliser la fonction helper pour les événements de présence
        await emitBatchPresenceEvents(socket, [convId], userId, app);
      }, () => respond({ success: false, error: 'internal_error' }));
    });
    
    // ✅ NOUVEAU: Endpoint batch pour abonner plusieurs conversations en une requête
    socket.on('conv:subscribe:batch', (data: unknown, ack?: (response: Record<string, unknown>) => void) => {
      const respond = createAckResponder(socket, 'conv:subscribe:batch', ack);
      void observeSocketTask(connectionLog, 'conv:subscribe:batch', async () => {
        const convIds = parseStrictConversationBatch(data);
        if (!convIds) {
          respond({ success: false, error: 'invalid_payload' });
          return;
        }
        if (!quotas.allowSubscription(convIds.length)) {
          respond({ success: false, error: 'rate_limited' });
          return;
        }

        const authorizedConvIds =
          await app.services.acl.listAccessibleConversationIds(userId, convIds);
        const unauthorizedCount = convIds.length - authorizedConvIds.length;

        const currentConversationRooms = [...socket.rooms].filter((room) => room.startsWith('conv:')).length;
        const newConversationRooms = authorizedConvIds.filter(
          (convId) => !socket.rooms.has(`conv:${convId}`),
        ).length;
        if (currentConversationRooms + newConversationRooms > MAX_CONVERSATION_ROOMS_PER_SOCKET) {
          respond({ success: false, error: 'conversation_room_limit' });
          return;
        }

        const subscribed: string[] = [];
        const alreadySubscribed: string[] = [];
        for (const convId of authorizedConvIds) {
          const roomName = `conv:${convId}`;
          const room = app.io.sockets.adapter.rooms.get(roomName);
          if (room && room.has(socket.id)) alreadySubscribed.push(convId);
          else {
            socket.join(roomName);
            subscribed.push(convId);
          }
        }

        if (subscribed.length > 0) {
          await emitBatchPresenceEvents(socket, subscribed, userId, app);
        }

        respond({
          success: true,
          subscribed: subscribed.length,
          alreadySubscribed: alreadySubscribed.length,
          unauthorized: unauthorizedCount,
          convIds: subscribed,
        });

      }, () => respond({ success: false, error: 'internal_error' }));
    });
    
    socket.on('conv:unsubscribe', (data: unknown, ack?: (response: Record<string, unknown>) => void) => {
      const respond = createAckResponder(socket, 'conv:unsubscribe', ack);
      void observeSocketTask(connectionLog, 'conv:unsubscribe', async () => {
        if (!quotas.allowSubscription()) {
          respond({ success: false, error: 'rate_limited' });
          return;
        }
        const convId = parseStrictConversationEvent(data);
        if (!convId) {
          respond({ success: false, error: 'invalid_payload' });
          return;
        }
        const conversationRoom = `conv:${convId}`;
        socket.leave(conversationRoom);

        if (!(await app.services.acl.hasConversationPermission(
          userId,
          convId,
          'socket:subscribe',
        ))) {
          connectionLog.warn({
            event: 'conversation_unsubscription_refused',
            outcome: 'failure',
            socketEvent: 'conv:unsubscribe',
          }, 'Conversation room left without presence emission after ACL refusal');
          respond({ success: false, error: 'forbidden' });
          return;
        }

        const socketsInConversation = app.io.sockets.adapter.rooms.get(conversationRoom);
        const userSocketsInConversation = Array.from(socketsInConversation || []).filter(socketId => {
          const candidate = app.io.sockets.sockets.get(socketId);
          return candidate && (candidate as any).auth?.userId === userId;
        });

        const isOnlineInConversation = userSocketsInConversation.length > 0;
        socket.to(`conv:${convId}`).emit('presence:conversation', {
          userId,
          online: isOnlineInConversation,
          count: userSocketsInConversation.length,
          conversationId: convId,
        });
        respond({ success: true, convId });
      }, () => respond({ success: false, error: 'internal_error' }));
    });
    
    // Gestion des indicateurs de frappe avec vérification de sécurité
    socket.on('typing:start', (data: unknown) => {
      void observeSocketTask(connectionLog, 'typing:start', async () => {
        if (!quotas.allowTyping()) {
          socket.emit('typing:error', { error: 'rate_limited' });
          return;
        }
        const convId = parseStrictConversationEvent(data);
        if (!convId) {
          socket.emit('typing:error', { error: 'invalid_payload' });
          return;
        }
        const isInConversation = await app.services.acl.hasConversationPermission(
          userId,
          convId,
          'typing:emit',
        );
        if (isInConversation) {
          socket.to(`conv:${convId}`).emit('typing:start', { convId, userId });
        } else {
          connectionLog.warn({
            event: 'typing_event_refused',
            outcome: 'failure',
            socketEvent: 'typing:start',
          }, 'Unauthorized typing event');
        }
      }, () => socket.emit('typing:error', { error: 'internal_error' }));
    });
    
    socket.on('typing:stop', (data: unknown) => {
      void observeSocketTask(connectionLog, 'typing:stop', async () => {
        if (!quotas.allowTyping()) {
          socket.emit('typing:error', { error: 'rate_limited' });
          return;
        }
        const convId = parseStrictConversationEvent(data);
        if (!convId) {
          socket.emit('typing:error', { error: 'invalid_payload' });
          return;
        }
        const isInConversation = await app.services.acl.hasConversationPermission(
          userId,
          convId,
          'typing:emit',
        );
        if (isInConversation) {
          socket.to(`conv:${convId}`).emit('typing:stop', { convId, userId });
        } else {
          connectionLog.warn({
            event: 'typing_event_refused',
            outcome: 'failure',
            socketEvent: 'typing:stop',
          }, 'Unauthorized typing event');
        }
      }, () => socket.emit('typing:error', { error: 'internal_error' }));
    });

    app.services.presence.onConnect(socket, connectionLog);
    
    // Métriques de déconnexion
    socket.on('disconnect', () => {
      connectionLog.info({
        event: 'socket_disconnected',
        outcome: 'success',
      }, 'WebSocket disconnected');
      
      app.services.presence.onDisconnect(socket, connectionLog);
    });
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({
    event: 'service_started',
    outcome: 'success',
  }, 'Messaging service listening');
}

build().catch((e) => {
  process.stderr.write(`${safeStartupFailure(process.env.NODE_ENV, e)}\n`);
  process.exit(1);
});
