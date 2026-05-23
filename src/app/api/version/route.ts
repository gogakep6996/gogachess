import { NextResponse } from 'next/server';

// Версия = момент запуска серверного процесса. Меняется при каждом
// перезапуске контейнера (docker compose up -d --build) — этого
// достаточно, чтобы клиент понял "вышло обновление" и предложил
// перезагрузить страницу.
//
// Значение фиксируется один раз при инициализации модуля (cold start)
// и держится в памяти Node-процесса до его рестарта.
const SERVER_VERSION = Date.now().toString();

// Не кешируем ответ — нужна свежая версия при каждом polling-запросе.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { version: SERVER_VERSION },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
