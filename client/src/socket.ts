import { io } from 'socket.io-client';

const URL = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.host}`;

export const socket = io(URL, {
  autoConnect: false
});
