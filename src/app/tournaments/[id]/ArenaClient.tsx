'use client';

// Экран арены. Одна страница, три состояния: до старта, идёт, завершён.
//
// Раскладка как на Lichess, в три колонки: слева сведения о турнире и
// таблица, по центру доска (ограничена высотой экрана, чтобы партия
// помещалась целиком, без прокрутки), справа история ходов, кнопки партии,
// список партий и чат. На телефоне колонки складываются: доска сверху.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChatCircle,
  Clock,
  Pause,
  Play,
  PuzzlePiece,
  SignIn,
  Trash,
  Trophy,
  Users,
} from '@phosphor-icons/react';

import { ArenaBoard, GameControls } from '@/components/arena/ArenaBoard';
import { ArenaChat } from '@/components/arena/ArenaChat';
import { GameReview } from '@/components/arena/GameReview';
import { GamesList } from '@/components/arena/GamesList';
import { LiveBoards } from '@/components/arena/LiveBoards';
import { Countdown } from '@/components/arena/Countdown';
import { Podium } from '@/components/arena/Podium';
import { StandingsTable } from '@/components/arena/StandingsTable';
import { formatDuration } from '@/components/arena/time';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MoveNav } from '@/components/chess/MoveNav';
import { Segmented, StatusChip, ToolButton } from '@/components/room/ui';
import { useArenaSocket } from '@/hooks/useArenaSocket';
import { sideToMove } from '@/lib/fen';
import { ARENA_POINTS, timeControlLabel } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

const SURFACE =
  'rounded-2xl bg-white/90 ring-1 ring-stone-900/[0.07] backdrop-blur-sm ' +
  'shadow-[0_1px_2px_rgba(35,48,40,0.04),0_12px_28px_-22px_rgba(35,48,40,0.45)] ' +
  'dark:bg-stone-900/70 dark:ring-white/[0.08]';

type Tab = 'games' | 'chat';

/** «2 сентября, 16:45» — точный момент старта, а не «через 10 минут». */
function formatStartAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function ArenaClient({ arenaId, meId }: { arenaId: string; meId: string | null }) {
  const router = useRouter();
  const arena = useArenaSocket(arenaId, meId);
  const {
    state,
    myGame,
    watchedGame,
    chat,
    error,
    dismissError,
    lastResult,
    dismissResult,
    join,
    pause,
    watch,
  } = arena;

  const [tab, setTab] = useState<Tab>('games');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Какой ход показанной партии смотрим; null — актуальная позиция.
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  const live = state?.liveGames ?? [];
  const finishedGames = state?.finishedGames ?? [];
  const playing = !!state?.me && state.me.state === 'playing' && !!myGame;

  // Партия в центре: моя, если играю, иначе та, что смотрю со стороны.
  const currentGame = playing && myGame ? myGame : watchedGame;

  // Открыли другую партию — показываем её с актуальной позиции.
  const currentGameId = currentGame?.id ?? null;
  useEffect(() => setViewIdx(null), [currentGameId]);

  // Свободный игрок и зритель видят чужую партию: подставляем первую идущую,
  // пока человек не выбрал другую сам.
  useEffect(() => {
    if (playing || watchedGame || live.length === 0) return;
    watch(live[0].id);
  }, [playing, watchedGame, live, watch]);

  // Когда арена закончилась, открываем первую сыгранную партию для разбора.
  useEffect(() => {
    if (state?.status !== 'finished' || watchedGame || finishedGames.length === 0) return;
    watch(finishedGames[0].id);
  }, [state?.status, watchedGame, finishedGames, watch]);

  const ownerActions = useMemo(
    () => ({
      start: async () => {
        setBusy(true);
        await fetch(`/api/arenas/${arenaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        }).catch(() => undefined);
        setBusy(false);
      },
      remove: async () => {
        setBusy(true);
        const res = await fetch(`/api/arenas/${arenaId}`, { method: 'DELETE' }).catch(
          () => undefined,
        );
        setBusy(false);
        if (res?.ok) router.push('/tournaments');
      },
    }),
    [arenaId, router],
  );

  if (!state) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <div className={cn('px-4 py-10 text-center text-[13px] text-stone-500', SURFACE)}>
          Загружаем турнир
        </div>
      </main>
    );
  }

  const isOwner = meId !== null && meId === state.ownerId;
  const joined = state.me !== null;

  // Кнопки участия: пауза и возврат/запись. Живут в левой колонке.
  const joinButtons =
    meId === null ? (
      <Link
        href={`/login?next=/tournaments/${arenaId}`}
        className="btn-primary block px-3.5 py-2 text-center text-[13px]"
      >
        Войти, чтобы играть
      </Link>
    ) : (
      state.status !== 'finished' && (
        <>
          {joined && state.me?.state !== 'paused' && (
            <ToolButton
              icon={Pause}
              size="md"
              block
              active={state.me?.pauseRequested}
              onClick={pause}
            >
              {state.me?.pauseRequested ? 'Пауза после партии' : 'Пауза'}
            </ToolButton>
          )}
          {(!joined || state.me?.state === 'paused') && (
            <ToolButton icon={SignIn} size="md" tone="primary" block onClick={() => join(code)}>
              {joined ? 'Вернуться в игру' : 'Участвовать'}
            </ToolButton>
          )}
        </>
      )
    );

  // ──────────────────────── состояние «до старта» ────────────────────────

  if (state.status === 'scheduled') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-300"
            >
              <ArrowLeft size={12} weight="bold" aria-hidden />
              Все турниры
            </Link>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              {state.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-500 dark:text-stone-400">
              <span>{timeControlLabel(state.timeControl)}</span>
              <span>{formatDuration(state.durationMin)}</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users size={12} weight="bold" aria-hidden />
                {state.standings.length}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock size={12} weight="bold" aria-hidden />
                начало {formatStartAt(state.startsAt)}
              </span>
            </p>
          </div>
        </div>

        <div className={cn('mt-5 px-4 py-8 text-center', SURFACE)}>
          <p className="text-[12.5px] font-medium text-stone-500 dark:text-stone-400">
            Начало {formatStartAt(state.startsAt)}
          </p>
          <Countdown
            to={state.startsAt}
            zeroText="начинаем"
            className="mt-1 block font-display text-5xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50"
          />
          <p className="mx-auto mt-3 max-w-[46ch] text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
            Победа даёт {ARENA_POINTS.win} очка, ничья {ARENA_POINTS.draw}. Две победы
                подряд включают серию: дальше победа приносит {ARENA_POINTS.winOnStreak} очка,
                ничья {ARENA_POINTS.drawOnStreak}. Соперник находится сам, ждать раунда
                не нужно.
              </p>

              {/* Своя позиция: её показываем заранее — записываясь, человек
                  должен видеть, что играть придётся не с начальной расстановки. */}
              {state.startFen && (
                <div className="mx-auto mt-4 flex max-w-[15rem] flex-col items-center gap-2">
                  <div className="w-full overflow-hidden rounded-xl ring-1 ring-stone-900/[0.07] dark:ring-white/[0.08]">
                    <ChessBoard
                      fen={state.startFen}
                      canMove={false}
                      isEditing={false}
                      canEdit={false}
                      compact
                      silent
                    />
                  </div>
                  <p className="text-[12px] leading-relaxed text-stone-600 dark:text-stone-400">
                    Все партии начинаются с этой позиции, первый ход за{' '}
                    {sideToMove(state.startFen) === 'w' ? 'белыми' : 'чёрными'}. Отсчёт
                    20 секунд на первый ход здесь не включается.
                  </p>
                </div>
              )}

          {!joined && meId !== null && (
            <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
              {state.hasAccessCode && (
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Код доступа"
                  aria-label="Код доступа"
                  className="input py-2 text-center text-sm"
                />
              )}
              <ToolButton size="md" tone="primary" block icon={SignIn} onClick={() => join(code)}>
                Участвовать
              </ToolButton>
            </div>
          )}
          {joined && (
            <p className="mt-4 text-[13px] font-semibold text-brand-700 dark:text-brand-300">
              Вы записаны. Первый соперник появится сразу после старта.
            </p>
          )}
        </div>

        {isOwner && (
          <div className={cn('mt-4 flex flex-wrap items-center gap-2 p-3', SURFACE)}>
            <span className="flex-1 text-[12.5px] text-stone-600 dark:text-stone-300">
              Вы создали этот турнир
            </span>
            <ToolButton icon={Play} onClick={ownerActions.start} disabled={busy}>
              Начать сейчас
            </ToolButton>
            <ToolButton icon={Trash} tone="danger" onClick={ownerActions.remove} disabled={busy}>
              Удалить
            </ToolButton>
          </div>
        )}

        <section className="mt-4">
          <h2 className="mb-2 px-0.5 text-[15px] font-semibold text-stone-800 dark:text-stone-100">
            Записались
          </h2>
          <div className={cn('overflow-hidden', SURFACE)}>
            <StandingsTable standings={state.standings} meId={meId} />
          </div>
        </section>
      </main>
    );
  }

  // ─────────────────── состояния «идёт» и «завершён» ───────────────────

  // Левая колонка: всё о турнире и таблица. Освобождает верх страницы,
  // чтобы доска поднялась выше и помещалась в экран.
  const leftColumn = (
    <div className="order-3 flex min-h-0 flex-col gap-3 lg:order-1 lg:sticky lg:top-14 lg:h-[calc(100dvh-4.5rem)]">
      <div className={cn('flex shrink-0 flex-col gap-2 p-3', SURFACE)}>
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-300"
        >
          <ArrowLeft size={12} weight="bold" aria-hidden />
          Все турниры
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            {state.name}
          </h1>
          {state.status === 'running' && <StatusChip tone="brand" live>идёт</StatusChip>}
          {state.status === 'finished' && <StatusChip>завершён</StatusChip>}
        </div>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-stone-500 dark:text-stone-400">
              <span>{timeControlLabel(state.timeControl)}</span>
              <span>{formatDuration(state.durationMin)}</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users size={12} weight="bold" aria-hidden />
                {state.standings.length}
              </span>
              {state.startFen && (
                <span
                  className="inline-flex items-center gap-1"
                  title="Партии начинаются не со стандартной позиции"
                >
                  <PuzzlePiece size={12} weight="bold" aria-hidden />
                  своя позиция
                </span>
              )}
            </p>
        {state.status === 'running' && (
          <p className="inline-flex items-center gap-1 text-[12.5px] font-medium tabular-nums text-stone-600 dark:text-stone-300">
            <Clock size={12} weight="bold" aria-hidden />
            {state.pairingClosed ? (
              'Время вышло, партии доигрываются'
            ) : (
              <>
                до конца <Countdown to={state.endsAt} />
              </>
            )}
          </p>
        )}

        {joinButtons}

        {/* Состояние участника и сообщения — здесь, а не поверх доски. */}
        {state.status === 'running' && !playing && (
          <p className="text-[12px] leading-snug text-stone-500 dark:text-stone-400">
            {!joined
              ? 'Вы смотрите турнир со стороны'
              : state.me?.state === 'paused'
                ? 'Вы на паузе: пары не приходят'
                : state.pairingClosed
                  ? 'Новых пар уже не будет'
                  : 'Ищем соперника'}
          </p>
        )}
        {error && (
          <button
            type="button"
            onClick={dismissError}
            className="rounded-xl bg-red-50 px-2.5 py-2 text-left text-[12.5px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </button>
        )}
        {lastResult && (
          <button
            type="button"
            onClick={dismissResult}
            className="rounded-xl bg-stone-900/[0.05] px-2.5 py-2 text-left text-[12.5px] font-medium text-stone-700 dark:bg-white/[0.07] dark:text-stone-100"
          >
            {lastResult.outcome === 'cancelled'
              ? 'Партия отменена: первый ход не был сделан, в зачёт она не идёт.'
              : 'Партия закончена. Следующий соперник подбирается.'}
          </button>
        )}
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', SURFACE)}>
        <p className="shrink-0 border-b border-stone-900/[0.06] px-2.5 py-2 text-[12px] font-semibold text-stone-500 dark:border-white/[0.06] dark:text-stone-400">
          Таблица
        </p>
        <StandingsTable
          standings={state.standings}
          meId={meId}
          finished={state.status === 'finished'}
        />
      </div>
    </div>
  );

  // Центр: доска. Сама партия или трансляция/разбор выбранной партии.
  const centerColumn = (
    <div className="order-1 min-w-0 lg:order-2">
      {currentGame ? (
        currentGame.status === 'live' ? (
          <ArenaBoard game={currentGame} meId={meId} viewIdx={viewIdx} onMove={arena.move} />
        ) : (
          <GameReview game={currentGame} viewIdx={viewIdx} />
        )
      ) : (
        <div className={cn('px-4 py-10 text-center text-[13px] text-stone-500', SURFACE)}>
          {state.status === 'finished' ? 'Партий в этом турнире не было' : 'Пока никто не играет'}
        </div>
      )}
    </div>
  );

  // Правая колонка: ходы и кнопки партии, ниже партии и чат.
  const rightColumn = (
    <div className="order-2 flex min-h-0 flex-col gap-3 lg:order-3 lg:sticky lg:top-14 lg:h-[calc(100dvh-4.5rem)]">
      {currentGame && (
        <div className={cn('flex shrink-0 flex-col gap-2 p-2', SURFACE)}>
          <MoveNav history={currentGame.moves} viewIdx={viewIdx} onSelect={setViewIdx} />
          {currentGame.status === 'live' && (
            <GameControls
              game={currentGame}
              meId={meId}
              onResign={arena.resign}
              onOfferDraw={arena.offerDraw}
              onAcceptDraw={arena.acceptDraw}
              onDeclineDraw={arena.declineDraw}
            />
          )}
        </div>
      )}

      <div
        className={cn('flex min-h-[18rem] flex-1 flex-col overflow-hidden lg:min-h-0', SURFACE)}
      >
        <div className="shrink-0 p-1.5">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            ariaLabel="Что показать"
            options={[
              { id: 'games', label: 'Партии', icon: Trophy },
              { id: 'chat', label: 'Чат', icon: ChatCircle },
            ]}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-t border-stone-900/[0.06] dark:border-white/[0.06]">
          {tab === 'games' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.status === 'finished' ? (
                <GamesList
                  games={finishedGames}
                  activeId={watchedGame?.id ?? null}
                  onOpen={watch}
                  emptyHint="Партий не было"
                />
              ) : (
                <>
                  <LiveBoards
                    games={live}
                    activeId={watchedGame?.id ?? null}
                    onOpen={watch}
                    emptyHint="Сейчас никто не играет. Первые пары появятся сразу после старта."
                  />
                  {finishedGames.length > 0 && (
                    <div className="border-t border-stone-900/[0.06] dark:border-white/[0.06]">
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                        Сыгранные
                      </p>
                      <GamesList
                        games={finishedGames}
                        activeId={watchedGame?.id ?? null}
                        onOpen={watch}
                        emptyHint=""
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {tab === 'chat' && (
            <ArenaChat messages={chat} meId={meId} onSend={arena.sendChat} canWrite={meId !== null} />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6">
      {state.status === 'finished' && state.standings.length > 0 && (
        <div className={cn('mb-4 px-4 py-4', SURFACE)}>
          <Podium standings={state.standings} />
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_17rem]">
        {leftColumn}
        {centerColumn}
        {rightColumn}
      </div>
    </main>
  );
}
