'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { SocketEvents } from '@/lib/socket-events';

// Маяк версии хука — если эту строку видно в Console при загрузке комнаты,
// значит, JS свежий. Если не видно — кеш/SW отдают старый бандл.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[audio] hook module loaded build=2026-05-12T22:00');
}

const ICE_SERVERS: RTCIceServer[] = (() => {
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
  forceMuteAll: () => void;
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

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const rafRef = useRef<number | null>(null);

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

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log('[audio] addTrack count=', tracks.length, 'kinds=', tracks.map((t) => t.kind));
        tracks.forEach((t) => pc.addTrack(t, localStreamRef.current!));
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
          socket.emit(SocketEvents.AudioIce, { to: peerId, candidate: e.candidate.toJSON() });
        } else if (!e.candidate) {
          console.log('[audio] ICE gathering complete for peer=', peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[audio] ICE state =', pc.iceConnectionState, 'peer=', peerId);
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
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
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
      if (mute) toggleMicTrack(false);
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

  function toggleMicTrack(on: boolean) {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = on));
    console.log('[audio] toggleMic →', on, 'tracks=', tracks.length, 'first.enabled=', tracks[0]?.enabled);
    setMicEnabled(on);
    socket?.emit(SocketEvents.AudioMicState, on);
  }

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      // Повторно резюмим — после долгого попапа разрешений контекст мог опять «уснуть».
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => undefined);
      }
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
  }, [joined, socket]);

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
  const forceMuteAll = useCallback(() => socket?.emit(SocketEvents.AudioForceMuteAll), [socket]);

  useEffect(() => () => leave(), [leave]);

  return { joined, micEnabled, forcedMute, levels, join, leave, setMic, forceMute, forceMuteAll };
}
