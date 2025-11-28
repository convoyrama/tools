import { io, Socket } from 'socket.io-client';

// Replace with your server's URL if not running locally
// Dynamically set the server URL based on the browser's hostname
// This works for both local development (localhost) and production (public IP/domain)
const URL = `http://${window.location.hostname}:3001`;

export const socket: Socket = io(URL, { autoConnect: false });

socket.onAny((event, ...args) => {
  console.log(event, args);
});
