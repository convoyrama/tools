import { io, Socket } from 'socket.io-client';

// Replace with your server's URL if not running locally
const URL = 'http://localhost:3000';

export const socket: Socket = io(URL, { autoConnect: false });

socket.onAny((event, ...args) => {
  console.log(event, args);
});
