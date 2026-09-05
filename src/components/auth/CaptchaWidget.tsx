'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Виджет Yandex SmartCaptcha. Рендерится только если задан
 * NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY. Без него компонент не показывает ничего,
 * и форма работает как раньше (сервер тоже пропустит проверку, см. lib/captcha.ts).
 *
 * Два режима:
 *  • обычный (по умолчанию) — кнопка «Я не робот», токен приходит в onToken.
 *    Подходит для редких осознанных действий: регистрация, сброс пароля;
 *  • invisible — кнопки нет, проверка запускается вручную через ref.execute().
 *    Нужен для входа: обычный пользователь не видит ничего, задание получают
 *    только подозрительные запросы.
 *
 * Блок с уведомлением об обработке данных (hideShield) намеренно не скрыт:
 * Яндекс требует уведомлять пользователей о том, что SmartCaptcha обрабатывает
 * их данные, а сервис указан в политике обработки персональных данных.
 *
 * Скрипт грузится лениво и идемпотентно: параметр onload в его адресе вызывает
 * заранее объявленную глобальную функцию, после чего доступен window.smartCaptcha.
 */

const READY_CALLBACK = '__gogachessSmartCaptchaReady';
const SCRIPT_SRC = `https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload&onload=${READY_CALLBACK}`;

/** Пользователь закрыл окно с заданием, не решив его. */
export const CAPTCHA_CANCELLED = 'captcha-cancelled';

/** Виджет так и не построился: скрипт Яндекса не загрузился или заблокирован. */
export const CAPTCHA_NOT_READY = 'captcha-not-ready';

/** Сколько ждём готовности виджета, прежде чем признать её недостижимой. */
const READY_TIMEOUT_MS = 15_000;

export interface CaptchaHandle {
  /**
   * Возвращает токен для отправки на сервер.
   * В обычном режиме — уже полученный, в невидимом — запускает проверку и ждёт её.
   * Если капча не настроена, возвращает пустую строку, и сервер пропустит запрос.
   * Если капча настроена, но ещё не готова — дожидается её.
   */
  execute: () => Promise<string>;
  reset: () => void;
}

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Props {
  onToken?: (token: string) => void;
  invisible?: boolean;
}

type SubscribeEvent =
  | 'challenge-visible'
  | 'challenge-hidden'
  | 'network-error'
  | 'javascript-error'
  | 'success'
  | 'token-expired';

interface SmartCaptchaGlobal {
  render: (
    container: HTMLElement | string,
    params: {
      sitekey: string;
      callback?: (token: string) => void;
      hl?: 'ru' | 'en';
      invisible?: boolean;
      hideShield?: boolean;
    },
  ) => string;
  getResponse: (widgetId?: string) => string;
  execute: (widgetId?: string) => void;
  reset: (widgetId?: string) => void;
  destroy: (widgetId?: string) => void;
  subscribe: (widgetId: string, event: SubscribeEvent, callback: () => void) => () => void;
}

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaGlobal;
    __gogachessSmartCaptchaReady?: () => void;
  }
}

type Resolver = { resolve: (token: string) => void; reject: (err: Error) => void };

export const CaptchaWidget = forwardRef<CaptchaHandle, Props>(function CaptchaWidget(
  { onToken, invisible = false },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Готовность виджета. Скрипт капчи грузится со стороннего домена и успевает
  // не всегда: нажатие «Войти» в первую секунду после открытия страницы
  // заставало widgetId пустым, форма отправляла пустой токен, и сервер отвечал
  // отказом «я не бот» при верном пароле. Теперь execute() дожидается этого
  // обещания вместо того, чтобы молча вернуть пустую строку.
  const readyRef = useRef<Deferred>(createDeferred());
  // Ожидающий вызов execute() в невидимом режиме: резолвится из callback виджета.
  const resolverRef = useRef<Resolver | null>(null);
  // Колбэк держим в ref, чтобы эффект не перезапускался и виджет не пересоздавался.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const siteKey = process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    const settleWithFailure = () => {
      const pending = resolverRef.current;
      if (!pending) return;
      resolverRef.current = null;
      pending.reject(new Error(CAPTCHA_CANCELLED));
    };

    const ensureScript = (): Promise<void> => {
      if (window.smartCaptcha) return Promise.resolve();

      if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
        // Скрипт уже добавлен другим виджетом — ждём, пока он объявит smartCaptcha.
        return new Promise((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            if (window.smartCaptcha) {
              clearInterval(timer);
              resolve();
            } else if (Date.now() - started > 15000) {
              clearInterval(timer);
              reject(new Error('SmartCaptcha не инициализировалась'));
            }
          }, 50);
        });
      }

      return new Promise((resolve, reject) => {
        window[READY_CALLBACK] = () => resolve();
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.defer = true;
        script.onerror = () => reject(new Error('не удалось загрузить скрипт SmartCaptcha'));
        document.head.appendChild(script);
      });
    };

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.smartCaptcha) return;

        const widgetId = window.smartCaptcha.render(containerRef.current, {
          sitekey: siteKey,
          hl: 'ru',
          invisible,
          callback: (token: string) => {
            onTokenRef.current?.(token);
            const pending = resolverRef.current;
            if (pending) {
              resolverRef.current = null;
              pending.resolve(token);
            }
          },
        });
        widgetIdRef.current = widgetId;
        readyRef.current.resolve();

        // Токен живёт 5 минут и одноразовый: по истечении и при сбоях сбрасываем
        // его в форме, чтобы кнопка отправки не отправляла недействительный токен.
        for (const event of ['token-expired', 'network-error', 'javascript-error'] as const) {
          unsubscribers.push(
            window.smartCaptcha.subscribe(widgetId, event, () => {
              onTokenRef.current?.('');
              settleWithFailure();
            }),
          );
        }

        // Окно с заданием закрылось. Если это был успех, callback уже успел
        // отработать и ожидание снято; небольшая задержка защищает от гонки.
        unsubscribers.push(
          window.smartCaptcha.subscribe(widgetId, 'challenge-hidden', () => {
            setTimeout(settleWithFailure, 300);
          }),
        );
      })
      .catch((err) => {
        console.error('[captcha] SmartCaptcha недоступна:', err);
      });

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      // Виджета снова нет — следующий execute() должен ждать новый, а не
      // получить уже выполненное обещание от предыдущего.
      readyRef.current = createDeferred();
      if (widgetId && window.smartCaptcha) window.smartCaptcha.destroy(widgetId);
    };
  }, [siteKey, invisible]);

  useImperativeHandle(
    ref,
    (): CaptchaHandle => ({
      execute: async () => {
        // Капча не настроена вовсе — сервер тоже пропустит, см. lib/captcha.ts.
        if (!siteKey) return '';

        if (!widgetIdRef.current) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            readyRef.current.promise,
            new Promise<void>((r) => {
              timer = setTimeout(r, READY_TIMEOUT_MS);
            }),
          ]);
          if (timer) clearTimeout(timer);
        }

        const smartCaptcha = window.smartCaptcha;
        const widgetId = widgetIdRef.current;
        // Не дождались: лучше честно сказать про капчу, чем отправить пустой
        // токен и получить с сервера обвинение в том, что человек — бот.
        if (!smartCaptcha || !widgetId) throw new Error(CAPTCHA_NOT_READY);

        if (!invisible) return smartCaptcha.getResponse(widgetId) || '';

        // Токен одноразовый, поэтому перед каждой отправкой формы начинаем заново.
        smartCaptcha.reset(widgetId);
        return new Promise<string>((resolve, reject) => {
          resolverRef.current = { resolve, reject };
          smartCaptcha.execute(widgetId);
        });
      },
      reset: () => {
        const widgetId = widgetIdRef.current;
        if (widgetId && window.smartCaptcha) window.smartCaptcha.reset(widgetId);
      },
    }),
    [siteKey, invisible],
  );

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex justify-center" />;
});
