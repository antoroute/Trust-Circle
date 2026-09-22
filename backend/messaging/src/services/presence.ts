// backend/messaging/src/services/presence.ts
// Suivi présence par userId/deviceId via Socket.IO – publication d'événements.

import { Server, Socket } from 'socket.io';

import { safeError, type RequestLogger } from '../observability.js';

type PresenceState = Map<string /*userId*/, Set<string /*socket.id*/>>;

export function initPresenceService(io: Server, app: any) {
  const state: PresenceState = new Map();
  
  function getUserSocketCount(userId: string): number {
    return state.get(userId)?.size || 0;
  }

  function broadcastPresenceToGroups(
    userId: string,
    online: boolean,
    count: number,
    logger: RequestLogger = app.log,
  ) {
    app.services.acl.listAccessibleGroupIds(userId)
      .then((groupIds: string[]) => {
        groupIds.forEach((groupId: string) => {
          io.to(`group:${groupId}`).emit('presence:update', { userId, online, count });
        });
      })
      .catch((err: any) => {
        logger.error({
          event: 'presence_groups_resolution_failed',
          outcome: 'failure',
          ...safeError(err),
        }, 'Unable to resolve presence groups');
      });
  }

  function broadcastPresenceToConversations(
    userId: string,
    online: boolean,
    count: number,
    logger: RequestLogger = app.log,
  ) {
    app.services.acl.listAllAccessibleConversationIds(userId)
      .then((conversationIds: string[]) => {
        conversationIds.forEach((conversationId: string) => {
          io.to(`conv:${conversationId}`).emit('presence:conversation', {
            userId, 
            online, 
            count,
            conversationId,
          });
        });
      })
      .catch((err: any) => {
        logger.error({
          event: 'presence_conversations_resolution_failed',
          outcome: 'failure',
          ...safeError(err),
        }, 'Unable to resolve presence conversations');
      });
  }

  function onConnect(socket: Socket, logger: RequestLogger = app.log) {
    const { userId } = (socket as any).auth;
    if (!state.has(userId)) state.set(userId, new Set());
    state.get(userId)!.add(socket.id);

    // CORRECTION: Émettre uniquement aux utilisateurs dans les mêmes groupes
    const count = state.get(userId)!.size;
    
    // Utiliser les fonctions helper pour broadcaster la présence
    broadcastPresenceToGroups(userId, true, count, logger);
    broadcastPresenceToConversations(userId, true, count, logger);
    
    // CORRECTION: Envoyer l'état de présence actuel uniquement aux groupes communs
    // Pour chaque utilisateur en ligne, vérifier s'il est dans les mêmes groupes que le nouvel utilisateur
    app.services.acl.listAccessibleGroupIds(userId)
      .then((userGroupIdsList: string[]) => {
        const userGroupIds = new Set(userGroupIdsList);
        
        // Pour chaque utilisateur en ligne, vérifier s'il est dans les mêmes groupes
        for (const [uid, socketSet] of state.entries()) {
          if (socketSet.size > 0 && uid !== userId) {
            // Vérifier si cet utilisateur est dans au moins un groupe commun
            app.services.acl.listAccessibleGroupIds(uid)
              .then((otherUserGroupIdsList: string[]) => {
                const otherUserGroupIds = new Set(otherUserGroupIdsList);
                const commonGroups = Array.from(userGroupIds).filter(gid => otherUserGroupIds.has(gid));
                
                // Émettre la présence uniquement dans les groupes communs
                commonGroups.forEach((groupId: string) => {
                  io.to(`group:${groupId}`).emit('presence:update', { 
                    userId: uid, 
                    online: true, 
                    count: socketSet.size 
                  });
                });
                
              })
              .catch((err: any) => {
                logger.error({
                  event: 'presence_common_groups_resolution_failed',
                  outcome: 'failure',
                  ...safeError(err),
                }, 'Unable to resolve common presence groups');
              });
          }
        }
      })
      .catch((err: any) => {
        logger.error({
          event: 'presence_state_broadcast_failed',
          outcome: 'failure',
          ...safeError(err),
        }, 'Unable to broadcast presence state');
      });
  }

  function onDisconnect(socket: Socket, logger: RequestLogger = app.log) {
    const { userId } = (socket as any).auth;
    const set = state.get(userId);
    if (!set) return;
    set.delete(socket.id);
    const online = set.size > 0;
    
    // CORRECTION: Émettre uniquement aux utilisateurs dans les mêmes groupes
    const count = set.size;
    
    // Utiliser les fonctions helper pour broadcaster la présence
    broadcastPresenceToGroups(userId, online, count, logger);
    broadcastPresenceToConversations(userId, online, count, logger);
  }

  function isOnline(userId: string) {
    return state.get(userId)?.size ? true : false;
  }

  function broadcastUserPresence(
    userId: string,
    online: boolean,
    count: number,
    logger: RequestLogger = app.log,
  ) {
    broadcastPresenceToGroups(userId, online, count, logger);
    broadcastPresenceToConversations(userId, online, count, logger);
  }

  return { onConnect, onDisconnect, isOnline, broadcastUserPresence, getUserSocketCount };
}
