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
  GameOver: 'chess:over',
  ModeSet: 'chess:mode',          // учитель меняет режим комнаты
  ArrowsUpdate: 'chess:arrows',   // стрелки и выделения клеток (broadcast)

  // Чат
  ChatSend: 'chat:send',
  ChatNew: 'chat:new',
  ChatHistory: 'chat:history',

  // Аудио / WebRTC сигналинг
  AudioReady: 'audio:ready',          // клиент готов принимать пиров (нажал «Подключиться»)
  AudioLeave: 'audio:leave',          // клиент вышел из аудио-сессии (но остался в комнате)
  AudioOffer: 'audio:offer',
  AudioAnswer: 'audio:answer',
  AudioIce: 'audio:ice',
  AudioMicState: 'audio:mic-state',   // клиент сообщает о своём mute
  AudioForceMute: 'audio:force-mute', // учитель требует замьютить
  AudioForceMuteAll: 'audio:force-mute-all',

  // Подбор соперника (быстрая игра)
  MatchSearch: 'match:search',
  MatchCancel: 'match:cancel',
  MatchFound: 'match:found',
  MatchSearching: 'match:searching',

  // Турниры (live-обновления)
  TournamentLive: 'tournament:live',   // подписка на конкретный турнир
  TournamentState: 'tournament:state', // апдейты с матчами/таблицей
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

export interface RoomStatePayload {
  code: string;
  name: string;
  isPublic: boolean;
  ownerId: string;
  fen: string;
  isEditing: boolean;
  editorId: string | null;
  participants: Participant[];
  kind: string;
  timeControl: string | null;
  mode: RoomMode;
  history: MoveHistoryEntry[];
  arrows: BoardArrow[];
  marks: BoardMark[];
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
