/**
 * Абстракция над почтовым провайдером.
 *
 * Конкретного провайдера выбирает фабрика `getEmailSender()` по env (в порядке
 * приоритета):
 *   1. SMTP_HOST задан → SmtpSender (любой SMTP: Яндекс 360, Unisender, Mail.ru…).
 *      Предпочтительно для РФ — оплата в рублях, нет санкционных рисков,
 *      хорошая доставляемость в .ru.
 *   2. RESEND_API_KEY задан → ResendSender (HTTP API Resend).
 *   3. иначе → ConsoleSender (печатает письма в лог) — для локалки/тестов.
 *
 * Это даёт:
 *   1. Локально всё работает без настройки внешних сервисов.
 *   2. Смену провайдера без правок кода — только переменные окружения.
 *   3. Письма не теряются молча — при ошибке будет запись в логе,
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

type NodemailerTransport = {
  sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Отправка через любой SMTP-сервис (Яндекс 360, Unisender, Sendsay, Mail.ru…).
 * nodemailer грузим динамически — он нужен только если SMTP реально настроен,
 * и не попадает в клиентские бандлы.
 */
class SmtpSender implements EmailSender {
  private transporter: NodemailerTransport | null = null;

  constructor(
    private readonly cfg: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    },
  ) {}

  private async getTransporter(): Promise<NodemailerTransport> {
    if (this.transporter) return this.transporter;
    const nodemailer = await import('nodemailer');
    this.transporter = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure, // true для 465, false для 587 (STARTTLS)
      auth: { user: this.cfg.user, pass: this.cfg.pass },
    }) as unknown as NodemailerTransport;
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.cfg.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

let cached: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (cached) return cached;
  const from = process.env.EMAIL_FROM;

  // 1. SMTP (приоритетный путь для РФ).
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost && from) {
    const port = Number(process.env.SMTP_PORT) || 465;
    // secure=true для 465 (SSL), иначе STARTTLS (587). Можно явно задать SMTP_SECURE.
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;
    cached = new SmtpSender({
      host: smtpHost,
      port,
      secure,
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from,
    });
    return cached;
  }

  // 2. Resend (HTTP API).
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && from) {
    cached = new ResendSender(apiKey, from);
    return cached;
  }

  // 3. Fallback — печать в лог.
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[email] Ни SMTP_HOST, ни RESEND_API_KEY (+ EMAIL_FROM) не заданы — ' +
        'письма будут только в логе. Задайте SMTP-переменные, чтобы клиенты получали почту.',
    );
  }
  cached = new ConsoleSender();
  return cached;
}
