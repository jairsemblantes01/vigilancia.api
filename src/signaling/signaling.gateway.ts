import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * Estructura de una "sala" de vigilancia:
 * - guardId: socket ID del dispositivo vigilante (el que tiene la cámara)
 * - viewers: Map<socketId, viewerName> de los visores conectados
 */
interface Room {
  guardId: string;
  guardName: string;
  viewers: Map<string, string>;
  createdAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('SignalingGateway');
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.guardId === client.id) {
      // Se desconectó el vigilante: cerrar sala
      this.logger.log(`Vigilante salió, cerrando sala ${roomId}`);
      this.server.to(roomId).emit('guard-disconnected');
      room.viewers.forEach((_, viewerId) => {
        this.socketToRoom.delete(viewerId);
      });
      this.rooms.delete(roomId);
    } else if (room.viewers.has(client.id)) {
      // Se desconectó un visor
      const viewerName = room.viewers.get(client.id);
      room.viewers.delete(client.id);
      this.logger.log(`Visor ${viewerName} salió de sala ${roomId}`);
      // Avisar al vigilante para que cierre el peer connection
      this.server.to(room.guardId).emit('viewer-left', { viewerId: client.id });
      this.broadcastViewerCount(roomId);
    }

    this.socketToRoom.delete(client.id);
  }

  // ============== EL VIGILANTE CREA UNA SALA ==============
  @SubscribeMessage('create-room')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; guardName: string },
  ) {
    const { roomId, guardName } = data;

    if (this.rooms.has(roomId)) {
      // Si la sala ya existe, hay que ver si está "huérfana"
      const existingRoom = this.rooms.get(roomId);
      // Si el vigilante anterior ya no está conectado, sustituir
      if (!this.server.sockets.sockets.has(existingRoom.guardId)) {
        this.rooms.delete(roomId);
      } else {
        client.emit('room-error', { message: 'La sala ya existe y está activa' });
        return;
      }
    }

    const room: Room = {
      guardId: client.id,
      guardName: guardName || 'Vigilante',
      viewers: new Map(),
      createdAt: new Date(),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(client.id, roomId);
    client.join(roomId);

    this.logger.log(`Sala creada: ${roomId} por ${guardName}`);
    client.emit('room-created', { roomId, guardName });
  }

  // ============== UN VISOR SE UNE A LA SALA ==============
  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; viewerName: string },
  ) {
    const { roomId, viewerName } = data;
    const room = this.rooms.get(roomId);

    if (!room) {
      client.emit('room-error', {
        message: 'Sala no encontrada. Verifica el código o que el vigilante esté activo.',
      });
      return;
    }

    room.viewers.set(client.id, viewerName || 'Visor');
    this.socketToRoom.set(client.id, roomId);
    client.join(roomId);

    this.logger.log(`Visor ${viewerName} se unió a sala ${roomId}`);

    // Avisar al visor que se conectó OK
    client.emit('joined-room', { roomId, guardName: room.guardName });

    // Avisar al vigilante que tiene un nuevo visor → debe iniciar el peer connection
    this.server.to(room.guardId).emit('viewer-joined', {
      viewerId: client.id,
      viewerName,
    });

    this.broadcastViewerCount(roomId);
  }

  private broadcastViewerCount(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.server.to(roomId).emit('viewer-count', { count: room.viewers.size });
  }

  // ============== INTERCAMBIO WebRTC ==============
  // El vigilante envía su offer SDP a un visor específico
  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string; offer: any },
  ) {
    this.server.to(data.targetId).emit('offer', {
      fromId: client.id,
      offer: data.offer,
    });
  }

  // El visor responde con answer SDP al vigilante
  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string; answer: any },
  ) {
    this.server.to(data.targetId).emit('answer', {
      fromId: client.id,
      answer: data.answer,
    });
  }

  // ICE candidates fluyen en ambas direcciones
  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string; candidate: any },
  ) {
    this.server.to(data.targetId).emit('ice-candidate', {
      fromId: client.id,
      candidate: data.candidate,
    });
  }

  // ============== EVENTOS DE ALERTA ==============
  // El vigilante emite alertas para que los visores las vean también
  @SubscribeMessage('alert')
  handleAlert(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { personCount: number; timestamp: string },
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.guardId !== client.id) return;
    // Emitir a todos los visores de la sala
    client.to(roomId).emit('alert', data);
  }

  // El vigilante envía estadísticas (FPS, personas detectadas, etc.)
  @SubscribeMessage('stats')
  handleStats(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { fps: number; personsDetected: number; status: string },
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.guardId !== client.id) return;
    client.to(roomId).emit('stats', data);
  }
}
