'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { SocketEvents } from '@/lib/socket-events';

// Маяк версии хука — если эту строку видно в Console при загрузке комнаты,
// значит, JS свежий. Если не видно — кеш/SW отдают старый бандл.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[audio] hook module loaded build=2026-06-09T13:30 (noise gate + Opus 24k/mono/DTX/FEC + replaceTrack mute)');
}

// Fallback-список ICE-серверов на случай, если сервер не отвечает на
// 'audio:get-ice-servers'. Основной путь — динамические creds от своего coturn,
// см. requestIceServers() ниже.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = (() => {
  const env = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (env) {
    try {
      return JSON.parse(env) as RTCIceServer[];
    } catch {
      // fallthrough
    }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
})();

/**
 * Спрашиваем у нашего сервера список ICE-серверов с краткоживущими creds.
 * Сервер сгенерирует HMAC от TURN_SECRET и вернёт username/credential на 1 час.
 * Таймаут — 2 сек: если сервер не ответил (старая версия / нет TURN), используем fallback.
 */
function requestIceServers(socket: Socket): Promise<RTCIceServer[]> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      console.warn('[audio] ICE-servers request timed out → fallback');
      resolve(FALLBACK_ICE_SERVERS);
    }, 2000);
    try {
      socket.emit('audio:get-ice-servers', (servers: RTCIceServer[] | undefined) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (Array.isArray(servers) && servers.length > 0) {
          console.log('[audio] received ICE servers:', servers.map((s) => s.urls));
          resolve(servers);
        } else {
          resolve(FALLBACK_ICE_SERVERS);
        }
      });
    } catch {
      done = true;
      clearTimeout(t);
      resolve(FALLBACK_ICE_SERVERS);
    }
  });
}

// Параметры Opus, которые мы навязываем в SDP. fmtp в ОТПРАВЛЯЕМОМ нами SDP
// описывает, как мы хотим ПРИНИМАТЬ; раз все клиенты на одном коде — каждый
// будет слать другим DTX + капнутый битрейт + моно + FEC.
//   • maxaveragebitrate=24000 — голосу хватает 24 кбит/с (вместо ~32–40).
//   • usedtx=1 — в тишине почти не шлём пакеты.
//   • useinbandfec=1 — восстановление потерь без роста задержки.
//   • stereo=0 — моно.
const OPUS_FMTP_PARAMS: Record<string, string> = {
  minptime: '10',
  useinbandfec: '1',
  usedtx: '1',
  stereo: '0',
  'sprop-stereo': '0',
  maxaveragebitrate: '24000',
};

/** Дописывает/мёржит нужные Opus-параметры в fmtp-строку SDP. */
function preferOpusTuning(sdp?: string): string {
  if (!sdp) return sdp ?? '';
  const rtpmap = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const existing = sdp.match(fmtpRe);
  const params: Record<string, string> = {};
  if (existing) {
    existing[1].split(';').forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k && v !== undefined) params[k.trim()] = v.trim();
    });
  }
  Object.assign(params, OPUS_FMTP_PARAMS);
  const merged = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
  if (existing) {
    return sdp.replace(fmtpRe, `a=fmtp:${pt} ${merged}`);
  }
  // fmtp-строки не было — добавляем сразу после rtpmap.
  return sdp.replace(rtpmap[0], `${rtpmap[0]}\r\na=fmtp:${pt} ${merged}`);
}

/** Жёсткий потолок исходящего битрейта на самом отправителе (подстраховка к SDP). */
function capSenderBitrate(sender: RTCRtpSender, maxBitrate = 24000): void {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = maxBitrate;
    sender.setParameters(params).catch(() => undefined);
  } catch {
    // Часть браузеров не даёт setParameters до согласования — не критично,
    // исходящий битрейт всё равно ограничит maxaveragebitrate в SDP пира.
  }
}

// Ключи в localStorage для запоминания выбранных устройств.
const INPUT_DEVICE_KEY = 'gogachess-audio-input';
const OUTPUT_DEVICE_KEY = 'gogachess-audio-output';

/** Базовые фильтры захвата микрофона + опционально конкретное устройство.
 *  Усиленные фильтры: echo/noise/AGC + Chrome-специфичные goog-* (включая
 *  детектор стука по клавиатуре). channelCount:1 — моно (голосу хватает). */
function buildAudioConstraints(deviceId?: string | null): MediaTrackConstraints {
  const base = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googNoiseSuppression2: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    googAutoGainControl: true,
  } as Record<string, unknown>;
  if (deviceId) base.deviceId = { exact: deviceId };
  return base as unknown as MediaTrackConstraints;
}

/** Поддерживает ли браузер выбор устройства вывода звука (setSinkId). */
const OUTPUT_SELECTION_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof HTMLMediaElement !== 'undefined' &&
  'setSinkId' in HTMLMediaElement.prototype;

export interface UseAudioRoomResult {
  joined: boolean;
  micEnabled: boolean;
  forcedMute: boolean;
  /** Громкость каждого пира (peerSocketId -> 0..1) */
  levels: Record<string, number>;
  join: () => Promise<void>;
  leave: () => void;
  setMic: (on: boolean) => void;
  forceMute: (targetSocketId: string, mute: boolean) => void;
  forceMuteAll: (mute: boolean) => void;
  // --- Выбор устройств (микрофон / динамик-наушники) ---
  /** Доступные микрофоны. Метки появляются после выдачи доступа. */
  inputDevices: MediaDeviceInfo[];
  /** Доступные устройства вывода (динамики/наушники). */
  outputDevices: MediaDeviceInfo[];
  currentInputId: string | null;
  currentOutputId: string | null;
  /** Поддерживается ли выбор устройства вывода в этом браузере. */
  outputSupported: boolean;
  /** Обновить список устройств. requestPermission=true — спросить доступ ради меток. */
  refreshDevices: (requestPermission?: boolean) => Promise<void>;
  /** Переключить микрофон (живо, если уже подключены). */
  setInputDevice: (deviceId: string) => Promise<void>;
  /** Переключить устройство вывода звука. */
  setOutputDevice: (deviceId: string) => Promise<void>;
}

function micErrorMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return (
      'Доступ к микрофону запрещён.\n\n' +
      '• Разрешите доступ в запросе браузера или в настройках сайта (значок замка в адресной строке).\n' +
      '• Страница должна открываться по https:// или http://localhost (не по IP в HTTP).\n' +
      '• Проверьте, что микрофон не занят другим приложением.'
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Микрофон не найден. Подключите устройство и выберите его в настройках системы.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Микрофон занят другой программой или недоступен. Закройте Zoom/Discord и попробуйте снова.';
  }
  if (name === 'SecurityError' || name === 'OverconstrainedError') {
    return 'Браузер заблокировал доступ к микрофону в этом контексте. Используйте https:// или localhost.';
  }
  return 'Не удалось включить микрофон. Обновите страницу и разрешите доступ, если браузер спросит.';
}

export function useAudioRoom(socket: Socket | null): UseAudioRoomResult {
  const [joined, setJoined] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [forcedMute, setForcedMute] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});

  // --- Устройства ввода/вывода ---
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentInputId, setCurrentInputId] = useState<string | null>(null);
  const [currentOutputId, setCurrentOutputId] = useState<string | null>(null);
  // Refs — чтобы читать актуальный выбор внутри замыканий (join/ontrack).
  const selectedInputRef = useRef<string | null>(null);
  const selectedOutputRef = useRef<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const rafRef = useRef<number | null>(null);
  // ICE-сервера обновляются перед каждым join() — credentials живут 1 час,
  // так что для долгого пребывания в комнате стоит периодически их обновлять.
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

  // --- Подавление помех (noise gate) ---
  // Сырой поток с микрофона (до обработки). Нужен, чтобы корректно остановить
  // устройство при выходе. В пиры уходит уже ОБРАБОТАННЫЙ поток (через gain-гейт).
  const rawStreamRef = useRef<MediaStream | null>(null);
  // GainNode-«ворота»: 1 = пропускаем голос, 0 = глушим фон/паузы.
  const micGainRef = useRef<GainNode | null>(null);
  // Анализатор уровня СВОЕГО микрофона — для детекции голоса (VAD).
  const localVadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  // Актуальное состояние «микрофон включён» для чтения внутри createPeer
  // (там стейт был бы устаревшим из-за замыкания useCallback).
  const micEnabledRef = useRef(false);

  // ---------- Установка соединения с пиром ----------
  const createPeer = useCallback(
    (peerId: string, initiator: boolean): RTCPeerConnection => {
      console.log('[audio] createPeer', { peerId, initiator, hasLocalStream: !!localStreamRef.current });
      // Если для этого peerId уже был pc — закрываем, иначе будут «двойные» транссиверы и тишина.
      const existing = peersRef.current.get(peerId);
      if (existing) {
        try {
          existing.close();
        } catch {
          // ignore
        }
        peersRef.current.delete(peerId);
      }

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log('[audio] addTrack count=', tracks.length, 'kinds=', tracks.map((t) => t.kind));
        tracks.forEach((t) => {
          const sender = pc.addTrack(t, localStreamRef.current!);
          if (t.kind === 'audio') {
            capSenderBitrate(sender);
            // Если сейчас в муте — НЕ отправляем дорожку вообще (replaceTrack(null)),
            // а не просто enabled=false. В эфир не уходит ни одного RTP-пакета.
            if (!micEnabledRef.current) sender.replaceTrack(null).catch(() => undefined);
          }
        });
      } else {
        // Микрофон ещё не получен — это значит, что мы получили offer ДО join().
        // Принимать звук всё равно можем: добавляем recvonly-транссивер.
        console.log('[audio] no localStream → addTransceiver recvonly');
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch {
          // ignore
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate && socket) {
          // Логируем тип кандидата: host (локальный), srflx (через STUN), relay (через TURN).
          // Если ни одного "relay" в логах — TURN недоступен/не отвечает.
          const c = e.candidate;
          const m = c.candidate.match(/typ (\w+)/);
          const typ = m ? m[1] : '?';
          const proto = c.protocol;
          console.log('[audio] local ICE candidate:', typ, proto, c.address || '<masked>');
          socket.emit(SocketEvents.AudioIce, { to: peerId, candidate: c.toJSON() });
        } else if (!e.candidate) {
          console.log('[audio] ICE gathering complete for peer=', peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[audio] ICE state =', pc.iceConnectionState, 'peer=', peerId);
        // При обрыве (сменилась сеть / отвалился Wi-Fi / переключение на 4G) пробуем ICE restart.
        // Это разрешено только инициатору исходного offer — иначе будет конфликт.
        if (
          (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') &&
          initiator &&
          socket
        ) {
          console.log('[audio] attempting ICE restart for peer=', peerId);
          pc.createOffer({ iceRestart: true })
            .then((offer) => {
              offer.sdp = preferOpusTuning(offer.sdp);
              return pc.setLocalDescription(offer).then(() => offer);
            })
            .then((offer) => socket.emit(SocketEvents.AudioOffer, { to: peerId, sdp: offer }))
            .catch((err) => console.warn('[audio] ICE restart failed', err));
        }
      };
      pc.onconnectionstatechange = () => {
        console.log('[audio] PC state =', pc.connectionState, 'peer=', peerId);
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        console.log('[audio] ontrack peer=', peerId, 'kind=', e.track.kind, 'streamTracks=', stream?.getTracks().length);
        let audio = audiosRef.current.get(peerId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', 'true');
          // Safari/iOS лучше воспроизводит, если элемент в DOM. Скрываем, чтобы не мешал UI.
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audiosRef.current.set(peerId, audio);
        }
        audio.srcObject = stream;
        // Применяем выбранное устройство вывода (наушники/динамик) к новому элементу.
        applySinkId(audio);
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise
            .then(() => console.log('[audio] play() OK peer=', peerId))
            .catch((err) => console.warn('[audio] play() blocked peer=', peerId, err));
        }

        // Анализатор громкости — для индикатора «говорит»
        try {
          if (!audioCtxRef.current) {
            const Ctor =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioCtxRef.current = new Ctor();
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => undefined);
          }
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analysersRef.current.set(peerId, analyser);
        } catch (err) {
          console.warn('[audio] analyser setup failed', err);
        }
      };

      if (initiator && socket) {
        pc.createOffer()
          .then((offer) => {
            offer.sdp = preferOpusTuning(offer.sdp);
            return pc.setLocalDescription(offer).then(() => offer);
          })
          .then((offer) => {
            console.log('[audio] → emit offer to', peerId);
            socket.emit(SocketEvents.AudioOffer, { to: peerId, sdp: offer });
          })
          .catch((err) => console.error('[audio] offer error', err));
      }

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [socket],
  );

  const cleanupPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    pc?.close();
    peersRef.current.delete(peerId);

    const audio = audiosRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) audio.parentNode.removeChild(audio);
      audiosRef.current.delete(peerId);
    }
    analysersRef.current.delete(peerId);
    setLevels((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ---------- Слушатели сигналинга ----------
  useEffect(() => {
    if (!socket) return;
    const onPeers = (peers: string[]) => {
      console.log('[audio] ← audio:peers', peers);
      peers.forEach((pid) => createPeer(pid, true));
    };
    // Новый пир уведомил нас, что он готов. Мы НЕ инициируем — он сам пришлёт offer.
    const onPeerJoined = (peerId: string) => {
      console.log('[audio] ← audio:peer-joined', peerId, '(ожидаем от него offer)');
    };
    const onPeerLeft = (peerId: string) => {
      console.log('[audio] ← audio:peer-left', peerId);
      cleanupPeer(peerId);
    };

    const onOffer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[audio] ← offer from', from);
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeer(from, false);
      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        answer.sdp = preferOpusTuning(answer.sdp);
        await pc.setLocalDescription(answer);
        console.log('[audio] → emit answer to', from);
        socket.emit(SocketEvents.AudioAnswer, { to: from, sdp: answer });
      } catch (err) {
        console.error('[audio] onOffer error', err);
      }
    };
    const onAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[audio] ← answer from', from);
      const pc = peersRef.current.get(from);
      if (!pc) {
        console.warn('[audio] answer for unknown peer', from);
        return;
      }
      try {
        await pc.setRemoteDescription(sdp);
      } catch (err) {
        console.error('[audio] setRemoteDescription(answer) failed', err);
      }
    };
    const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[audio] ice add error', err);
      }
    };
    const onForceMute = (mute: boolean) => {
      setForcedMute(mute);
      // Замьютили — глушим дорожку. Размьютили — СРАЗУ включаем микрофон обратно,
      // чтобы ученик продолжал говорить, ничего не нажимая (требование учителя).
      // toggleMicTrack безопасен без стрима (просто выйдет).
      if (mute) toggleMicTrack(false);
      else toggleMicTrack(true);
    };

    socket.on('audio:peers', onPeers);
    socket.on('audio:peer-joined', onPeerJoined);
    socket.on('audio:peer-left', onPeerLeft);
    socket.on(SocketEvents.AudioOffer, onOffer);
    socket.on(SocketEvents.AudioAnswer, onAnswer);
    socket.on(SocketEvents.AudioIce, onIce);
    socket.on(SocketEvents.AudioForceMute, onForceMute);

    return () => {
      socket.off('audio:peers', onPeers);
      socket.off('audio:peer-joined', onPeerJoined);
      socket.off('audio:peer-left', onPeerLeft);
      socket.off(SocketEvents.AudioOffer, onOffer);
      socket.off(SocketEvents.AudioAnswer, onAnswer);
      socket.off(SocketEvents.AudioIce, onIce);
      socket.off(SocketEvents.AudioForceMute, onForceMute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, createPeer, cleanupPeer]);

  // ---------- Цикл измерения громкости ----------
  // Замеряем не каждый кадр, а ~15 раз/сек, и обновляем стейт только если
  // уровень какого-то пира изменился заметно. Это сильно экономит CPU при бездействии.
  useEffect(() => {
    let stopped = false;
    let lastTick = 0;
    const prev: Record<string, number> = {};

    function tick(ts: number) {
      if (stopped) return;
      if (ts - lastTick >= 66) {
        lastTick = ts;
        const next: Record<string, number> = {};
        let changed = false;
        analysersRef.current.forEach((analyser, peerId) => {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const level = Math.min(1, Math.sqrt(sum / data.length) * 2);
          next[peerId] = level;
          if (Math.abs((prev[peerId] ?? 0) - level) > 0.03) changed = true;
        });
        for (const k of Object.keys(prev)) {
          if (!(k in next)) changed = true;
        }
        if (changed) {
          for (const k of Object.keys(prev)) delete prev[k];
          for (const k of Object.keys(next)) prev[k] = next[k];
          setLevels(next);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /** Назначает аудио-элементу выбранное устройство вывода (если поддерживается). */
  function applySinkId(el: HTMLAudioElement) {
    const id = selectedOutputRef.current;
    if (!id || !OUTPUT_SELECTION_SUPPORTED) return;
    const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    withSink.setSinkId?.(id).catch(() => undefined);
  }

  function toggleMicTrack(on: boolean) {
    micEnabledRef.current = on;
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0] ?? null;
    // enabled держим в синхроне как дешёвую подстраховку…
    if (track) track.enabled = on;
    // …но ГЛАВНОЕ: на мьюте полностью снимаем дорожку со всех отправителей
    // (replaceTrack(null)) — RTP-поток прекращается, в эфир не уходит ничего.
    // На размьюте возвращаем дорожку. У нас в пирах только аудио-сендеры.
    peersRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        sender.replaceTrack(on ? track : null).catch(() => undefined);
      });
    });
    console.log('[audio] toggleMic →', on, 'replaceTrack on', peersRef.current.size, 'peers');
    setMicEnabled(on);
    socket?.emit(SocketEvents.AudioMicState, on);
  }

  /**
   * Строим аудио-граф для подавления помех:
   *   raw mic → [analyser (VAD)] → gain (ворота) → MediaStreamDestination → пиры
   * В пиры уходит обработанный поток. Если Web Audio недоступен (старый браузер,
   * iOS-причуды) — возвращаем сырой поток, звук работает как раньше, без гейта.
   */
  function buildMicGraph(raw: MediaStream): MediaStream {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return raw;
      const source = ctx.createMediaStreamSource(raw);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      const dest = ctx.createMediaStreamDestination();
      source.connect(analyser);
      source.connect(gain);
      gain.connect(dest);
      micGainRef.current = gain;
      localVadAnalyserRef.current = analyser;
      console.log('[audio] noise gate graph ready');
      return dest.stream;
    } catch (err) {
      console.warn('[audio] noise gate setup failed → raw stream', err);
      micGainRef.current = null;
      localVadAnalyserRef.current = null;
      return raw;
    }
  }

  /**
   * Noise gate с гистерезисом и «удержанием»:
   *   • громкость выше порога открытия → ворота открыты (голос проходит);
   *   • после спада громкости держим открытыми ещё holdMs (чтобы не рубить
   *     слова), затем плавно закрываем — фон/стук в паузах не передаётся.
   * Быстрая атака (10 мс) и мягкое закрытие (120 мс), чтобы не было щелчков.
   */
  function startNoiseGate() {
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    const OPEN = 0.045; // порог уверенного голоса (RMS, нормирован). Ниже = чувствительнее.
    const HOLD_MS = 280; // держим открытым после последнего голоса
    let openUntil = 0;
    let last = 0;

    function tick(ts: number) {
      // ~30 раз/сек достаточно для гейта и бережёт CPU.
      if (ts - last >= 33) {
        last = ts;
        const an = localVadAnalyserRef.current;
        const gain = micGainRef.current;
        const ctx = audioCtxRef.current;
        if (an && gain && ctx) {
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const now = performance.now();
          if (rms > OPEN) openUntil = now + HOLD_MS;
          const open = now < openUntil;
          const target = open ? 1 : 0;
          // setTargetAtTime: плавный переход без щелчков. Быстрее открываемся.
          gain.gain.setTargetAtTime(target, ctx.currentTime, open ? 0.01 : 0.12);
        }
      }
      vadRafRef.current = requestAnimationFrame(tick);
    }
    vadRafRef.current = requestAnimationFrame(tick);
  }

  function stopNoiseGate() {
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    try {
      micGainRef.current?.disconnect();
    } catch {
      // ignore
    }
    micGainRef.current = null;
    localVadAnalyserRef.current = null;
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
  }

  const refreshDevices = useCallback(async (requestPermission = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      // До выдачи доступа метки пустые. Если просят — спросим доступ ради названий.
      const noLabels = devices.every((d) => !d.label);
      if (noLabels && requestPermission) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // доступ не дали — покажем что есть
        }
      }
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn('[audio] enumerateDevices failed', err);
    }
  }, []);

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      selectedInputRef.current = deviceId;
      setCurrentInputId(deviceId);
      try {
        localStorage.setItem(INPUT_DEVICE_KEY, deviceId);
      } catch {
        // приватный режим — выбор не сохранится, но применится
      }
      // Не подключены — выбор применится при следующем join().
      if (!localStreamRef.current) return;
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(deviceId),
        });
        // Останавливаем старый микрофон и его noise-gate.
        stopNoiseGate();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        rawStreamRef.current = raw;
        const stream = buildMicGraph(raw);
        localStreamRef.current = stream;
        const track = stream.getAudioTracks()[0] ?? null;
        if (track) track.enabled = micEnabledRef.current;
        startNoiseGate();
        // Подменяем дорожку у всех пиров (с учётом текущего mute).
        peersRef.current.forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            sender
              .replaceTrack(micEnabledRef.current ? track : null)
              .catch(() => undefined);
          });
        });
        console.log('[audio] mic switched to', deviceId);
      } catch (err) {
        console.warn('[audio] setInputDevice failed', err);
        window.alert(micErrorMessage(err));
      }
    },
    [],
  );

  const setOutputDevice = useCallback(async (deviceId: string) => {
    selectedOutputRef.current = deviceId;
    setCurrentOutputId(deviceId);
    try {
      localStorage.setItem(OUTPUT_DEVICE_KEY, deviceId);
    } catch {
      // ignore
    }
    audiosRef.current.forEach((el) => applySinkId(el));
  }, []);

  // Инициализация: восстановить выбор из localStorage + следить за подключением устройств.
  useEffect(() => {
    try {
      const i = localStorage.getItem(INPUT_DEVICE_KEY);
      const o = localStorage.getItem(OUTPUT_DEVICE_KEY);
      if (i) {
        selectedInputRef.current = i;
        setCurrentInputId(i);
      }
      if (o) {
        selectedOutputRef.current = o;
        setCurrentOutputId(o);
      }
    } catch {
      // ignore
    }
    void refreshDevices(false);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    const handler = () => void refreshDevices(false);
    navigator.mediaDevices.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', handler);
  }, [refreshDevices]);

  const join = useCallback(async () => {
    if (joined) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      window.alert(
        'В этом браузере недоступен доступ к микрофону (нет MediaDevices). Попробуйте Chrome/Edge/Firefox последней версии.',
      );
      return;
    }
    // getUserMedia требует защищённый контекст: https или http://localhost
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      window.alert(
        'Микрофон работает только по HTTPS или на http://localhost.\n\n' +
          'Если вы открыли сайт по IP (например http://192.168.…), браузер запретит доступ. ' +
          'Запустите на этом же ПК: http://localhost:3000 или настройте HTTPS.',
      );
      return;
    }
    // КРИТИЧНО: создаём AudioContext СИНХРОННО, до любых await — пока активен пользовательский жест.
    // Если сделать это после `await getUserMedia`, Chrome посчитает gesture израсходованным
    // и выдаст "The AudioContext was not allowed to start" в Console.
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => undefined);
      }
    } catch (err) {
      console.warn('[audio] AudioContext init failed', err);
    }
    // Спросим у сервера актуальные ICE-сервера со свежими TURN-credentials.
    // Запрос не блокирующий: если сервер не ответит за 2 сек — используем fallback.
    if (socket) {
      try {
        iceServersRef.current = await requestIceServers(socket);
      } catch {
        iceServersRef.current = FALLBACK_ICE_SERVERS;
      }
    }
    try {
      // Берём ранее выбранный микрофон (если есть). Если устройство недоступно
      // (например, наушники отключили) — повторяем без жёсткой привязки.
      let rawStream: MediaStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(selectedInputRef.current),
        });
      } catch (errExact) {
        if (selectedInputRef.current) {
          console.warn('[audio] выбранный микрофон недоступен → дефолтный', errExact);
          rawStream = await navigator.mediaDevices.getUserMedia({
            audio: buildAudioConstraints(null),
          });
        } else {
          throw errExact;
        }
      }
      rawStreamRef.current = rawStream;
      // Пропускаем микрофон через noise gate; в пиры пойдёт обработанный поток.
      const stream = buildMicGraph(rawStream);
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      startNoiseGate();
      // Повторно резюмим — после долгого попапа разрешений контекст мог опять «уснуть».
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => undefined);
      }
      // Запомним фактически выбранный микрофон (метки теперь доступны).
      const usedTrack = rawStream.getAudioTracks()[0];
      const usedId = usedTrack?.getSettings().deviceId;
      if (usedId) {
        selectedInputRef.current = usedId;
        setCurrentInputId(usedId);
      }
      void refreshDevices(false);
      setMicEnabled(false);
      setJoined(true);
      console.log('[audio] join() OK; socket connected =', socket?.connected, '→ emit audio:ready');
      socket?.emit(SocketEvents.AudioReady);
    } catch (err) {
      // Не используем console.error — в Next.js dev это часто вызывает красный оверлей для ожидаемых отказов.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[audio] getUserMedia:', err);
      }
      window.alert(micErrorMessage(err));
    }
  }, [joined, socket, refreshDevices]);

  const leave = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audiosRef.current.forEach((a) => {
      a.pause();
      a.srcObject = null;
      if (a.parentNode) a.parentNode.removeChild(a);
    });
    audiosRef.current.clear();
    analysersRef.current.clear();
    stopNoiseGate();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setJoined(false);
    setMicEnabled(false);
    setLevels({});
    socket?.emit(SocketEvents.AudioLeave);
  }, [socket]);

  const setMic = useCallback(
    (on: boolean) => {
      if (forcedMute && on) return; // нельзя включить, если учитель замьютил
      toggleMicTrack(on);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forcedMute, socket],
  );

  const forceMute = useCallback(
    (targetSocketId: string, mute: boolean) => {
      socket?.emit(SocketEvents.AudioForceMute, { targetSocketId, mute });
    },
    [socket],
  );
  const forceMuteAll = useCallback(
    (mute: boolean) => socket?.emit(SocketEvents.AudioForceMuteAll, { mute }),
    [socket],
  );

  useEffect(() => () => leave(), [leave]);

  return {
    joined,
    micEnabled,
    forcedMute,
    levels,
    join,
    leave,
    setMic,
    forceMute,
    forceMuteAll,
    inputDevices,
    outputDevices,
    currentInputId,
    currentOutputId,
    outputSupported: OUTPUT_SELECTION_SUPPORTED,
    refreshDevices,
    setInputDevice,
    setOutputDevice,
  };
}
