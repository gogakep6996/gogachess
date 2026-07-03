'use client';

import { AudioPanel } from '@/components/room/AudioPanel';
import { ChatPanel } from '@/components/room/ChatPanel';
import { useClassAudio } from '@/contexts/ClassAudioContext';

interface Props {
  meId: string;
  /** Учитель ли я? (для force-mute-all и т.п.) */
  isTeacher: boolean;
  /** Опциональный блок, который будет вставлен между аудио и чатом (например, ростер учеников). */
  middleSlot?: React.ReactNode;
  /** Горизонтальная (рядом) или вертикальная (стопкой, для боковой колонки) раскладка. */
  layout?: 'vertical' | 'horizontal';
  /** Показывать ли встроенный чат. У учителя он вынесен в плавающую иконку
   *  (`FloatingChat`), поэтому здесь его отключаем, чтобы не дублировать. */
  showChat?: boolean;
}

/**
 * Общеклассовый канал: аудио (WebRTC mesh) + чат класса.
 *
 * Сами хуки `useRoomSocket(lobbyRoomCode)` и `useAudioRoom(socket)` теперь
 * живут в `<ClassAudioProvider>` уровнем выше, чтобы WebRTC mesh переживал
 * любые переключения главной колонки (дашборд ↔ доска ученика ↔ «Моя доска»).
 * Эта панель — чистое отображение для контекста.
 *
 * Если контекста нет — отрисуем заглушку: значит, родитель не обернул нас
 * в провайдер (вероятно, урок ещё не начат).
 */
export function ClassLobbyPanel({
  meId,
  isTeacher,
  middleSlot,
  layout = 'vertical',
  showChat = true,
}: Props) {
  const ctx = useClassAudio();
  if (!ctx) {
    return (
      <div className="card text-xs text-stone-500">
        Аудио, ученики и чат класса появятся, когда урок будет запущен.
      </div>
    );
  }
  const { audio, participants, messages, sendChat, clearChat } = ctx;

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
      </div>
      {middleSlot}
      {/* Чат: фиксированная высота, чтобы при добавлении сообщений блок
          не растягивался бесконечно вниз. Внутренняя область с сообщениями
          прокручивается сама (overflow-y-auto в ChatPanel).
          У учителя чат вынесен в плавающую иконку — здесь он скрыт (showChat=false). */}
      {showChat && (
        <div className="card !p-2 h-[440px]">
          <ChatPanel
            variant="compact"
            messages={messages}
            meId={meId}
            onSend={(text) => sendChat(text)}
            onClear={isTeacher ? clearChat : undefined}
          />
        </div>
      )}
    </div>
  );
}
