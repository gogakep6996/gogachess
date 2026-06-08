'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom, type UseAudioRoomResult } from '@/hooks/useAudioRoom';
import type { Participant, ChatMessageDto } from '@/lib/socket-events';

/**
 * Контекст «общеклассового канала». Поднимает ОДИН раз на уровне страницы
 * класса (`ClassMeClient` / `ClassPublicClient`):
 *   • сокет-подключение к lobby-комнате;
 *   • WebRTC mesh (useAudioRoom) на этом же сокете;
 *   • список участников lobby и lobby-чат.
 *
 * Это позволяет переключать главную колонку (дашборд ↔ RoomClient за доской
 * ученика ↔ собственная «Моя доска» / трансляция) и НЕ пересобирать аудио —
 * провайдер живёт стабильно, пока активен урок, mesh не рушится.
 *
 * Потребители:
 *   • `ClassLobbyPanel` — берёт audio/messages из контекста (вместо своих хуков);
 *   • `RoomClient` — внутри класса использует контекстный audio для AudioPanel,
 *     иначе fallback на собственный per-room useAudioRoom.
 */
export interface ClassAudioContextValue {
  audio: UseAudioRoomResult;
  participants: Participant[];
  messages: ChatMessageDto[];
  sendChat: (text: string) => void;
  /** Учитель: очистить чат лобби-комнаты. */
  clearChat: () => void;
}

const ClassAudioCtx = createContext<ClassAudioContextValue | null>(null);

export function ClassAudioProvider({
  lobbyRoomCode,
  children,
}: {
  lobbyRoomCode: string;
  children: ReactNode;
}) {
  const room = useRoomSocket(lobbyRoomCode);
  const audio = useAudioRoom(room.socket);
  return (
    <ClassAudioCtx.Provider
      value={{
        audio,
        participants: room.participants,
        messages: room.messages,
        sendChat: room.sendChat,
        clearChat: room.clearChat,
      }}
    >
      {children}
    </ClassAudioCtx.Provider>
  );
}

/** Возвращает значение контекста или null, если потребитель находится вне провайдера
 *  (например, RoomClient открыт вне класса — обычная комната `/room/[code]`). */
export function useClassAudio(): ClassAudioContextValue | null {
  return useContext(ClassAudioCtx);
}
