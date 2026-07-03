'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageDto } from '@/lib/socket-events';
import { formatTime, cn } from '@/lib/utils';

interface Props {
  variant?: 'default' | 'compact';
  messages: ChatMessageDto[];
  meId: string;
  onSend: (text: string) => void;
  /** Если задан — показываем кнопку «очистить чат» (учителю). */
  onClear?: () => void;
  /** Если задан — показываем кнопку «свернуть» (для плавающего чата). */
  onCollapse?: () => void;
}

export function ChatPanel({ variant = 'default', messages, meId, onSend, onClear, onCollapse }: Props) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const compact = variant === 'compact';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-paper/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        compact ? 'h-full flex-1 p-2' : 'card flex h-full max-h-[28rem]',
      )}
    >
      <div className={cn('flex shrink-0 items-center justify-between', compact ? 'mb-1.5' : 'mb-3')}>
        <h3 className={cn('font-semibold', compact ? 'text-[11px]' : '')}>Чат</h3>
        <div className="flex items-center gap-1">
          {onClear && (
            <button
              type="button"
              onClick={() => {
                if (messages.length === 0) return;
                if (typeof window !== 'undefined' && !window.confirm('Очистить весь чат?')) return;
                onClear();
              }}
              className={cn(
                'btn-ghost whitespace-nowrap text-stone-500 hover:text-red-600',
                compact ? '!px-1.5 !py-0 text-[10px]' : 'text-xs',
              )}
              title="Очистить чат"
            >
              🗑 очистить
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className={cn(
                'btn-ghost text-stone-500 hover:text-stone-800 dark:hover:text-stone-100',
                compact ? '!px-1.5 !py-0 text-sm leading-none' : 'text-base leading-none',
              )}
              title="Свернуть чат"
              aria-label="Свернуть чат"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain',
          compact ? 'pr-0.5' : 'space-y-2 pr-1',
        )}
      >
        {messages.length === 0 && (
          <p className={cn('text-center text-stone-500', compact ? 'py-3 text-[10px]' : 'py-6 text-sm')}>
            Пока пусто
          </p>
        )}
        {messages.map((m) => {
          const mine = m.userId === meId;
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={cn(
                  mine ? 'rounded-lg rounded-br-sm bg-brand-500 text-white' : 'rounded-lg rounded-bl-sm bg-stone-100 dark:bg-stone-800',
                  compact ? 'max-w-[92%] px-2 py-1 text-[11px]' : 'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                )}
              >
                {!mine && (
                  <div className={cn('font-medium opacity-70', compact ? 'mb-px text-[9px]' : 'mb-0.5 text-xs')}>
                    {m.userName}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className={cn('text-right opacity-60', compact ? 'mt-px text-[8px]' : 'mt-0.5 text-[10px]')}>
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
          const t = text.trim();
          if (!t) return;
          onSend(t);
          setText('');
        }}
        className={cn(compact ? 'mt-2 shrink-0 gap-1.5' : 'mt-3 gap-2', 'flex')}
      >
        <input
          className={cn('input flex-1', compact ? '!py-1.5 !text-[11px]' : '')}
          placeholder="Текст…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <button type="submit" className={cn('btn-primary whitespace-nowrap', compact ? '!px-2 !py-1 text-[11px]' : '')}>
          →
        </button>
      </form>
    </div>
  );
}
