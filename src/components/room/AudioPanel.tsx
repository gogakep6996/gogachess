'use client';

import type { Participant } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'default' | 'compact';
  joined: boolean;
  micEnabled: boolean;
  forcedMute: boolean;
  participants: Participant[];
  meId: string;
  isOwner: boolean;
  levels: Record<string, number>;

  onJoin: () => void;
  onLeave: () => void;
  onToggleMic: () => void;
  onForceMute: (socketId: string, mute: boolean) => void;
  onForceMuteAll: () => void;
}

export function AudioPanel({
  variant = 'default',
  joined,
  micEnabled,
  forcedMute,
  participants,
  meId,
  isOwner,
  levels,
  onJoin,
  onLeave,
  onToggleMic,
  onForceMute,
  onForceMuteAll,
}: Props) {
  const c = variant === 'compact';

  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200/80 bg-white/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        c ? 'flex max-h-[100%] flex-col p-2' : 'card',
      )}
    >
      <div className={cn('flex items-center justify-between', c ? '' : 'mb-3')}>
        <h3 className={cn('font-semibold', c ? 'text-[11px]' : '')}>Аудио</h3>
        {isOwner && joined && (
          <button
            type="button"
            onClick={onForceMuteAll}
            className={cn('btn-ghost', c ? '!px-1.5 !py-0 text-[10px]' : 'text-xs')}
            title="Замьютить всех"
          >
            🔇 всем
          </button>
        )}
      </div>

      {!joined ? (
        <button type="button" onClick={onJoin} className={cn('btn-primary w-full', c && '!py-1.5 text-[11px]')}>
          🎙 подключиться
        </button>
      ) : (
        <div className={cn('flex items-center justify-between gap-2', c ? 'mt-1' : '')}>
          <MicToggleButton
            enabled={micEnabled}
            forcedMute={forcedMute}
            onClick={onToggleMic}
            compact={c}
          />
          <button
            type="button"
            onClick={onLeave}
            className={cn('btn-ghost text-[11px]', c && '!px-1.5 !py-0.5 text-[10px]')}
            title="Покинуть аудио"
          >
            вых.
          </button>
        </div>
      )}

      <ul
        className={cn(
          'space-y-1 overflow-y-auto pr-0.5',
          c ? 'mt-2 max-h-[9.5rem] flex-1' : 'mt-4 space-y-2',
        )}
      >
        {participants.map((p) => {
          const isMe = p.userId === meId;
          const level = levels[p.socketId] ?? 0;
          const speaking = p.micEnabled && level > 0.06;
          return (
            <li
              key={p.socketId}
              className={cn(
                'flex items-center justify-between rounded-lg bg-stone-50 dark:bg-stone-800/60',
                c ? 'gap-1 px-1.5 py-1' : 'rounded-xl px-3 py-2',
              )}
            >
              <div className={cn('flex min-w-0 items-center gap-2', !c && 'gap-3')}>
                <div
                  className={cn(
                    'grid shrink-0 place-items-center rounded-full font-semibold text-white',
                    p.role === 'teacher' ? 'bg-brand-500' : 'bg-stone-500',
                    speaking && 'animate-pulseRing',
                    c ? 'size-6 text-[10px]' : 'h-9 w-9 text-sm shadow-soft',
                  )}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className={cn('truncate font-medium', c ? 'text-[11px]' : 'text-sm')}>
                    {p.name}
                    {isMe && <span className="ml-0.5 text-[10px] opacity-60">(вы)</span>}
                  </div>
                  {!c && (
                    <div className="text-xs text-stone-500">
                      {p.role === 'teacher' ? 'учитель' : 'ученик'}
                      {p.forcedMute && ' · 🔇 принудительно'}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <MicIndicator enabled={p.micEnabled} compact={c} />
                {isOwner && !isMe && (
                  <button
                    type="button"
                    onClick={() => onForceMute(p.socketId, !p.forcedMute)}
                    className={cn('btn-ghost whitespace-nowrap', c ? '!px-1 !py-0 text-[10px]' : 'text-[11px]')}
                  >
                    {p.forcedMute ? '≡' : '×'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MicIndicator({ enabled, compact }: { enabled: boolean; compact?: boolean }) {
  return (
    <span
      className={cn(
        'badge',
        compact ? '!py-px !px-1 text-[9px]' : '',
        enabled
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
      )}
    >
      {compact ? (enabled ? '♪' : '—') : enabled ? '🎙 on' : '🔇 off'}
    </span>
  );
}

/** Одна круглая кнопка с SVG-иконкой микрофона: вкл = зелёная, выкл = серая,
 *  принудительно замьючен = красная с диагональю. */
function MicToggleButton({
  enabled,
  forcedMute,
  onClick,
  compact,
}: {
  enabled: boolean;
  forcedMute: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const size = compact ? 'h-9 w-9' : 'h-10 w-10';
  const isOff = forcedMute || !enabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={forcedMute}
      title={
        forcedMute
          ? 'Микрофон отключён учителем'
          : enabled
            ? 'Выключить микрофон'
            : 'Включить микрофон'
      }
      aria-pressed={enabled}
      aria-label={enabled ? 'Микрофон включён' : 'Микрофон выключен'}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        size,
        forcedMute
          ? 'cursor-not-allowed bg-red-500/90 text-white shadow-soft'
          : enabled
            ? 'bg-emerald-500 text-white shadow-glow hover:bg-emerald-600 active:scale-95'
            : 'bg-stone-200 text-stone-600 hover:bg-stone-300 active:scale-95 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600',
      )}
    >
      <MicSvg muted={isOff} className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}

function MicSvg({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
      {muted && <path d="M3 3l18 18" stroke="currentColor" strokeWidth={2.2} />}
    </svg>
  );
}
