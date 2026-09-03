// Единый словарь событий между клиентом и сервером.
// Используется и в браузере (client) и в Node-сервере.

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const SocketEvents = {
  // Подключение к комнате
  RoomJoin: 'room:join',
  RoomState: 'room:state',
  RoomLeave: 'room:leave',
  RoomError: 'room:error',
  ParticipantsUpdate: 'room:participants',

  // Шахматы
  MoveMake: 'chess:move',
  EditStart: 'chess:edit-start',
  EditUpdate: 'chess:edit-update',
  EditEnd: 'chess:edit-end',
  PositionReset: 'chess:reset',
  /** Возврат к началу текущего сегмента (позиция, которую учитель выставил в редакторе). */
  PositionResetToInitial: 'chess:reset-initial',
  GameOver: 'chess:over',
  ModeSet: 'chess:mode',          // учитель меняет режим комнаты
  MoveUndo: 'chess:undo',       // отменить последний ход ( lesson )
  ArrowsUpdate: 'chess:arrows',   // стрелки и выделения клеток (broadcast)
  /** Учитель переключил движок на доске ученика (student-board): включён/выключен.
   *  Сервер хранит флаг runtime.engineEnabled и броадкастит новое RoomState. */
  EngineToggle: 'chess:engine-toggle',
  /** Учитель листает историю ходов — броадкастим всем, чтобы у учеников
   *  показывалась та же позиция, что и у учителя. */
  HistoryView: 'chess:history-view',
  /** Как HistoryView, но для дерева ходов: учитель показывает конкретный узел
   *  (ветку), ученики следуют за ним. payload: nodeId (string | null). */
  HistoryViewNode: 'chess:history-view-node',
  /** Учитель загружает одну из сохранённых прошлых партий обратно на доску.
   *  payload: index (номер в списке pastGames). */
  LoadPastGame: 'chess:load-past-game',
  /** Учитель: запретить/разрешить ученикам делать ходы на этой доске
   *  (например, на трансляции). payload { locked: boolean }. */
  MovesLock: 'chess:moves-lock',
  /** Учитель: разрешить ходить только одному ученику (по userId) при
   *  включённой блокировке. payload { userId: string | null }. */
  MoveAllow: 'chess:move-allow',

  // Чат
  ChatSend: 'chat:send',
  ChatNew: 'chat:new',
  ChatHistory: 'chat:history',
  /** Учитель: очистить чат комнаты (удаляет историю сообщений). */
  ChatClear: 'chat:clear',

  // Аудио / WebRTC сигналинг
  AudioReady: 'audio:ready',          // клиент готов принимать пиров (нажал «Подключиться»)
  AudioLeave: 'audio:leave',          // клиент вышел из аудио-сессии (но остался в комнате)
  AudioOffer: 'audio:offer',
  AudioAnswer: 'audio:answer',
  AudioIce: 'audio:ice',
  AudioMicState: 'audio:mic-state',   // клиент сообщает о своём mute
  AudioForceMute: 'audio:force-mute', // учитель требует замьютить
  /** Учитель мьютит/размьючивает всех учеников разом. payload { mute: boolean }. */
  AudioForceMuteAll: 'audio:force-mute-all',

  // Подбор соперника (быстрая игра)
  MatchSearch: 'match:search',
  MatchCancel: 'match:cancel',
  MatchFound: 'match:found',
  MatchSearching: 'match:searching',

  // Партия — соревновательные действия (turniry / casual)
  Resign: 'chess:resign',
  DrawOffer: 'chess:draw-offer',
  DrawAccept: 'chess:draw-accept',
  DrawDecline: 'chess:draw-decline',

  // ─────────────────────────── Арена (турниры) ───────────────────────────
  // Живут в отдельном пространстве имён сокета '/arena': туда пускают и
  // незалогиненных зрителей, а в основное пространство — только вошедших.

  /** Подписаться на арену. Сразу приходит ArenaState. */
  ArenaWatch: 'arena:watch',
  /** Снэпшот арены: таблица, идущие партии, моё состояние. */
  ArenaState: 'arena:state',
  /** Записаться / вернуться в пул. payload { accessCode?: string }. */
  ArenaJoin: 'arena:join',
  /** Остаться в арене, но пар не получать. */
  ArenaPause: 'arena:pause',

  /** Смотреть конкретную партию (своя приходит автоматически). */
  ArenaGameWatch: 'arena:game-watch',
  /** Полное состояние партии: позиция, ходы, часы. */
  ArenaGameState: 'arena:game-state',
  /** Партия окончена — для тоста с результатом. */
  ArenaGameOver: 'arena:game-over',

  ArenaMove: 'arena:move',
  ArenaResign: 'arena:resign',
  ArenaDrawOffer: 'arena:draw-offer',
  ArenaDrawAccept: 'arena:draw-accept',
  ArenaDrawDecline: 'arena:draw-decline',

  ArenaChatSend: 'arena:chat-send',
  ArenaChatNew: 'arena:chat-new',
  ArenaChatHistory: 'arena:chat-history',

  /** Текст ошибки для показа пользователю. */
  ArenaError: 'arena:error',

  // Класс учителя (live-обновления для дашборда учителя и страницы ученика)
  /** Подписка на состояние класса (учитель / ученик). Сразу шлём текущий ClassState. */
  ClassSubscribe: 'class:subscribe',
  /** Отписка — клиент уходит со страницы класса. */
  ClassUnsubscribe: 'class:unsubscribe',
  /** Снэпшот класса: lesson active?, distributed task, demo room code, sessions live grid. */
  ClassState: 'class:state',
  /** Учитель: начать живой урок (создаёт lobby room). */
  ClassLessonStart: 'class:lesson-start',
  /** Учитель: завершить живой урок. */
  ClassLessonStop: 'class:lesson-stop',
  /** Учитель: раздать задачу всем присутствующим (создаёт student-board комнаты). */
  ClassDistribute: 'class:distribute',
  /** Учитель: включить демонстрацию классу (поднимает class-demo комнату). */
  ClassDemoStart: 'class:demo-start',
  /** Учитель: закрыть демонстрацию (всех возвращает к личным доскам). */
  ClassDemoStop: 'class:demo-stop',
  /** Учитель: открыть «Мою доску» — личный демо-room без трансляции ученикам. */
  ClassMyBoardOpen: 'class:my-board-open',
  /** Учитель: переключить флаг трансляции (видна ли ученикам). */
  ClassBroadcastToggle: 'class:broadcast-toggle',
  /** Учитель: запереть/отпереть вход на урок для новых учеников. */
  ClassDoorToggle: 'class:door-toggle',
  /** Авто-уведомление: ученик решил задачу. */
  TaskSessionSolved: 'task:solved',
} as const;

export type ParticipantRole = 'teacher' | 'student';

export interface Participant {
  socketId: string;
  userId: string;
  name: string;
  role: ParticipantRole;
  micEnabled: boolean;
  forcedMute: boolean;
}

export interface RoomMode {
  /** Разрешить нелегальные ходы (для разбора позиции / показа учителем). */
  allowIllegal: boolean;
  /** Фиксирует сторону хода. После каждого хода сервер «возвращает» очередь
   *  указанной стороне — удобно тренировать одну сторону. */
  sideLock: 'w' | 'b' | null;
  /** Учитель разрешает ученикам тоже редактировать (когда редактор открыт). */
  studentsCanEdit: boolean;
}

export const DEFAULT_ROOM_MODE: RoomMode = {
  allowIllegal: false,
  sideLock: null,
  studentsCanEdit: false,
};

export interface MoveHistoryEntry {
  /** Стандартная нотация хода (SAN) либо синтетический маркер для нелегальных. */
  san: string;
  from: string;
  to: string;
  /** FEN после применения хода. */
  fen: string;
  promotion?: string;
  /** Был ли ход легальным по правилам. */
  legal: boolean;
}

/**
 * Узел дерева ходов (варианты как в Lichess). В учебных комнатах вместо плоской
 * истории хранится дерево: если пойти по-другому из прошлой позиции — рождается
 * новая ветка (sibling), а прежняя линия сохраняется.
 */
export interface MoveTreeNode {
  /** Уникальный id узла. */
  id: string;
  /** Родитель (id) или null, если ход сделан из стартовой позиции отрезка. */
  parentId: string | null;
  san: string;
  from: string;
  to: string;
  /** FEN после хода. */
  fen: string;
  promotion?: string;
  legal: boolean;
}

/** Одна завершённая партия ученика (снимок для разбора учителем после «начать заново»). */
export interface PastGameDto {
  /** FEN, с которого партия начиналась. */
  startFen: string;
  /** Ходы главной линии этой партии. */
  moves: MoveHistoryEntry[];
  /** Когда партия была завершена/сброшена (ms epoch). */
  endedAt: number;
}

export type ArrowColor = 'green' | 'red' | 'blue' | 'yellow';

export interface BoardArrow {
  from: string;
  to: string;
  color: ArrowColor;
}

export interface BoardMark {
  square: string;
  color: ArrowColor;
}

export interface BoardAnnotations {
  arrows: BoardArrow[];
  marks: BoardMark[];
}

/** Серверное состояние шахматных часов партии. */
export interface ClockState {
  /** База в миллисекундах для каждой стороны. */
  initialMs: number;
  /** Прибавка за каждый ход в миллисекундах. */
  incrementMs: number;
  /** Остаток на часах белых (в момент последнего серверного snap-shot'а). */
  whiteMs: number;
  /** Остаток на часах чёрных. */
  blackMs: number;
  /** Чьи часы сейчас тикают: 'w' / 'b' / null (партия не начата или закончена). */
  running: 'w' | 'b' | null;
  /** Timestamp (ms epoch) последнего обновления часов на сервере.
   *  Клиент использует его для локального тика между серверными апдейтами. */
  lastTickAt: number;
}

/** Активное предложение ничьей в партии. */
export interface DrawOfferState {
  /** Кто предложил. */
  fromUserId: string;
  /** Когда истекает право принять (ms epoch). */
  expiresAt: number;
}

/** Результат партии — для отображения «партия окончена». */
export interface GameResultState {
  /** 'white' / 'black' = выигрыш цвета; 'draw' = ничья. */
  outcome: 'white' | 'black' | 'draw';
  /** Кодовая причина: для тоста/описания. */
  reason:
    | 'checkmate'
    | 'stalemate'
    | 'resignation'
    | 'timeout'
    | 'draw-agreement'
    | 'insufficient-material'
    | 'threefold'
    | 'fifty-move'
    /** Арена: первый ход не сделан за 20 секунд — партия отменена, в зачёт не идёт. */
    | 'no-first-move'
    | 'other';
}

export interface RoomStatePayload {
  code: string;
  name: string;
  isPublic: boolean;
  ownerId: string;
  fen: string;
  /** FEN начала текущего отрезка (после сброса/выхода из редактора); для навигации «к началу». */
  segmentStartFen: string;
  isEditing: boolean;
  editorId: string | null;
  participants: Participant[];
  kind: string;
  timeControl: string | null;
  mode: RoomMode;
  history: MoveHistoryEntry[];
  /** Полное дерево ходов (учебные комнаты; поддержка веток-вариантов).
   *  Для игровых партий (турнир/casual) пустой массив — там веток нет. */
  moveTree: MoveTreeNode[];
  /** id «живого» узла (кончик активной линии). null = стартовая позиция отрезка. */
  currentNodeId: string | null;
  /** Прошлые партии ученика на этой доске (снимки после «начать заново») — для разбора учителем. */
  pastGames: PastGameDto[];
  arrows: BoardArrow[];
  marks: BoardMark[];
  /** «Свежий» отрезок: следующий ход — первый, и его можно сделать любой стороной
   *  (если sideLock === null). Сбрасывается после первого хода; снова становится
   *  true после reset / resetToInitial / editEnd / undo. */
  freshSegment: boolean;
  /** Текущий индекс просматриваемого хода у учителя.
   *  null = «следить за текущей позицией» (последний ход или старт). */
  historyViewIdx: number | null;
  /** Узел дерева, который показывает учитель (для синхронизации веток с учениками).
   *  null = следить за текущей позицией. */
  historyViewNodeId: string | null;
  /** Часы для турнирных / казуальных партий. null для уроков. */
  clock: ClockState | null;
  /** Активное предложение ничьей (null если нет). */
  drawOffer: DrawOfferState | null;
  /** Кто играет белыми / чёрными (для турнирных и казуальных партий). */
  whiteId: string | null;
  blackId: string | null;
  /** Итог партии (если она окончена). */
  result: GameResultState | null;
  /** Включён ли движок-соперник на доске ученика (student-board).
   *  По умолчанию true. Учитель может выключить кнопкой, когда зашёл за доску
   *  ученика — состояние сохраняется и после ухода учителя. */
  engineEnabled: boolean;
  /** Сила движка-соперника (Stockfish Skill Level 0..20) для этой доски.
   *  Для student-board берётся из задачи (Task.engineLevel), которую раздал учитель.
   *  20 = полная сила без поддавков. Для прочих комнат — дефолт. */
  engineLevel: number;
  /** Цвет ученика (человека) на доске задачи; движок играет противоположным.
   *  Для student-board берётся из задачи (Task.sideToPlay). Нужен, чтобы и
   *  ученику, и зашедшему учителю запретить ходить за цвет движка. null иначе. */
  humanColor: 'w' | 'b' | null;
  /** Учитель запретил ученикам делать ходы на этой доске (например, на трансляции).
   *  При true ходить может только владелец комнаты и явно разрешённый ученик. */
  studentMovesLocked: boolean;
  /** Единственный ученик (userId), которому разрешено ходить при включённой
   *  блокировке studentMovesLocked. null = никому, кроме учителя. */
  allowedMoverUserId: string | null;
}

export interface ChatMessageDto {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface MatchFoundPayload {
  code: string;
  timeControl: string;
  opponentName: string;
}

// ═══════════════════════════════ АРЕНА ═══════════════════════════════════
//
// Единственный формат турнира: отведённое время, непрерывный подбор пар,
// очки с бонусом за серию побед. Партии арены не используют модель Room —
// у них своя модель ArenaGame со своим списком ходов и часами.

/** Результат одной партии глазами игрока — цветной квадратик в таблице. */
export type ArenaResult = 'win' | 'draw' | 'loss';

/** Состояние участника: в пуле, играет или на паузе. */
export type ArenaPlayerState = 'ready' | 'playing' | 'paused';

/** Строка таблицы результатов. */
export interface ArenaStandingDto {
  userId: string;
  name: string;
  rank: number;
  score: number;
  wins: number;
  played: number;
  /** Побед подряд. 2 и больше — «огонёк»: победа даёт 4 очка, ничья 2. */
  streak: number;
  state: ArenaPlayerState;
  /** Последние результаты, самый свежий первым. */
  recent: ArenaResult[];
}

/** Партия в списке: для трансляции и для разбора после арены. */
export interface ArenaGameSummaryDto {
  id: string;
  whiteId: string;
  whiteName: string;
  blackId: string;
  blackName: string;
  /** 'live' | 'white' | 'black' | 'draw' | 'cancelled'. */
  status: string;
  fen: string;
  movesCount: number;
}

/** Снэпшот арены. Приходит на ArenaWatch и при каждом изменении. */
export interface ArenaStatePayload {
  id: string;
  name: string;
  timeControl: string;
  durationMin: number;
  /** 'scheduled' | 'running' | 'finished'. */
  status: string;
  /** ISO-время старта. */
  startsAt: string;
  /** ISO-время, когда закрывается подбор пар. */
  endsAt: string;
  /** Время вышло: новых пар нет, но начатые партии доигрываются. */
  pairingClosed: boolean;
  ownerId: string;
  /** Для записи нужен код доступа. Сам код клиенту не отправляется. */
  hasAccessCode: boolean;
  /** Своя начальная позиция всех партий. null — обычная начальная. */
  startFen: string | null;
  standings: ArenaStandingDto[];
  /** Идущие сейчас партии. */
  liveGames: ArenaGameSummaryDto[];
  /** Сыгранные партии — заполняется, когда арена окончена. */
  finishedGames: ArenaGameSummaryDto[];
  /** Моё участие. null — не записан или смотрю без входа на сайт. */
  me: {
    state: ArenaPlayerState;
    score: number;
    streak: number;
    /** id моей текущей партии, если играю. */
    gameId: string | null;
    /**
     * Нажата «Пауза» во время партии: текущую доигрываем, следующей пары
     * не будет. Без этого признака кнопка выглядела бы сломанной — состояние
     * остаётся «играет», и человек не понимает, услышали ли его.
     */
    pauseRequested: boolean;
  } | null;
}

/** Полное состояние одной партии арены. */
export interface ArenaGamePayload {
  id: string;
  arenaId: string;
  whiteId: string;
  whiteName: string;
  blackId: string;
  blackName: string;
  /** Серия соперника на момент начала партии — «огонёк» рядом с именем. */
  whiteStreak: number;
  blackStreak: number;
  /** 'live' | 'white' | 'black' | 'draw' | 'cancelled'. */
  status: string;
  /** Причина окончания, если партия закончена. */
  result: GameResultState | null;
  fen: string;
  /** С какой позиции начали. Нужна перемотке: «до первого хода» у турнира
   *  со своей позицией — не стандартная расстановка. */
  startFen: string;
  /** Полная история ходов — по ней работает перемотка. */
  moves: MoveHistoryEntry[];
  clock: ClockState;
  drawOffer: DrawOfferState | null;
  /**
   * Дедлайн на первый ход (ms epoch). Не сделан — партия отменяется.
   * null у турниров со своей позицией: она незнакомая, и на первый ход
   * нужно время наравне с остальными.
   */
  firstMoveDeadlineAt: number | null;
}

/** Контроли времени арены. Длительность арены с контролем не связана:
 *  любой контроль можно поставить на любую длительность. */
export const ARENA_TIME_CONTROLS = [
  { id: 'bullet-1+0', label: 'Пуля · 1+0' },
  { id: 'blitz-3+0', label: 'Блиц · 3+0' },
  { id: 'blitz-3+2', label: 'Блиц · 3+2' },
  { id: 'blitz-5+0', label: 'Блиц · 5+0' },
  { id: 'rapid-10+0', label: 'Рапид · 10+0' },
  { id: 'rapid-10+5', label: 'Рапид · 10+5' },
] as const;

export type ArenaTimeControlId = (typeof ARENA_TIME_CONTROLS)[number]['id'];

/** Сколько минут арена принимает новые пары. */
export const ARENA_DURATIONS = [20, 30, 45, 60, 90, 120] as const;

/** Сколько даётся на первый ход. Не сходил — партия отменяется и в зачёт
 *  не идёт, а отсутствующий игрок ставится на паузу. Правило работает только
 *  в турнирах с обычной начальной позицией: своя позиция требует времени
 *  на то, чтобы просто в ней разобраться. */
export const ARENA_FIRST_MOVE_MS = 20_000;

/** Сколько секунд действует предложение ничьей. */
export const ARENA_DRAW_OFFER_MS = 15_000;

/** Очки: победа 2, ничья 1. На серии (2+ побед подряд) — вдвое. */
export const ARENA_POINTS = {
  win: 2,
  draw: 1,
  winOnStreak: 4,
  drawOnStreak: 2,
  /** С какой длины серии включается «огонёк». */
  streakFrom: 2,
} as const;

/** Активная сессия ученика в задаче — для live grid учителя. */
export interface ClassActiveSessionDto {
  /** sessionId в БД. */
  sessionId: string;
  taskId: string;
  taskTitle: string;
  /** Код комнаты ученика — учитель открывает её, чтобы войти за доску. */
  roomCode: string;
  userId: string;
  userName: string;
  /** Текущая позиция (для мини-доски). */
  fen: string;
  movesPlayed: number;
  status: string; // 'active' | 'solved' | 'abandoned'
  /** Сейчас за доской (есть в участниках сокет-комнаты). */
  online: boolean;
  /** ms epoch последней активности. */
  updatedAt: number;
}

/** Состояние одного класса (live-урок + сессии). */
export interface ClassStatePayload {
  classId: string;
  slug: string;
  /** Идёт ли сейчас живой урок. */
  lessonActive: boolean;
  /** ID задачи, которая раздана классу (или null). */
  currentTaskId: string | null;
  /** Код комнаты-демонстратора (если открыта «Моя доска» или идёт трансляция). */
  demoRoomCode: string | null;
  /** Транслируется ли demoRoomCode ученикам прямо сейчас.
   *  false = только учитель видит свою доску («Моя доска»);
   *  true  = ученики тоже видят её вместо своих задач. */
  demoBroadcast: boolean;
  /** Код комнаты-lobby (для общего аудио/чата). Создаётся со стартом урока. */
  lobbyRoomCode: string | null;
  /** Все участники lobby (учитель + ученики, кто подключён). */
  lobbyParticipants: Array<{ userId: string; name: string; role: 'teacher' | 'student' }>;
  /** Активные сессии учеников в этом классе. */
  sessions: ClassActiveSessionDto[];
  /** Учитель запер вход: новые ученики на урок не попадут. */
  joinsClosed: boolean;
  /**
   * Кого пускать на урок при запертой двери. Список фиксируется в момент
   * запирания и живёт до конца урока, поэтому обновление страницы, потеря
   * связи или случайный выход не выставляют ученика за дверь.
   *
   * Клиенту нужен, чтобы заранее показать ученику, войдёт он или нет:
   * `ClassState` рассылается всему классу одним снэпшотом, персонального
   * флага в нём быть не может.
   */
  admittedIds: string[];
}

/** Каноничные тайм-контроли. */
export const TIME_CONTROLS = [
  { id: 'bullet-1+0', label: 'Пуля · 1+0', kind: 'bullet' },
  { id: 'blitz-3+0', label: 'Блиц · 3+0', kind: 'blitz' },
  { id: 'blitz-3+2', label: 'Блиц · 3+2', kind: 'blitz' },
  { id: 'blitz-5+0', label: 'Блиц · 5+0', kind: 'blitz' },
  { id: 'rapid-10+0', label: 'Рапид · 10+0', kind: 'rapid' },
  { id: 'rapid-15+10', label: 'Рапид · 15+10', kind: 'rapid' },
  { id: 'classical-30+0', label: 'Классика · 30+0', kind: 'classical' },
] as const;

export type TimeControlId = (typeof TIME_CONTROLS)[number]['id'];

export function timeControlLabel(id: string | null | undefined): string {
  if (!id) return 'Без таймера';
  const known =
    TIME_CONTROLS.find((t) => t.id === id)?.label ??
    ARENA_TIME_CONTROLS.find((t) => t.id === id)?.label;
  return known ?? id;
}

/** Парсер строки timeControl вида 'blitz-5+0' / 'rapid-15+10' в миллисекунды.
 *  Возвращает null, если контроль не задан или строка нераспознана. */
export function parseTimeControl(
  id: string | null | undefined,
): { initialMs: number; incrementMs: number } | null {
  if (!id) return null;
  const m = id.match(/^[a-z]+-(\d+)\+(\d+)$/);
  if (!m) return null;
  const minutes = Number(m[1]);
  const incSec = Number(m[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(incSec)) return null;
  return { initialMs: minutes * 60_000, incrementMs: incSec * 1000 };
}
