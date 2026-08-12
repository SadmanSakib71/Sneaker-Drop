const { Server } = require('socket.io');

let io = null;

/**
 * Parse and validate a dropId from socket event payloads.
 * Returns a positive integer, or null if invalid.
 */
function parseDropId(payload) {
  if (payload == null) {
    return null;
  }

  // Clients may send { dropId } or a bare number/string.
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

/**
 * Attach Socket.io to the existing HTTP server.
 * Call once at startup from server.js.
 */
function initSocket(httpServer) {
  const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

  io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

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

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
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
