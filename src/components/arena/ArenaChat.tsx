'use client';

// Общий чат арены. История живёт в памяти сервера и пропадает после
// перезапуска: это разговор во время турнира, а не переписка.

import { useEffect, useRef, useState } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';

import { IconButton } from '@/components/room/ui';
import type { ChatMessageDto } from '@/lib/socket-events';

export function ArenaChat({
  messages,
  meId,
  onSend,
  canWrite,
}: {
  messages: ChatMessageDto[];
  meId: string | null;
  onSend: (text: string) => void;
  canWrite: boolean;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Держим прокрутку у последнего сообщения, но только внутри самого списка:
  // scrollIntoView увёл бы страницу и сдвинул доску.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-stone-400 dark:text-stone-500">
            Сообщений пока нет
          </p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="text-[12.5px] leading-snug">
              <span
                className={
                  m.userId === meId
                    ? 'font-semibold text-brand-700 dark:text-brand-300'
                    : 'font-semibold text-stone-600 dark:text-stone-300'
                }
              >
                {m.userName}
              </span>
              <span className="text-stone-700 dark:text-stone-200">: {m.content}</span>
            </p>
          ))
        )}
      </div>

      {canWrite ? (
        <form
          className="flex shrink-0 items-center gap-1.5 border-t border-stone-900/[0.06] p-1.5 dark:border-white/[0.06]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Написать всем"
            aria-label="Сообщение в чат турнира"
            className="h-8 min-w-0 flex-1 rounded-xl bg-stone-900/[0.05] px-2.5 text-[12.5px] text-stone-800 outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:bg-white/[0.07] dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <IconButton
            type="submit"
            icon={PaperPlaneRight}
            label="Отправить"
            tone="primary"
            disabled={!text.trim()}
          />
        </form>
      ) : (
        <p className="shrink-0 border-t border-stone-900/[0.06] px-2.5 py-2 text-[11.5px] text-stone-500 dark:border-white/[0.06] dark:text-stone-400">
          Чтобы писать в чат, войдите на сайт
        </p>
      )}
    </div>
  );
}
