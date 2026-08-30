'use client';

import { useState } from 'react';
import {
  Gear,
  Hand,
  Microphone,
  MicrophoneSlash,
  SignOut,
  SpeakerSimpleSlash,
  SpeakerSimpleHigh,
  UsersThree,
} from '@phosphor-icons/react';
import type { Participant } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import { EmptyHint, FieldLabel, IconButton, Panel, ToolButton } from './ui';

interface Props {
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
  onForceMuteAll: (mute: boolean) => void;
  /** Клик по строке ученика (учителю): дать/забрать слово и право хода. */
  onSelectParticipant?: (p: Participant) => void;
  /** userId участника, которому сейчас разрешено говорить и ходить. */
  spotlightUserId?: string | null;

  inputDevices?: MediaDeviceInfo[];
  outputDevices?: MediaDeviceInfo[];
  currentInputId?: string | null;
  currentOutputId?: string | null;
  outputSupported?: boolean;
  onRefreshDevices?: (requestPermission?: boolean) => void;
  onSelectInput?: (deviceId: string) => void;
  onSelectOutput?: (deviceId: string) => void;

  className?: string;
}

/**
 * Список участников урока с управлением звуком. Отдельный от общего
 * `AudioPanel` компонент: комната получает свой ритм и размеры, а лобби
 * класса и турниры продолжают жить на старой панели без изменений.
 */
export function RoomParticipants({
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
  onSelectParticipant,
  spotlightUserId = null,
  inputDevices = [],
  outputDevices = [],
  currentInputId = null,
  currentOutputId = null,
  outputSupported = false,
  onRefreshDevices,
  onSelectInput,
  onSelectOutput,
  className,
}: Props) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const devicesAvailable = !!onSelectInput;

  const others = participants.filter((p) => p.userId !== meId);
  const someMuted = others.some((p) => p.forcedMute);
  const allMuted = others.length > 0 && others.every((p) => p.forcedMute);

  function toggleDevices() {
    setDevicesOpen((prev) => {
      const next = !prev;
      // При открытии просим доступ, иначе браузер не отдаёт названия устройств.
      if (next) onRefreshDevices?.(true);
      return next;
    });
  }

  return (
    <Panel
      title="Участники"
      icon={UsersThree}
      className={className}
      bodyClassName="flex min-h-0 flex-1 flex-col gap-2 p-2"
      action={
        <>
          <span className="mr-0.5 text-[11px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
            {participants.length}
          </span>
          {isOwner && joined && others.length > 0 && (
            <IconButton
              icon={allMuted ? SpeakerSimpleHigh : SpeakerSimpleSlash}
              label={allMuted ? 'Вернуть звук всем' : 'Выключить микрофоны всем'}
              onClick={() => onForceMuteAll(!allMuted)}
              active={allMuted}
            />
          )}
          {devicesAvailable && (
            <IconButton
              icon={Gear}
              label="Микрофон и звук"
              onClick={toggleDevices}
              active={devicesOpen}
              aria-expanded={devicesOpen}
            />
          )}
        </>
      }
    >
      {devicesAvailable && devicesOpen && (
        <div className="shrink-0 space-y-2 rounded-xl bg-stone-900/[0.04] p-2 dark:bg-white/[0.05]">
          <DeviceSelect
            label="Микрофон"
            value={currentInputId ?? ''}
            devices={inputDevices}
            fallbackLabel="Микрофон"
            emptyLabel="По умолчанию"
            onChange={(id) => onSelectInput?.(id)}
          />
          {outputSupported ? (
            <DeviceSelect
              label="Наушники или динамик"
              value={currentOutputId ?? ''}
              devices={outputDevices}
              fallbackLabel="Устройство вывода"
              emptyLabel="По умолчанию"
              onChange={(id) => onSelectOutput?.(id)}
            />
          ) : (
            <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              Браузер не даёт выбрать вывод звука. Переключите устройство в системе.
            </p>
          )}
          {inputDevices.length === 0 && (
            <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              Список пуст. Разрешите доступ к микрофону, чтобы увидеть устройства.
            </p>
          )}
        </div>
      )}

      {!joined ? (
        <ToolButton icon={Microphone} tone="primary" size="md" block onClick={onJoin}>
          Подключить микрофон
        </ToolButton>
      ) : (
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-stone-900/[0.04] p-1.5 dark:bg-white/[0.05]">
          <MicToggle enabled={micEnabled} forcedMute={forcedMute} onClick={onToggleMic} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-stone-600 dark:text-stone-300">
            {forcedMute
              ? 'Микрофон выключен учителем'
              : micEnabled
                ? 'Вас слышно'
                : 'Микрофон выключен'}
          </span>
          <IconButton icon={SignOut} label="Отключиться от звука" onClick={onLeave} />
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
        {participants.length === 0 && <EmptyHint>В комнате пока никого нет</EmptyHint>}
        {participants.map((p) => {
          const isMe = p.userId === meId;
          const speaking = p.micEnabled && (levels[p.socketId] ?? 0) > 0.06;
          // Ученик «на связи»: либо выбран явно, либо после общего выключения
          // микрофонов размьючен только он.
          const spotlighted =
            !isMe && (p.userId === spotlightUserId || (someMuted && !p.forcedMute));
          const clickable = isOwner && !isMe && !!onSelectParticipant;
          return (
            <li key={p.socketId}>
              <div
                onClick={clickable ? () => onSelectParticipant?.(p) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectParticipant?.(p);
                        }
                      }
                    : undefined
                }
                title={clickable ? 'Дать или забрать слово и право хода' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors duration-150',
                  spotlighted
                    ? 'bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800'
                    : 'bg-stone-900/[0.03] dark:bg-white/[0.04]',
                  clickable && 'cursor-pointer select-none',
                  clickable && !spotlighted && 'hover:bg-stone-900/[0.07] dark:hover:bg-white/[0.08]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white transition-shadow duration-150',
                    p.role === 'teacher' ? 'bg-brand-600' : 'bg-stone-500 dark:bg-stone-600',
                    speaking && 'ring-2 ring-brand-400 ring-offset-1 ring-offset-white dark:ring-offset-stone-900',
                  )}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        'truncate text-[12px] font-semibold',
                        spotlighted
                          ? 'text-amber-900 dark:text-amber-100'
                          : 'text-stone-800 dark:text-stone-100',
                      )}
                    >
                      {p.name}
                    </span>
                    {isMe && (
                      <span className="shrink-0 text-[11px] font-medium text-stone-400">вы</span>
                    )}
                  </span>
                  <span className="mt-px flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                    {spotlighted ? (
                      <>
                        <Hand size={11} weight="bold" aria-hidden />
                        говорит и ходит
                      </>
                    ) : (
                      <>{p.role === 'teacher' ? 'учитель' : 'ученик'}</>
                    )}
                  </span>
                </span>

                {p.micEnabled ? (
                  <Microphone
                    size={14}
                    weight="bold"
                    aria-label="микрофон включён"
                    className={cn(
                      'shrink-0',
                      speaking ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400',
                    )}
                  />
                ) : (
                  <MicrophoneSlash
                    size={14}
                    weight="bold"
                    aria-label="микрофон выключен"
                    className="shrink-0 text-stone-300 dark:text-stone-600"
                  />
                )}

                {isOwner && !isMe && (
                  <IconButton
                    icon={p.forcedMute ? SpeakerSimpleHigh : SpeakerSimpleSlash}
                    label={p.forcedMute ? 'Вернуть звук' : 'Выключить микрофон'}
                    className="!h-7 !w-7"
                    onClick={(e) => {
                      // Клик по кнопке не должен всплыть до строки: иначе заодно
                      // сработает выдача слова и права хода.
                      e.stopPropagation();
                      onForceMute(p.socketId, !p.forcedMute);
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  fallbackLabel,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  fallbackLabel: string;
  emptyLabel: string;
  onChange: (deviceId: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-xl border-0 bg-white px-2 text-[12px] font-medium text-stone-700 shadow-sm ring-1 ring-inset ring-stone-900/10 outline-none focus:ring-2 focus:ring-brand-500/50 dark:bg-stone-800 dark:text-stone-100 dark:ring-white/10"
      >
        {devices.length === 0 && <option value="">{emptyLabel}</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${fallbackLabel} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Круглая кнопка микрофона: включён — зелёная, выключен — серая, запрещён учителем — красная. */
function MicToggle({
  enabled,
  forcedMute,
  onClick,
}: {
  enabled: boolean;
  forcedMute: boolean;
  onClick: () => void;
}) {
  const off = forcedMute || !enabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={forcedMute}
      aria-pressed={enabled}
      aria-label={enabled ? 'Выключить микрофон' : 'Включить микрофон'}
      title={
        forcedMute
          ? 'Микрофон выключен учителем'
          : enabled
            ? 'Выключить микрофон'
            : 'Включить микрофон'
      }
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45',
        forcedMute
          ? 'cursor-not-allowed bg-red-500 text-white'
          : enabled
            ? 'bg-brand-600 text-white hover:bg-brand-700 active:translate-y-px'
            : 'bg-stone-200 text-stone-600 hover:bg-stone-300 active:translate-y-px dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600',
      )}
    >
      {off ? (
        <MicrophoneSlash size={18} weight="bold" aria-hidden />
      ) : (
        <Microphone size={18} weight="bold" aria-hidden />
      )}
    </button>
  );
}
