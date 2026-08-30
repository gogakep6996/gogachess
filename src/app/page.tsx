import Link from 'next/link';
import {
  ArrowRight,
  ChalkboardTeacher,
  Microphone,
  Robot,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr';
import { Header } from '@/components/layout/Header';
import { MiniBoard } from '@/components/chess/MiniBoard';
import { getCurrentUser } from '@/lib/auth';

// Позиция для живой доски в hero: итальянская партия, узнаваемое начало.
const HERO_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">

        {/* ── Hero: слева сообщение и действия, справа — настоящая доска ── */}
        <section className="grid items-center gap-10 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              Платформа для шахматных уроков
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
              Шахматы для <span className="text-brand-600 dark:text-brand-300">уроков</span>, игры и турниров
            </h1>
            <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
              Проводите занятия один на один и с группой, разбирайте позиции
              с движком — прямо в браузере, без сторонних программ.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={user ? '/class' : '/login?next=/class'}
                className="btn-primary group px-5 py-3 text-base"
              >
                Групповой урок
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5">
                  <ArrowRight size={14} weight="bold" aria-hidden />
                </span>
              </Link>
              <Link
                href={user ? '/rooms' : '/login?next=/rooms'}
                className="btn-outline px-5 py-3 text-base"
              >
                Быстрый урок
              </Link>
            </div>
          </div>

          {/* Настоящая мини-доска продукта в «двойной рамке»: внешняя подложка +
              внутреннее ядро, как стеклянная пластина в лотке. */}
          <div className="relative mx-auto w-full max-w-[420px]">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,rgba(43,127,92,0.14),transparent)]"
            />
            <div className="rounded-[2rem] bg-stone-900/[.04] p-2.5 ring-1 ring-stone-900/5 dark:bg-white/[.05] dark:ring-white/10">
              <div className="overflow-hidden rounded-[calc(2rem-0.625rem)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <MiniBoard fen={HERO_FEN} fluid />
              </div>
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-stone-200/80 bg-paper px-4 py-1.5 text-xs font-medium text-stone-600 shadow-soft dark:border-stone-700 dark:bg-paper-dark dark:text-stone-300">
              Живая доска урока — ходы видны всем сразу
            </div>
          </div>
        </section>

        {/* ── Разделы сайта: асимметричная bento-сетка вместо ровных плиток ── */}
        <section className="mt-20 sm:mt-24">
          <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50">
            Всё для занятий и игры
          </h2>
          <p className="mt-2 max-w-[60ch] text-stone-600 dark:text-stone-400">
            Четыре раздела: от урока один на один до группового занятия
            с голосовой связью.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Tile
              href={user ? '/rooms' : '/login?next=/rooms'}
              title="Быстрый урок"
              text="Занятие один на один: общая доска, голосовая связь и разбор позиции по ссылке."
              icon={<IconRook />}
              className="lg:col-span-3"
            />
            <Tile
              href={user ? '/class' : '/login?next=/class'}
              title="Групповой урок"
              text="У каждого ученика своя доска: учитель раздаёт задачи, видит все решения сразу и выводит любую доску на общий экран."
              icon={<IconGraduation />}
              className="lg:col-span-3"
              featured
            />
            <Tile
              href={user ? '/tournaments' : '/login?next=/tournaments'}
              title="Турниры"
              text="Арена со свободным подбором, таблицей и трансляцией всех партий."
              icon={<IconTrophy />}
              className="lg:col-span-3"
            />
            <Tile
              href="/learn"
              title="Обучение"
              text="Тактические задачи: маты, эндшпили, вилки и связки."
              icon={<IconBook />}
              className="lg:col-span-3"
              badge="Новое"
            />
          </div>
        </section>

        {/* ── Возможности платформы: без карточек, чистые колонки с иконками ── */}
        <section className="mt-20 sm:mt-24">
          <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50">
            Почему удобно учить и учиться
          </h2>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            <Feature
              title="Живая доска"
              text="Учитель ведёт урок, ученики видят перетаскивание каждой фигуры в реальном времени."
              icon={<ChalkboardTeacher size={26} weight="duotone" />}
            />
            <Feature
              title="Чистое аудио"
              text="Голосовая связь прямо в браузере. Никаких Zoom — только вы и ученики."
              icon={<Microphone size={26} weight="duotone" />}
            />
            <Feature
              title="Движок Stockfish"
              text="Сыграйте партию против ИИ или попросите движок проанализировать позицию."
              icon={<Robot size={26} weight="duotone" />}
            />
            <Feature
              title="Управление классом"
              text="Учитель видит участников, может выключить микрофон одному или сразу всем."
              icon={<ShieldCheck size={26} weight="duotone" />}
            />
          </div>
        </section>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-stone-300/50 pt-6 text-sm text-stone-500 dark:border-stone-700/60 dark:text-stone-400">
          <span>gogachess — шахматы для обучения</span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/privacy" className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">
              Политика обработки персональных данных
            </Link>
            <Link href="/terms" className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">
              Пользовательское соглашение
            </Link>
          </span>
        </footer>
      </main>
    </>
  );
}

function Tile({
  href,
  title,
  text,
  icon,
  badge,
  featured = false,
  tone,
  className = '',
}: {
  href: string;
  title: string;
  text: string;
  icon: React.ReactNode;
  badge?: string;
  /** Выделенная плитка: мягкий зелёный градиент вместо белого фона. */
  featured?: boolean;
  /** Янтарная подложка иконки (акцент-вариация для ритма сетки). */
  tone?: 'accent';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`tile group flex flex-col ${className} ${
        featured
          ? '!border-brand-200/70 bg-gradient-to-br from-brand-50 via-paper to-paper dark:!border-brand-800/60 dark:from-brand-900/30 dark:via-paper-dark dark:to-paper-dark'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`grid h-12 w-12 place-items-center rounded-2xl shadow-soft ${
            featured
              ? 'bg-brand-500 text-white'
              : tone === 'accent'
                ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200'
                : 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
          }`}
        >
          {icon}
        </div>
        {badge && (
          <span className="badge bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{text}</p>
      <div className="mt-auto pt-5">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
          Открыть
          <ArrowRight size={15} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Feature({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="border-t-2 border-brand-500/25 pt-5 dark:border-brand-400/20">
      <div className="mb-3 text-brand-600 dark:text-brand-300">{icon}</div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{text}</p>
    </div>
  );
}

/* Шахматные иконки разделов */
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
function IconGraduation() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M12 2 1 8l11 6 9-4.9V16h2V8L12 2zM4 13.5V17c0 1.7 3.6 3 8 3s8-1.3 8-3v-3.5l-8 4.4-8-4.4z" />
    </svg>
  );
}