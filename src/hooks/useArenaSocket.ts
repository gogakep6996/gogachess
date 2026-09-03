'use client';

// Связь с ареной. Живёт в отдельном пространстве имён '/arena': туда пускают
// и незалогиненных, поэтому трансляцию можно смотреть без входа на сайт.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import {
  SocketEvents,
  type ArenaGamePayload,
  type ArenaStatePayload,
  type ChatMessageDto,
  type GameResultState,
} from '@/lib/socket-events';

export interface ArenaGameOverPayload {
  gameId: string;
  outcome: 'white' | 'black' | 'draw' | 'cancelled';
  reason: GameResultState['reason'];
}

interface Result {
  connected: boolean;
  state: ArenaStatePayload | null;
  /** Моя партия. Остаётся на экране и после окончания, пока не начнётся новая. */
  myGame: ArenaGamePayload | null;
  /** Партия, которую я смотрю со стороны. */
  watchedGame: ArenaGamePayload | null;
  chat: ChatMessageDto[];
  /** Текст последней ошибки для показа человеку. */
  error: string | null;
  dismissError: () => void;
  /** Итог только что закончившейся моей партии. */
  lastResult: ArenaGameOverPayload | null;
  dismissResult: () => void;
  join: (accessCode?: string) => void;
  pause: () => void;
  watch: (gameId: string) => void;
  move: (m: { from: string; to: string; promotion?: string }) => void;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  sendChat: (text: string) => void;
}

export function useArenaSocket(arenaId: string, meId: string | null): Result {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ArenaStatePayload | null>(null);
  const [games, setGames] = useState<Record<string, ArenaGamePayload>>({});
  const [myGameId, setMyGameId] = useState<string | null>(null);
  const [watchedId, setWatchedId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessageDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ArenaGameOverPayload | null>(null);

  useEffect(() => {
    const s = io('/arena', { path: '/socket.io', withCredentials: true });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      s.emit(SocketEvents.ArenaWatch, arenaId);
    });
    s.on('disconnect', () => setConnected(false));

    s.on(SocketEvents.ArenaState, (payload: ArenaStatePayload) => setState(payload));

    s.on(SocketEvents.ArenaGameState, (payload: ArenaGamePayload) => {
      setGames((prev) => ({ ...prev, [payload.id]: payload }));
      if (meId && (payload.whiteId === meId || payload.blackId === meId)) {
        setMyGameId(payload.id);
        // Сообщение о прошлой партии убираем сами: держать его над новой
        // доской незачем, а закрывать вручную человек не обязан.
        if (payload.status === 'live') setLastResult(null);
      }
    });

    s.on(SocketEvents.ArenaGameOver, (payload: ArenaGameOverPayload) => {
      setLastResult(payload);
    });

    s.on(SocketEvents.ArenaChatHistory, (list: ChatMessageDto[]) => setChat(list));
    s.on(SocketEvents.ArenaChatNew, (msg: ChatMessageDto) =>
      setChat((prev) => [...prev, msg]),
    );

    s.on(SocketEvents.ArenaError, (text: string) => setError(text));

    return () => {
      s.close();
      socketRef.current = null;
    };
  }, [arenaId, meId]);

  const myGame = myGameId ? games[myGameId] ?? null : null;
  const watchedGame = watchedId ? games[watchedId] ?? null : null;

  const join = useCallback((accessCode?: string) => {
    setLastResult(null);
    setError(null);
    socketRef.current?.emit(SocketEvents.ArenaJoin, { accessCode });
  }, []);

  const pause = useCallback(() => {
    socketRef.current?.emit(SocketEvents.ArenaPause);
  }, []);

  const watch = useCallback((gameId: string) => {
    setWatchedId(gameId);
    socketRef.current?.emit(SocketEvents.ArenaGameWatch, gameId);
  }, []);

  const move = useCallback(
    (m: { from: string; to: string; promotion?: string }) => {
      if (!myGameId) return;
      socketRef.current?.emit(SocketEvents.ArenaMove, { gameId: myGameId, ...m });
    },
    [myGameId],
  );

  const gameAction = useCallback(
    (event: string) => {
      if (!myGameId) return;
      socketRef.current?.emit(event, myGameId);
    },
    [myGameId],
  );

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socketRef.current?.emit(SocketEvents.ArenaChatSend, trimmed);
  }, []);

  const resign = useCallback(() => gameAction(SocketEvents.ArenaResign), [gameAction]);
  const offerDraw = useCallback(() => gameAction(SocketEvents.ArenaDrawOffer), [gameAction]);
  const acceptDraw = useCallback(() => gameAction(SocketEvents.ArenaDrawAccept), [gameAction]);
  const declineDraw = useCallback(() => gameAction(SocketEvents.ArenaDrawDecline), [gameAction]);

  const dismissError = useCallback(() => setError(null), []);
  const dismissResult = useCallback(() => setLastResult(null), []);

  return useMemo(
    () => ({
      connected,
      state,
      myGame,
      watchedGame,
      chat,
      error,
      dismissError,
      lastResult,
      dismissResult,
      join,
      pause,
      watch,
      move,
      resign,
      offerDraw,
      acceptDraw,
      declineDraw,
      sendChat,
    }),
    [
      connected,
      state,
      myGame,
      watchedGame,
      chat,
      error,
      dismissError,
      lastResult,
      dismissResult,
      join,
      pause,
      watch,
      move,
      resign,
      offerDraw,
      acceptDraw,
      declineDraw,
      sendChat,
    ],
  );
}
