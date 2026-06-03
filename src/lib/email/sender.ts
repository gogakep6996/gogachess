/**
 * Абстракция над почтовым провайдером. В проде используется Resend,
 * для локалки/тестов — ConsoleSender (печатает письма в stdout).
 *
 * Конкретного провайдера выбирает фабрика `getEmailSender()` по env:
 *   - RESEND_API_KEY задан → ResendSender
 *   - иначе                → ConsoleSender (печатает письма в лог)
 *
 * Это даёт два преимущества:
 *   1. Локально работает без настройки внешних сервисов.
 *   2. Если Resend «упадёт», письма не теряются молча — будет ошибка в логе,
 *      а сам процесс регистрации не сломается (см. try/catch в API).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Текстовая версия для клиентов без HTML и для антиспам-фильтров. */
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log('\n========= [EMAIL — dev sender] =========');
    console.log(`To:      ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log('-- text --');
    console.log(message.text);
    console.log('========================================\n');
  }
}

class ResendSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}

let cached: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) {
    cached = new ResendSender(apiKey, from);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[email] RESEND_API_KEY или EMAIL_FROM не заданы — письма будут только в логе. ' +
          'Установите переменные окружения, чтобы клиенты получали почту.',
      );
    }
    cached = new ConsoleSender();
  }
  return cached;
}
