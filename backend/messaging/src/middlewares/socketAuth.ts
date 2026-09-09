import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';

import { verifyAccessToken } from '../security/jwt.js';
import { authenticateDeviceAccess } from './deviceAuth.js';

export default function socketAuth(app: FastifyInstance) {
  return async (socket: Socket, next: (err?: any) => void) => {
    try {
      const header = socket.handshake.headers?.authorization as string | undefined;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      const token = (socket.handshake.auth?.token as string) || bearer;
      if (!token) return next(new Error('no token'));

      const payload = verifyAccessToken(app, token);
      const device = await authenticateDeviceAccess(app.db, payload, {
        deviceId: socket.handshake.auth?.deviceId,
        identityKeyVersion: String(
          socket.handshake.auth?.deviceKeyVersion ?? '',
        ),
        proof: socket.handshake.auth?.deviceProof,
      });
      if (!device || device.status !== 'active') {
        return next(new Error('device authorization required'));
      }
      (socket as any).auth = {
        userId: payload.sub,
        deviceId: device.deviceId,
        identityKeyVersion: device.identityKeyVersion,
      };
      next();
    } catch {
      next(new Error('invalid token'));
    }
  };
}
