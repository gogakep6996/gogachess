'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SocketEvents, type ClassStatePayload } from '@/lib/socket-events';

interface Result {
  connected: boolean;
  state: ClassStatePayload | null;
  startLesson: () => void;
  stopLesson: () => void;
  distribute: (taskId: string) => void;
  /** «Транслировать ученикам мою доску» — открыть демо и сразу включить трансляцию. */
  startDemo: (fen?: string) => void;
  /** «Прекратить трансляцию» (фактически закрывает демо-комнату полностью). */
  stopDemo: () => void;
  /** «Моя доска» — открыть личную доску учителя без трансляции ученикам. */
  openMyBoard: (fen?: string) => void;
  /** Включить/выключить трансляцию для уже открытой «Моей доски». */
  toggleBroadcast: (on?: boolean) => void;
  /** Запереть/отпереть вход на урок для учеников, которых ещё нет в классе. */
  toggleDoor: (closed: boolean) => void;
}

/** Подключение к серверу для подписки на ClassState (учитель и ученик). */
export function useClassSocket(slug: string | null): Result {
  const [state, setState] = useState<ClassStatePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!slug) return;
    const socket = io({ path: '/socket.io', withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(SocketEvents.ClassSubscribe, slug);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(SocketEvents.ClassState, (payload: ClassStatePayload) => {
      setState(payload);
    });

    return () => {
      socket.emit(SocketEvents.ClassUnsubscribe, slug);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [slug]);

  const startLesson = useCallback(() => {
    socketRef.current?.emit(SocketEvents.ClassLessonStart);
  }, []);
  const stopLesson = useCallback(() => {
    socketRef.current?.emit(SocketEvents.ClassLessonStop);
  }, []);
  const distribute = useCallback((taskId: string) => {
    socketRef.current?.emit(SocketEvents.ClassDistribute, { taskId });
  }, []);
  const startDemo = useCallback((fen?: string) => {
    socketRef.current?.emit(SocketEvents.ClassDemoStart, { fen });
  }, []);
  const stopDemo = useCallback(() => {
    socketRef.current?.emit(SocketEvents.ClassDemoStop);
  }, []);
  const openMyBoard = useCallback((fen?: string) => {
    socketRef.current?.emit(SocketEvents.ClassMyBoardOpen, { fen });
  }, []);
  const toggleBroadcast = useCallback((on?: boolean) => {
    socketRef.current?.emit(SocketEvents.ClassBroadcastToggle, { on });
  }, []);
  const toggleDoor = useCallback((closed: boolean) => {
    socketRef.current?.emit(SocketEvents.ClassDoorToggle, { closed });
  }, []);

  return {
    connected,
    state,
    startLesson,
    stopLesson,
    distribute,
    startDemo,
    stopDemo,
    openMyBoard,
    toggleBroadcast,
    toggleDoor,
  };
}
