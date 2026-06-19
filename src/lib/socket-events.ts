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

  // Турниры (live-обновления)
  TournamentLive: 'tournament:live',   // подписка на конкретный турнир
  TournamentState: 'tournament:state', // апдейты с матчами/таблицей
  /** Общий чат участников турнира (in-memory, живёт пока идёт турнир). */
  TournamentChatSend: 'tournament:chat-send',
  TournamentChatNew: 'tournament:chat-new',
  TournamentChatHistory: 'tournament:chat-history',

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
    | 'tournament-end'
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
  arrows: BoardArrow[];
  marks: BoardMark[];
  /** «Свежий» отрезок: следующий ход — первый, и его можно сделать любой стороной
   *  (если sideLock === null). Сбрасывается после первого хода; снова становится
   *  true после reset / resetToInitial / editEnd / undo. */
  freshSegment: boolean;
  /** Текущий индекс просматриваемого хода у учителя.
   *  null = «следить за текущей позицией» (последний ход или старт). */
  historyViewIdx: number | null;
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
  /** Учитель запретил ученикам делать ходы на этой доске (например, на трансляции).
   *  При true ходить может только владелец комнаты и явно разрешённый ученик. */
  studentMovesLocked: boolean;
  /** Единственный ученик (userId), которому разрешено ходить при включённой
   *  блокировке studentMovesLocked. null = никому, кроме учителя. */
  allowedMoverUserId: string | null;
  /** Турнир: дедлайн (ms epoch) на один из первых двух полуходов. Кто не сходит
   *  до него — проигрывает. null = правило не действует. Для отрисовки таймера. */
  firstMoveDeadlineAt: number | null;
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

export interface TournamentMatchDto {
  id: string;
  roomCode: string | null;
  whiteId: string;
  whiteName: string;
  blackId: string;
  blackName: string;
  status: string;
  fen?: string;
}

export interface TournamentStandingDto {
  userId: string;
  name: string;
  score: number;
  played: number;
  rank: number;
  isAvailable: boolean;
}

export interface TournamentLivePayload {
  id: string;
  status: string;
  endsAt: string | null;
  matches: TournamentMatchDto[];
  standings: TournamentStandingDto[];
}

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
  return TIME_CONTROLS.find((t) => t.id === id)?.label ?? id;
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
