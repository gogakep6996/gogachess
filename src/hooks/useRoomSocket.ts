'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SocketEvents,
  type RoomStatePayload,
  type ChatMessageDto,
  type Participant,
  type RoomMode,
  type BoardAnnotations,
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
  /** Возврат к началу текущего сегмента (позиция из редактора). */
  resetToInitial: () => void;
  sendChat: (text: string) => void;
  setMode: (partial: Partial<RoomMode>) => void;
  setAnnotations: (next: BoardAnnotations) => void;
  undoMove: () => void;
  /** Учитель сообщает серверу, какую позицию он сейчас смотрит — сервер броадкастит
   *  ученикам, чтобы у них показывался тот же ход. null = «следить за текущей». */
  setHistoryView: (idx: number | null) => void;
  /** Учитель переключает движок-соперник на доске ученика (только для student-board).
   *  Если next не передан — сервер инвертирует текущее значение. */
  toggleEngine: (next?: boolean) => void;
  /** Учитель запрещает/разрешает ученикам делать ходы на этой доске. */
  setMovesLock: (locked: boolean) => void;
  /** Учитель разрешает ходить только одному ученику (по userId) или никому (null). */
  setMoveAllow: (userId: string | null) => void;
  /** Учитель очищает чат комнаты. */
  clearChat: () => void;
  /** Сдаться в турнирной / казуальной партии. */
  resign: () => void;
  /** Предложить ничью. */
  offerDraw: () => void;
  /** Принять активное предложение ничьей. */
  acceptDraw: () => void;
  /** Отклонить активное предложение ничьей. */
  declineDraw: () => void;
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

    socket.on(SocketEvents.ArrowsUpdate, (payload: BoardAnnotations) => {
      setState((prev) => (prev ? { ...prev, arrows: payload.arrows, marks: payload.marks } : prev));
    });

    // Учитель перемотал историю — у учеников должен обновиться индекс просмотра.
    // Отдельным событием, чтобы не дёргать пересчёт всего RoomState на каждый клик.
    socket.on(SocketEvents.HistoryView, (idx: number | null) => {
      setState((prev) => (prev ? { ...prev, historyViewIdx: idx } : prev));
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
  const resetToInitial = useCallback(
    () => socketRef.current?.emit(SocketEvents.PositionResetToInitial),
    [],
  );
  const sendChat = useCallback((text: string) => socketRef.current?.emit(SocketEvents.ChatSend, text), []);
  const setMode = useCallback(
    (partial: Partial<RoomMode>) => socketRef.current?.emit(SocketEvents.ModeSet, partial),
    [],
  );
  const setAnnotations = useCallback(
    (next: BoardAnnotations) => socketRef.current?.emit(SocketEvents.ArrowsUpdate, next),
    [],
  );
  const undoMove = useCallback(() => {
    socketRef.current?.emit(SocketEvents.MoveUndo);
  }, []);
  const setHistoryView = useCallback((idx: number | null) => {
    socketRef.current?.emit(SocketEvents.HistoryView, idx);
  }, []);
  const toggleEngine = useCallback((next?: boolean) => {
    socketRef.current?.emit(SocketEvents.EngineToggle, next);
  }, []);
  const setMovesLock = useCallback((locked: boolean) => {
    socketRef.current?.emit(SocketEvents.MovesLock, { locked });
  }, []);
  const setMoveAllow = useCallback((userId: string | null) => {
    socketRef.current?.emit(SocketEvents.MoveAllow, { userId });
  }, []);
  const clearChat = useCallback(() => {
    socketRef.current?.emit(SocketEvents.ChatClear);
  }, []);
  const resign = useCallback(() => socketRef.current?.emit(SocketEvents.Resign), []);
  const offerDraw = useCallback(() => socketRef.current?.emit(SocketEvents.DrawOffer), []);
  const acceptDraw = useCallback(() => socketRef.current?.emit(SocketEvents.DrawAccept), []);
  const declineDraw = useCallback(() => socketRef.current?.emit(SocketEvents.DrawDecline), []);

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
    resetToInitial,
    sendChat,
    setMode,
    setAnnotations,
    undoMove,
    setHistoryView,
    toggleEngine,
    setMovesLock,
    setMoveAllow,
    clearChat,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
  };
}
