import { useState } from 'react';
import { io } from 'socket.io-client';
import { getApiUrl } from '../api/drops';

/**
 * One shared Socket.io connection for the whole app.
 * Do not create a new socket on every render.
 */
let sharedSocket = null;

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(getApiUrl(), {
      autoConnect: true,
    });
  }
  return sharedSocket;
}

export function useSocket() {
  const [socket] = useState(() => getSharedSocket());
  return socket;
}
