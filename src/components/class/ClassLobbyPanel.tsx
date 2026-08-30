'use client';

import { RoomParticipants } from '@/components/room/RoomParticipants';
import { RoomChat } from '@/components/room/RoomChat';
import { useClassAudio } from '@/contexts/ClassAudioContext';
import { cn } from '@/lib/utils';

interface Props {
  meId: string;
  /** Учитель ли я? (управление чужими микрофонами, очистка чата) */
  isTeacher: boolean;
  /** Показывать ли чат класса. */
  showChat?: boolean;
  className?: string;
}

/**
 * Правая колонка урока: кто на связи и общий чат класса.
 *
 * Сами хуки `useRoomSocket(lobbyRoomCode)` и `useAudioRoom(socket)` живут в
 * `<ClassAudioProvider>` уровнем выше, чтобы WebRTC mesh переживал любые
 * переключения главной области (дашборд, доска ученика, «Моя доска»). Эта
 * колонка — чистое отображение.
 *
 * Панели — те же, что в комнате урока: класс и комната не должны выглядеть
 * как два разных продукта.
 */
export function ClassLobbyPanel({ meId, isTeacher, showChat = true, className }: Props) {
  const ctx = useClassAudio();
  if (!ctx) return null;
  const { audio, participants, messages, sendChat, clearChat } = ctx;

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <RoomParticipants
        className={showChat ? 'max-h-[22rem] shrink-0' : 'min-h-0 flex-1'}
        joined={audio.joined}
        micEnabled={audio.micEnabled}
        forcedMute={audio.forcedMute}
        participants={participants}
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
        inputDevices={audio.inputDevices}
        outputDevices={audio.outputDevices}
        currentInputId={audio.currentInputId}
        currentOutputId={audio.currentOutputId}
        outputSupported={audio.outputSupported}
        onRefreshDevices={(req) => {
          audio.refreshDevices(req).catch(() => undefined);
        }}
        onSelectInput={(id) => {
          audio.setInputDevice(id).catch(() => undefined);
        }}
        onSelectOutput={(id) => {
          audio.setOutputDevice(id).catch(() => undefined);
        }}
        onSelectParticipant={
          isTeacher ? (p) => audio.forceMute(p.socketId, !p.forcedMute) : undefined
        }
      />
      {showChat && (
        <RoomChat
          className="min-h-[14rem] flex-1"
          title="Чат класса"
          messages={messages}
          meId={meId}
          onSend={sendChat}
          onClear={isTeacher ? clearChat : undefined}
        />
      )}
    </div>
  );
}
