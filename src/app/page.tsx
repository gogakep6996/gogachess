import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <section className="mb-10 space-y-3 text-center">
          <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            gogachess
          </span>
          <h1 className="font-display text-4xl font-semibold leading-tight text-stone-800 dark:text-stone-200 md:text-5xl">
            <span className="text-brand-600 dark:text-brand-400">Шахматы</span>{' '}
            <span className="text-white [text-shadow:0_1px_3px_rgb(41_37_36/0.75),0_0_24px_rgb(41_37_36/0.2)] dark:[text-shadow:none]">
              gogachess
            </span>
            {' — это удобство'}
          </h1>
          <p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-300">
            Играйте с друзьями, проводите уроки, устраивайте турниры и учитесь
            прямо в браузере. Без сторонних платформ.
          </p>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            href={user ? '/play' : '/login?next=/play'}
            title="Играть онлайн"
            text="Быстрая партия со случайным соперником в выбранном таймере."
            icon={<IconKnight />}
            tone="amber"
          />
          <Tile
            href={user ? '/rooms' : '/login?next=/rooms'}
            title="Создать комнату"
            text="Открыть приватный или публичный класс для урока."
            icon={<IconRook />}
            tone="emerald"
          />
          <Tile
            href={user ? '/tournaments' : '/login?next=/tournaments'}
            title="Турниры"
            text="Арена со свободным подбором, таблицей и трансляцией всех партий."
            icon={<IconTrophy />}
            tone="violet"
          />
          <Tile
            href="/learn"
            title="Обучение"
            text="Уроки, тактика и упражнения. Скоро."
            icon={<IconBook />}
            tone="sky"
            badge="Скоро"
          />
        </section>

        <section className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            title="Живая доска"
            text="Учитель ведёт урок, ученики видят перетаскивание каждой фигуры в реальном времени."
            icon="♞"
          />
          <Feature
            title="Чистое аудио"
            text="WebRTC peer-to-peer прямо в браузере. Никаких Zoom — только ваша комната."
            icon="🎙"
          />
          <Feature
            title="Движок Stockfish"
            text="Сыграйте партию против ИИ или попросите движок проанализировать позицию."
            icon="🤖"
          />
          <Feature
            title="Управление классом"
            text="Учитель видит участников, может выключить микрофон одному или сразу всем."
            icon="🛡"
          />
        </section>
      </main>
    </>
  );
}

type Tone = 'amber' | 'emerald' | 'violet' | 'sky';

const TONE_BG: Record<Tone, string> = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
};

function Tile({
  href,
  title,
  text,
  icon,
  tone,
  badge,
}: {
  href: string;
  title: string;
  text: string;
  icon: React.ReactNode;
  tone: Tone;
  badge?: string;
}) {
  return (
    <Link href={href} className="tile group">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${TONE_BG[tone]} shadow-soft`}>{icon}</div>
        {badge && (
          <span className="badge bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{text}</p>
      <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition-transform group-hover:translate-x-0.5 dark:text-brand-300">
        Открыть <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

function Feature({ title, text, icon }: { title: string; text: string; icon: string }) {
  return (
    <div className="card">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-xl text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{text}</p>
    </div>
  );
}

/* Иконки */
function IconKnight() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M14 3c3.5 1 6 4 6 9v9H7v-3c0-2 1-3 2-4-2 0-4-1-4-3 0-3 4-7 5-8 0 1 1 2 2 2l2-2z" />
    </svg>
  );
}
function IconRook() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M5 3h2v2h2V3h2v2h2V3h2v2h2V3h2v5l-2 2v6l2 2v3H3v-3l2-2v-6L3 8V3h2z" />
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M7 4h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 16v2h3v3H8v-3h3v-2a5 5 0 0 1-2.7-3H8a4 4 0 0 1-4-4V6h3V4zm0 4H6v1a2 2 0 0 0 1 1.7V8zm10 0v2.7A2 2 0 0 0 18 9V8h-1z" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4zm9 0h7v13h-7a3 3 0 0 0-3 3V7a3 3 0 0 1 3-3z" />
    </svg>
  );
}
