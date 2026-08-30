'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatCircleText, Eraser, PaperPlaneRight } from '@phosphor-icons/react';
import type { ChatMessageDto } from '@/lib/socket-events';
import { cn, formatTime } from '@/lib/utils';
import { EmptyHint, IconButton, Panel } from './ui';

/**
 * Чат внутри комнаты урока. Отдельный от общего `ChatPanel`: у комнаты своя
 * плотность и своя типографика, а турниры и лобби класса продолжают
 * использовать прежний компонент без изменений.
 */
export function RoomChat({
  messages,
  meId,
  onSend,
  onClear,
  title = 'Чат',
  className,
}: {
  messages: ChatMessageDto[];
  meId: string;
  onSend: (text: string) => void;
  /** Если задан — в шапке появляется кнопка очистки (учителю). */
  onClear?: () => void;
  title?: string;
  className?: string;
}) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const trimmed = text.trim();

  return (
    <Panel
      title={title}
      icon={ChatCircleText}
      className={className}
      bodyClassName="flex min-h-0 flex-1 flex-col p-2"
      action={
        onClear && messages.length > 0 ? (
          <IconButton icon={Eraser} label="Очистить чат" onClick={onClear} />
        ) : undefined
      }
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
      >
        {messages.length === 0 && <EmptyHint>Сообщений пока нет</EmptyHint>}
        {messages.map((m) => {
          const mine = m.userId === meId;
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={cn(
                  'max-w-[92%] px-2.5 py-1.5 text-[12px] leading-snug',
                  mine
                    ? 'rounded-2xl rounded-br-md bg-brand-600 text-white'
                    : 'rounded-2xl rounded-bl-md bg-stone-900/[0.06] text-stone-800 dark:bg-white/[0.08] dark:text-stone-100',
                )}
              >
                {!mine && (
                  <div className="mb-0.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                    {m.userName}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div
                  className={cn(
                    'mt-0.5 text-right text-[11px] tabular-nums',
                    mine ? 'text-white/60' : 'text-stone-400 dark:text-stone-500',
                  )}
                >
                  {formatTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed) return;
          onSend(trimmed);
          setText('');
        }}
        className="mt-2 flex shrink-0 items-center gap-1.5"
      >
        <input
          className="h-9 min-w-0 flex-1 rounded-xl border-0 bg-stone-900/[0.05] px-3 text-[12px] text-stone-800 outline-none ring-1 ring-inset ring-transparent transition placeholder:text-stone-400 focus:bg-white focus:ring-brand-500/50 dark:bg-white/[0.07] dark:text-stone-100 dark:focus:bg-stone-800"
          placeholder="Написать сообщение"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          aria-label="Текст сообщения"
        />
        <button
          type="submit"
          disabled={!trimmed}
          aria-label="Отправить сообщение"
          title="Отправить"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-colors duration-150 hover:bg-brand-700 active:translate-y-px disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
        >
          <PaperPlaneRight size={16} weight="fill" aria-hidden />
        </button>
      </form>
    </Panel>
  );
}
