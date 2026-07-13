'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface DialogDto {
  peerId: string;
  peerName: string;
  lastText: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

interface DmDto {
  id: string;
  fromId: string;
  content: string;
  createdAt: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/**
 * Личные сообщения: слева список диалогов, справа переписка.
 * Основной сценарий — переговоры админов групп о совместных турнирах.
 * Обновление поллингом каждые 5 секунд.
 */
export function MessagesClient({
  meId,
  initialPeerId,
}: {
  meId: string;
  initialPeerId: string | null;
}) {
  const [dialogs, setDialogs] = useState<DialogDto[] | null>(null);
  const [peerId, setPeerId] = useState<string | null>(initialPeerId);
  const [peerName, setPeerName] = useState<string>('');
  const [messages, setMessages] = useState<DmDto[]>([]);
  const [input, setInput] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const loadDialogs = useCallback(async () => {
    const res = await fetch('/api/messages', { cache: 'no-store' });
    if (!res.ok) return;
    const d = (await res.json()) as { dialogs: DialogDto[] };
    setDialogs(d.dialogs);
  }, []);

  const loadThread = useCallback(async (uid: string) => {
    const res = await fetch(`/api/messages/${uid}`, { cache: 'no-store' });
    if (!res.ok) return;
    const d = (await res.json()) as { peer: { id: string; name: string }; messages: DmDto[] };
    setPeerName(d.peer.name);
    setMessages(d.messages);
  }, []);

  useEffect(() => {
    void loadDialogs();
    const t = setInterval(() => void loadDialogs(), 5000);
    return () => clearInterval(t);
  }, [loadDialogs]);

  useEffect(() => {
    if (!peerId) return;
    void loadThread(peerId);
    const t = setInterval(() => void loadThread(peerId), 5000);
    return () => clearInterval(t);
  }, [peerId, loadThread]);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, peerId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || !peerId) return;
    setInput('');
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toId: peerId, content }),
    });
    if (res.ok) {
      const d = (await res.json()) as { message: DmDto };
      setMessages((m) => [...m, d.message]);
      void loadDialogs();
    }
  }

  return (
    <div>
      <h1 className="mb-5 font-display text-3xl font-semibold">Сообщения</h1>

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        {/* Список диалогов */}
        <div className="card max-h-[30rem] overflow-y-auto !p-2">
          {dialogs === null ? (
            <p className="py-8 text-center text-xs text-stone-400">Загружаем…</p>
          ) : dialogs.length === 0 && !peerId ? (
            <p className="px-3 py-8 text-center text-xs leading-relaxed text-stone-400">
              Диалогов пока нет. Найдите группу в «Сообществе» и напишите её админу.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {dialogs?.map((d) => (
                <li key={d.peerId}>
                  <button
                    type="button"
                    onClick={() => setPeerId(d.peerId)}
                    className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors ${
                      peerId === d.peerId
                        ? 'bg-brand-50 dark:bg-brand-900/20'
                        : 'hover:bg-stone-100 dark:hover:bg-stone-800/60'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{d.peerName}</span>
                      <span className="shrink-0 text-[10px] text-stone-400">{fmtTime(d.lastAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-stone-500 dark:text-stone-400">
                        {d.lastFromMe ? 'Вы: ' : ''}
                        {d.lastText}
                      </span>
                      {d.unread > 0 && (
                        <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {d.unread}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Переписка */}
        <div className="card flex h-[30rem] flex-col !p-3">
          {!peerId ? (
            <p className="m-auto max-w-xs text-center text-sm leading-relaxed text-stone-400">
              Выберите диалог слева или напишите админу группы со страницы группы.
            </p>
          ) : (
            <>
              <div className="mb-2 shrink-0 border-b border-stone-200/70 pb-2 text-sm font-semibold dark:border-stone-700/60">
                {peerName || '…'}
              </div>
              <div ref={boxRef} className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {messages.map((m) => {
                  const mine = m.fromId === meId;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${
                          mine
                            ? 'rounded-br-sm bg-brand-500 text-white'
                            : 'rounded-bl-sm bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100'
                        }`}
                      >
                        <span className="whitespace-pre-wrap break-words">{m.content}</span>
                        <span
                          className={`ml-2 align-bottom text-[10px] ${
                            mine ? 'text-white/70' : 'text-stone-400'
                          }`}
                        >
                          {fmtTime(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={send} className="mt-2 flex shrink-0 gap-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Сообщение…"
                  className="input flex-1 !py-2 text-sm"
                  maxLength={2000}
                />
                <button type="submit" disabled={!input.trim()} className="btn-primary !py-2 text-xs">
                  Отправить
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
