'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/components/room/ChatPanel';
import type { ChatMessageDto } from '@/lib/socket-events';
import { useClassAudio } from '@/contexts/ClassAudioContext';

interface Props {
  messages: ChatMessageDto[];
  meId: string;
  onSend: (text: string) => void;
  /** Если задан — в чате доступна кнопка «очистить» (владельцу/учителю). */
  onClear?: () => void;
}

/**
 * Плавающая иконка чата в правом нижнем углу. Пока свёрнут — над иконкой висит
 * бейдж с числом непрочитанных сообщений (пришедших от других, пока чат закрыт).
 * Клик по иконке разворачивает окно чата; крестик — сворачивает обратно.
 */
export function FloatingChat({ messages, meId, onSend, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  // Сколько сообщений уже «учтено» (просмотрено или зачтено в бейдж).
  const seenRef = useRef(0);
  const initRef = useRef(false);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const prevLen = prevLenRef.current;
    prevLenRef.current = messages.length;
    // Первый прогон: считаем всё, что уже есть (история), просмотренным —
    // бейдж не должен вспыхивать на всю историю при входе.
    if (!initRef.current) {
      initRef.current = true;
      seenRef.current = messages.length;
      return;
    }
    if (open) {
      seenRef.current = messages.length;
      setUnread(0);
      return;
    }
    // Массовая загрузка истории (с пустого сразу на несколько) — это не новые
    // сообщения, а подгрузка прошлого: помечаем просмотренным без бейджа.
    if (prevLen === 0 && messages.length - seenRef.current > 1) {
      seenRef.current = messages.length;
      return;
    }
    if (messages.length > seenRef.current) {
      const added = messages
        .slice(seenRef.current)
        .filter((m) => m.userId !== meId).length;
      seenRef.current = messages.length;
      if (added > 0) setUnread((u) => u + added);
    }
  }, [messages, open, meId]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="h-[min(70vh,460px)] w-[min(92vw,340px)]">
          <ChatPanel
            variant="compact"
            messages={messages}
            meId={meId}
            onSend={onSend}
            onClear={onClear}
            onCollapse={() => setOpen(false)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Свернуть чат' : 'Открыть чат'}
        aria-label={open ? 'Свернуть чат' : 'Открыть чат'}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg ring-1 ring-black/5 transition hover:bg-brand-600 active:scale-95"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow ring-2 ring-paper dark:ring-stone-900">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * Обёртка для урока класса: берёт чат из общего канала (`ClassAudioContext`).
 * Если контекста нет (урок не идёт) — ничего не рисует.
 */
export function LobbyFloatingChat({ meId, isTeacher = false }: { meId: string; isTeacher?: boolean }) {
  const ctx = useClassAudio();
  if (!ctx) return null;
  return (
    <FloatingChat
      messages={ctx.messages}
      meId={meId}
      onSend={ctx.sendChat}
      onClear={isTeacher ? ctx.clearChat : undefined}
    />
  );
}
