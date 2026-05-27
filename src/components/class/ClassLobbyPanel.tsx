'use client';

import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useAudioRoom } from '@/hooks/useAudioRoom';
import { AudioPanel } from '@/components/room/AudioPanel';
import { ChatPanel } from '@/components/room/ChatPanel';

interface Props {
  lobbyRoomCode: string;
  meId: string;
  /** Учитель ли я? (для force-mute-all и т.п.) */
  isTeacher: boolean;
  /** Опциональный блок, который будет вставлен между аудио и чатом (например, ростер учеников). */
  middleSlot?: React.ReactNode;
  /** Горизонтальная (рядом) или вертикальная (стопкой, для боковой колонки) раскладка. */
  layout?: 'vertical' | 'horizontal';
}

/**
 * Общеклассовый канал: подключается к lobby-комнате класса,
 * даёт аудио (WebRTC mesh) и текстовый чат всем участникам урока.
 */
export function ClassLobbyPanel({
  lobbyRoomCode,
  meId,
  isTeacher,
  middleSlot,
  layout = 'vertical',
}: Props) {
  const room = useRoomSocket(lobbyRoomCode);
  const audio = useAudioRoom(room.socket);

  return (
    <div
      className={
        layout === 'horizontal'
          ? 'grid gap-3 lg:grid-cols-2'
          : 'flex flex-col gap-3'
      }
    >
      <div className="card !p-2">
        <AudioPanel
          variant="compact"
          joined={audio.joined}
          micEnabled={audio.micEnabled}
          forcedMute={audio.forcedMute}
          participants={room.participants}
          meId={meId}
          isOwner={isTeacher}
          levels={audio.levels}
          onJoin={() => {
            audio.join().catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.warn('audio join failed', err);
            });
          }}
          onLeave={audio.leave}
          onToggleMic={() => audio.setMic(!audio.micEnabled)}
          onForceMute={(sid, mute) => audio.forceMute(sid, mute)}
          onForceMuteAll={audio.forceMuteAll}
        />
      </div>
      {middleSlot}
      {/* Чат: фиксированная высота, чтобы при добавлении сообщений блок
          не растягивался бесконечно вниз. Внутренняя область с сообщениями
          прокручивается сама (overflow-y-auto в ChatPanel). */}
      <div className="card !p-2 h-[440px]">
        <ChatPanel
          variant="compact"
          messages={room.messages}
          meId={meId}
          onSend={(text) => room.sendChat(text)}
        />
      </div>
    </div>
  );
}
