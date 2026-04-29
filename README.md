# Vigilancia Backend (NestJS)

Servidor de señalización WebRTC para el sistema de videovigilancia.

## ¿Qué hace?

Este backend NO procesa video. Solo coordina la conexión inicial entre el dispositivo vigilante y los visores para que puedan establecer una conexión WebRTC peer-to-peer. Una vez conectados, el video viaja **directo** entre los dispositivos sin pasar por aquí.

## Instalación

```bash
npm install
```

## Desarrollo local

```bash
npm run start:dev
```

El servidor escucha en `http://localhost:3000`. Visita esa URL en el navegador para ver el health check.

## Producción

```bash
npm run build
npm run start:prod
```

## Despliegue (gratis)

### Render.com (recomendado)

1. Crea cuenta en render.com
2. New → Web Service → conecta tu repo de GitHub
3. Build Command: `npm install && npm run build`
4. Start Command: `npm run start:prod`
5. Plan gratuito (free tier)

### Railway.app

1. Crea cuenta en railway.app
2. New Project → Deploy from GitHub repo
3. Selecciona la carpeta `backend`
4. Railway detecta NestJS automáticamente

### Fly.io

```bash
fly launch
fly deploy
```

## Variables de entorno

- `PORT`: puerto donde escucha (default 3000, los hosts gratuitos suelen asignar uno)

## Eventos WebSocket

### Vigilante → Servidor
- `create-room` - crear sala con un código
- `offer` - enviar offer SDP a un visor
- `ice-candidate` - enviar ICE candidate
- `alert` - notificar alerta a los visores
- `stats` - enviar estadísticas (FPS, personas detectadas)

### Visor → Servidor
- `join-room` - unirse a una sala existente
- `answer` - responder al offer
- `ice-candidate` - enviar ICE candidate

### Servidor → Cliente
- `room-created` / `joined-room` - confirmaciones
- `viewer-joined` / `viewer-left` - cambios de visores
- `viewer-count` - número actual de visores
- `offer` / `answer` / `ice-candidate` - mensajes WebRTC reenviados
- `guard-disconnected` - el vigilante se fue
- `alert` / `stats` - retransmitidos a visores
- `room-error` - error
