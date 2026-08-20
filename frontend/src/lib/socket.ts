import { io, type Socket } from "socket.io-client";
import { getToken } from "@/lib/api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = getToken();
  if (!socket) {
    socket = io({ auth: { token }, transports: ["websocket"] });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}