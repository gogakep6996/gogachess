import { NextResponse } from 'next/server';
import { getCategory, getPuzzleCount, getRandomPuzzle } from '@/lib/training';

/** GET /api/training/next?cat=mate1&not=<id> — случайная задача из блока. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get('cat') ?? '';
  const not = url.searchParams.get('not');

  if (!getCategory(cat)) {
    return NextResponse.json({ error: 'unknown_category' }, { status: 400 });
  }

  const puzzle = getRandomPuzzle(cat, not);
  if (!puzzle) {
    return NextResponse.json({ error: 'no_puzzles' }, { status: 404 });
  }

  return NextResponse.json({ puzzle, total: getPuzzleCount(cat) });
}
