'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BOARD_THEMES,
  BOARD_THEME_KEY,
  DEFAULT_BOARD_THEME,
  getBoardTheme,
  PIECE_THEMES,
  PIECE_THEME_KEY,
  DEFAULT_PIECE_THEME,
  getPieceTheme,
} from '@/lib/board-theme';
import { PIECE_SETS, usePieceSetStore } from '@/lib/piece-set';
import { PieceSvg } from '@/components/chess/PieceSvg';

export interface AccountUser {
  id: string;
  displayName: string;
  email: string | null;
  phone?: string | null;
  emailVerifiedAt: string | null;
}

interface NotificationDto {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

type SectionId = 'email' | 'board' | 'pieces' | 'notifs';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/**
 * Выпадающее меню аккаунта в шапке. Устроено как аккордеон: секции
 * (почта / стиль доски / стиль фигур / уведомления) раскрываются по одной,
 * поэтому панель остаётся компактной, а «Выйти» всегда видно внизу.
 */
export function AccountMenu({
  user,
  onUserChange,
  onLogout,
}: {
  user: AccountUser;
  onUserChange: (next: AccountUser) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const emailMissing = !user.email;
  const emailUnverified = Boolean(user.email && !user.emailVerifiedAt);

  // Аккордеон: открыта максимум одна секция. Если с почтой непорядок —
  // сразу раскрываем её, чтобы человек увидел, что сделать.
  const [section, setSection] = useState<SectionId | null>(
    emailMissing || emailUnverified ? 'email' : null,
  );
  const toggleSection = (id: SectionId) => setSection((cur) => (cur === id ? null : id));

  // ---- Тема доски и фигур ----
  const [themeId, setThemeId] = useState(DEFAULT_BOARD_THEME);
  const [colorId, setColorId] = useState(DEFAULT_PIECE_THEME);
  const pieceSetId = usePieceSetStore((s) => s.setId);
  const setPieceSet = usePieceSetStore((s) => s.setPieceSet);

  useEffect(() => {
    try {
      const savedBoard = localStorage.getItem(BOARD_THEME_KEY);
      if (savedBoard) setThemeId(getBoardTheme(savedBoard).id);
      const savedColors = localStorage.getItem(PIECE_THEME_KEY);
      if (savedColors) setColorId(getPieceTheme(savedColors).id);
    } catch {
      /* localStorage недоступен — остаёмся на дефолтах */
    }
  }, []);

  const applyTheme = useCallback((id: string) => {
    setThemeId(id);
    try {
      localStorage.setItem(BOARD_THEME_KEY, id);
    } catch {
      /* ок */
    }
    document.documentElement.setAttribute('data-board-theme', id);
  }, []);

  const applyColors = useCallback((id: string) => {
    setColorId(id);
    try {
      localStorage.setItem(PIECE_THEME_KEY, id);
    } catch {
      /* ок */
    }
    document.documentElement.setAttribute('data-piece-theme', id);
  }, []);

  // ---- Уведомления ----
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);

  const loadNotifications = useCallback(async (markRead: boolean) => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationDto[]; unread: number };
      setNotifications(data.notifications);
      setUnread(data.unread);
      if (markRead && data.unread > 0) {
        await fetch('/api/notifications', { method: 'POST' });
        setUnread(0);
      }
    } catch {
      /* сеть моргнула — не страшно */
    }
  }, []);

  // Бейдж непрочитанных — сразу при загрузке страницы.
  useEffect(() => {
    void loadNotifications(false);
  }, [loadNotifications]);

  // Открыли секцию уведомлений — обновляем и помечаем прочитанными.
  useEffect(() => {
    if (open && section === 'notifs') void loadNotifications(true);
  }, [open, section, loadNotifications]);

  // ---- Закрытие по клику вне меню и Escape ----
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // ---- Добавление почты ----
  const [emailForm, setEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await fetch('/api/auth/add-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        email?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (res.ok && data.ok && data.email) {
        onUserChange({ ...user, email: data.email, emailVerifiedAt: null });
        setEmailForm(false);
        setEmailInput('');
        setEmailMsg({
          ok: true,
          text: data.emailSent
            ? `Письмо отправлено на ${data.email} — проверьте почту (и спам).`
            : 'Почта сохранена, но письмо не ушло. Нажмите «Отправить письмо».',
        });
      } else {
        setEmailMsg({ ok: false, text: data.error || 'Не удалось сохранить почту' });
      }
    } catch {
      setEmailMsg({ ok: false, text: 'Ошибка сети. Попробуйте ещё раз.' });
    } finally {
      setEmailBusy(false);
    }
  }

  const [resendBusy, setResendBusy] = useState(false);
  async function resendVerification() {
    if (resendBusy) return;
    setResendBusy(true);
    setEmailMsg(null);
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      setEmailMsg(
        res.ok && data.ok
          ? { ok: true, text: 'Письмо отправлено — проверьте почту (и спам).' }
          : { ok: false, text: data.error || 'Не удалось отправить письмо' },
      );
    } catch {
      setEmailMsg({ ok: false, text: 'Ошибка сети. Попробуйте ещё раз.' });
    } finally {
      setResendBusy(false);
    }
  }

  const initial = (user.displayName || '?').trim().charAt(0).toUpperCase();
  const selectedTheme = getBoardTheme(themeId);
  const selectedColors = getPieceTheme(colorId);
  const selectedSet = PIECE_SETS.find((s) => s.id === pieceSetId) ?? PIECE_SETS[0];

  const emailStatus: { label: string; tone: string } = user.email
    ? user.emailVerifiedAt
      ? { label: '✓', tone: 'text-emerald-600 dark:text-emerald-400' }
      : { label: 'не подтверждена', tone: 'text-amber-600 dark:text-amber-400' }
    : { label: 'добавить', tone: 'text-red-500 dark:text-red-400' };

  return (
    <div ref={rootRef} className="relative">
      {/* Кнопка аккаунта */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-stone-100/80 dark:hover:bg-stone-800/60"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white shadow-soft">
          {initial}
          {(unread > 0 || emailMissing || emailUnverified) && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 dark:border-stone-900" />
          )}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm text-stone-700 dark:text-stone-200 sm:inline">
          {user.displayName}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`hidden h-3.5 w-3.5 text-stone-400 transition-transform sm:block ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Выпадающая панель */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(80vh,32rem)] w-[19.5rem] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-paper/95 shadow-xl backdrop-blur-md dark:border-stone-700/80 dark:bg-stone-900/95">
          {/* Шапка: кто я (всегда видна) */}
          <div className="flex shrink-0 items-center gap-3 border-b border-stone-200/70 px-4 py-3 dark:border-stone-800/70">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-base font-semibold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.displayName}</div>
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                {user.email ?? user.phone ?? 'без контактов'}
              </div>
            </div>
          </div>

          {/* Секции-аккордеон (скроллится при нехватке места) */}
          <div className="flex-1 overflow-y-auto">
            {/* ---- Почта ---- */}
            <Section
              icon="✉"
              title="Почта"
              meta={<span className={`text-[11px] font-medium ${emailStatus.tone}`}>{emailStatus.label}</span>}
              open={section === 'email'}
              onToggle={() => toggleSection('email')}
            >
              {user.email && user.emailVerifiedAt && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ Почта подтверждена: {user.email}
                </p>
              )}

              {emailMissing && !emailForm && (
                <>
                  <p className="mb-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                    Добавьте почту, чтобы подтвердить аккаунт и восстанавливать пароль.
                  </p>
                  <button
                    onClick={() => {
                      setEmailForm(true);
                      setEmailMsg(null);
                    }}
                    className="btn-primary w-full !py-2 text-xs"
                  >
                    + Добавить почту
                  </button>
                </>
              )}

              {emailUnverified && !emailForm && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                    Подтвердите {user.email}: нажмите кнопку и откройте ссылку из письма.
                  </p>
                  <button
                    onClick={resendVerification}
                    disabled={resendBusy}
                    className="btn-primary w-full !py-2 text-xs"
                  >
                    {resendBusy ? 'Отправляем…' : 'Отправить письмо ещё раз'}
                  </button>
                  <button
                    onClick={() => {
                      setEmailForm(true);
                      setEmailInput(user.email ?? '');
                      setEmailMsg(null);
                    }}
                    className="text-center text-[11px] text-stone-400 underline-offset-2 hover:underline"
                  >
                    указать другую почту
                  </button>
                </div>
              )}

              {emailForm && (
                <form onSubmit={submitEmail} className="flex flex-col gap-1.5">
                  <input
                    type="email"
                    required
                    autoFocus
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.ru"
                    className="input !py-2 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      disabled={emailBusy}
                      className="btn-primary flex-1 !py-2 text-xs"
                    >
                      {emailBusy ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailForm(false);
                        setEmailMsg(null);
                      }}
                      className="btn-outline !py-2 text-xs"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}

              {emailMsg && (
                <p
                  className={`mt-1.5 text-[11px] leading-snug ${
                    emailMsg.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {emailMsg.text}
                </p>
              )}
            </Section>

            {/* ---- Стиль доски ---- */}
            <Section
              icon="▦"
              title="Стиль доски"
              meta={
                <span className="text-[11px] text-stone-400">{selectedTheme.name}</span>
              }
              open={section === 'board'}
              onToggle={() => toggleSection('board')}
            >
              <div className="grid grid-cols-5 gap-1.5">
                {BOARD_THEMES.map((t) => {
                  const active = t.id === themeId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={t.name}
                      onClick={() => applyTheme(t.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg transition-all ${
                        active
                          ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-stone-900'
                          : 'ring-1 ring-stone-200 hover:scale-105 dark:ring-stone-700'
                      }`}
                    >
                      <span className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                        <span style={{ background: t.lightBg ?? t.light }} />
                        <span style={{ background: t.darkBg ?? t.dark }} />
                        <span style={{ background: t.darkBg ?? t.dark }} />
                        <span style={{ background: t.lightBg ?? t.light }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ---- Стиль фигур: форма + цвет ---- */}
            <Section
              icon="♞"
              title="Стиль фигур"
              meta={
                <span className="text-[11px] text-stone-400">
                  {selectedSet.name} · {selectedColors.name}
                </span>
              }
              open={section === 'pieces'}
              onToggle={() => toggleSection('pieces')}
            >
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                Форма
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {PIECE_SETS.map((s) => {
                  const active = s.id === pieceSetId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPieceSet(s.id)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-all ${
                        active
                          ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/20'
                          : 'ring-1 ring-stone-200 hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <span className="flex h-9 items-center">
                        <PieceSvg code="wn" set={s.id} className="h-8 w-8" />
                        <PieceSvg code="bn" set={s.id} className="-ml-2 h-8 w-8" />
                      </span>
                      <span className="text-[10px] font-medium text-stone-600 dark:text-stone-300">
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                Цвет
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {PIECE_THEMES.map((t) => {
                  const active = t.id === colorId;
                  // Локально переопределяем переменные цвета — превью показывает
                  // эту палитру в текущей форме фигур и на текущей доске.
                  const vars = {
                    '--piece-w-fill': t.wFill,
                    '--piece-w-stroke': t.wStroke,
                    '--piece-b-fill': t.bFill,
                    '--piece-b-stroke': t.bStroke,
                  } as CSSProperties;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={t.name}
                      onClick={() => applyColors(t.id)}
                      style={vars}
                      className={`relative grid aspect-square grid-cols-2 overflow-hidden rounded-lg transition-all ${
                        active
                          ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-stone-900'
                          : 'ring-1 ring-stone-200 hover:scale-105 dark:ring-stone-700'
                      }`}
                    >
                      <span
                        className="flex items-center justify-center"
                        style={{ background: 'var(--board-dark-bg, #b58863)' }}
                      >
                        <PieceSvg code="wn" className="h-[85%] w-[85%]" />
                      </span>
                      <span
                        className="flex items-center justify-center"
                        style={{ background: 'var(--board-light-bg, #f0d9b5)' }}
                      >
                        <PieceSvg code="bn" className="h-[85%] w-[85%]" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ---- Уведомления ---- */}
            <Section
              icon="🔔"
              title="Уведомления"
              meta={
                unread > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                ) : notifications.length > 0 ? (
                  <span className="text-[11px] text-stone-400">{notifications.length}</span>
                ) : null
              }
              open={section === 'notifs'}
              onToggle={() => toggleSection('notifs')}
            >
              {notifications.length === 0 ? (
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  Пока нет уведомлений.
                </p>
              ) : (
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`rounded-lg px-2 py-1.5 text-xs ${
                        n.readAt
                          ? 'text-stone-500 dark:text-stone-400'
                          : 'bg-brand-50 text-stone-700 dark:bg-brand-900/20 dark:text-stone-200'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={n.readAt ? 'font-medium' : 'font-semibold'}>
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-stone-400">
                          {fmtTime(n.createdAt)}
                        </span>
                      </div>
                      {n.body && <p className="mt-0.5 leading-snug">{n.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Выход — всегда виден внизу */}
          <div className="shrink-0 border-t border-stone-200/70 px-2 py-1.5 dark:border-stone-800/70">
            <button
              onClick={onLogout}
              className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              ⎋ Выйти из аккаунта
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Секция аккордеона: строка-заголовок + раскрывающееся содержимое. */
function Section({
  icon,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-stone-200/70 last:border-b-0 dark:border-stone-800/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40"
        aria-expanded={open}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center text-sm" aria-hidden>
          {icon}
        </span>
        <span className="flex-1 text-sm font-medium">{title}</span>
        {meta}
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div className="px-4 pb-3 pt-0.5">{children}</div>}
    </div>
  );
}
