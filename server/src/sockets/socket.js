const { Server } = require('socket.io');

let io = null;

function parseDropId(payload) {
  if (payload == null) {
    return null;
  }

  const raw = typeof payload === 'object' ? payload.dropId : payload;
  const dropId = Number(raw);

  if (!Number.isInteger(dropId) || dropId <= 0) {
    return null;
  }

  return dropId;
}

function roomName(dropId) {
  return `drop:${dropId}`;
}

function initSocket(httpServer) {
  const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

  io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
    },
  });

  io.on('connection', (socket) => {
    socket.on('join_drop', (payload) => {
      const dropId = parseDropId(payload);
      if (dropId == null) {
        return;
      }
      socket.join(roomName(dropId));
    });

    socket.on('leave_drop', (payload) => {
      const dropId = parseDropId(payload);
      if (dropId == null) {
        return;
      }
      socket.leave(roomName(dropId));
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  getIO,
};
