'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  type RoomStatePayload,
  type ChatMessageDto,
  type Participant,
} from '@/lib/socket-events';

interface UseRoomSocketResult {
  socket: Socket | null;
  state: RoomStatePayload | null;
  participants: Participant[];
  messages: ChatMessageDto[];
  connected: boolean;
  error: string | null;

  sendMove: (m: { from: string; to: string; promotion?: string }) => void;
  startEdit: () => void;
  updateEdit: (fen: string) => void;
  endEdit: (fen: string) => void;
  resetPosition: () => void;
  sendChat: (text: string) => void;
}

export function useRoomSocket(roomCode: string): UseRoomSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<RoomStatePayload | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(SocketEvents.RoomJoin, roomCode);
    });
    socket.on('connect_error', (e) => {
      setError(`Подключение: ${e.message}`);
      setConnected(false);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on(SocketEvents.RoomState, (s: RoomStatePayload) => {
      setState(s);
      setParticipants(s.participants);
    });
    socket.on(SocketEvents.ParticipantsUpdate, (ps: Participant[]) => setParticipants(ps));
    socket.on(SocketEvents.RoomError, (msg: string) => setError(msg));

    socket.on(SocketEvents.ChatHistory, (h: ChatMessageDto[]) => setMessages(h));
    socket.on(SocketEvents.ChatNew, (m: ChatMessageDto) => setMessages((prev) => [...prev, m]));

    socket.on(SocketEvents.EditUpdate, (fen: string) => {
      setState((prev) => (prev ? { ...prev, fen } : prev));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]);

  const sendMove = useCallback((m: { from: string; to: string; promotion?: string }) => {
    socketRef.current?.emit(SocketEvents.MoveMake, m);
  }, []);
  const startEdit = useCallback(() => socketRef.current?.emit(SocketEvents.EditStart), []);
  const updateEdit = useCallback((fen: string) => {
    setState((prev) => (prev ? { ...prev, fen } : prev));
    socketRef.current?.emit(SocketEvents.EditUpdate, fen);
  }, []);
  const endEdit = useCallback((fen: string) => socketRef.current?.emit(SocketEvents.EditEnd, fen), []);
  const resetPosition = useCallback(() => socketRef.current?.emit(SocketEvents.PositionReset), []);
  const sendChat = useCallback((text: string) => socketRef.current?.emit(SocketEvents.ChatSend, text), []);

  // Очищаем ошибку через 4 сек
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return {
    socket: socketRef.current,
    state,
    participants,
    messages,
    connected,
    error,
    sendMove,
    startEdit,
    updateEdit,
    endEdit,
    resetPosition,
    sendChat,
  };
}
