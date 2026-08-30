'use client';

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { ListNumbers } from '@phosphor-icons/react';
import type { MoveHistoryEntry, MoveTreeNode } from '@/lib/socket-events';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';
import { EmptyHint, Panel } from './ui';

interface Props {
  history: MoveHistoryEntry[];
  /** Текущий просматриваемый индекс хода (-1 = стартовая позиция, history.length-1 = последний). */
  viewIdx: number;
  onSelect: (idx: number) => void;
  className?: string;
  /** Режим дерева ходов (варианты). Когда включён — рисуем дерево, а не плоский список. */
  treeMode?: boolean;
  moveTree?: MoveTreeNode[];
  /** FEN стартовой позиции отрезка (для нумерации ходов). */
  segmentStartFen?: string;
  currentNodeId?: string | null;
  viewNodeId?: string | null;
  onSelectNode?: (id: string | null) => void;
}

/** Общий вид кликабельной записи хода. Варианты — янтарные, главная линия — нейтральная. */
const MOVE_CELL =
  'rounded-lg px-1.5 py-1 text-[12px] font-semibold leading-none tabular-nums transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45';

export function HistoryPanel({
  history,
  viewIdx,
  onSelect,
  className,
  treeMode,
  moveTree,
  segmentStartFen,
  currentNodeId,
  viewNodeId,
  onSelectNode,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Автопрокрутка к выбранному ходу — но ТОЛЬКО внутри самой панели истории.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.bottom > containerRect.bottom) {
      container.scrollTop += elRect.bottom - containerRect.bottom + 4;
    } else if (elRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elRect.top + 4;
    }
  }, [viewIdx, viewNodeId]);

  if (treeMode) {
    return (
      <TreePanel
        scrollRef={scrollRef}
        moveTree={moveTree ?? []}
        segmentStartFen={segmentStartFen ?? STARTING_FEN}
        currentNodeId={currentNodeId ?? null}
        viewNodeId={viewNodeId ?? null}
        onSelectNode={onSelectNode ?? (() => {})}
        className={className}
      />
    );
  }

  const pairs: {
    num: number;
    w?: { idx: number; san: string; legal: boolean };
    b?: { idx: number; san: string; legal: boolean };
  }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      w: { idx: i, san: history[i].san, legal: history[i].legal },
      b: history[i + 1]
        ? { idx: i + 1, san: history[i + 1].san, legal: history[i + 1].legal }
        : undefined,
    });
  }

  return (
    <Panel
      title="Ходы"
      icon={ListNumbers}
      className={className}
      bodyClassName="min-h-0 flex-1 overflow-hidden"
      action={
        <span className="text-[11px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
          {history.length}
        </span>
      }
    >
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain p-1.5">
        {history.length === 0 ? (
          <EmptyHint>Партия ещё не начата</EmptyHint>
        ) : (
          <ol className="space-y-0.5">
            <li>
              <StartCell active={viewIdx === -1} onClick={() => onSelect(-1)} />
            </li>
            {pairs.map(({ num, w, b }) => (
              <li key={num} className="flex items-center gap-1">
                <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
                  {num}.
                </span>
                {w && (
                  <SanCell entry={w} active={viewIdx === w.idx} onClick={() => onSelect(w.idx)} />
                )}
                {b && (
                  <SanCell entry={b} active={viewIdx === b.idx} onClick={() => onSelect(b.idx)} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function StartCell({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      className={cn(
        MOVE_CELL,
        'w-full text-left',
        active
          ? 'bg-brand-600 text-white'
          : 'text-stone-500 hover:bg-stone-900/[0.06] dark:text-stone-400 dark:hover:bg-white/[0.08]',
      )}
    >
      Начальная позиция
    </button>
  );
}

function SanCell({
  entry,
  active,
  onClick,
}: {
  entry: { san: string; legal: boolean };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      title={entry.legal ? entry.san : `${entry.san} - нелегальный ход`}
      className={cn(
        MOVE_CELL,
        'flex-1 truncate text-left',
        active
          ? 'bg-brand-600 text-white'
          : 'text-stone-700 hover:bg-stone-900/[0.06] dark:text-stone-200 dark:hover:bg-white/[0.08]',
        !entry.legal && !active && 'italic text-amber-700 dark:text-amber-300',
      )}
    >
      {entry.san}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Дерево ходов с ветками (варианты как в Lichess). Инлайн-нотация: главная
// линия — обычным цветом, варианты — в скобках, янтарным цветом и с отступом,
// чтобы их было видно с одного взгляда.
// ─────────────────────────────────────────────────────────────────────────
function TreePanel({
  scrollRef,
  moveTree,
  segmentStartFen,
  currentNodeId,
  viewNodeId,
  onSelectNode,
  className,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  moveTree: MoveTreeNode[];
  segmentStartFen: string;
  currentNodeId: string | null;
  viewNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  className?: string;
}) {
  const { map, childrenOf } = useMemo(() => {
    const m = new Map<string, MoveTreeNode>();
    const kids = new Map<string | null, MoveTreeNode[]>();
    for (const n of moveTree) {
      m.set(n.id, n);
      const arr = kids.get(n.parentId) ?? [];
      arr.push(n);
      kids.set(n.parentId, arr);
    }
    return { map: m, childrenOf: (id: string | null) => kids.get(id) ?? [] };
  }, [moveTree]);

  function meta(node: MoveTreeNode): { white: boolean; num: number } {
    const parent = node.parentId ? map.get(node.parentId) : null;
    const beforeFen = parent ? parent.fen : segmentStartFen;
    const parts = beforeFen.split(' ');
    return { white: parts[1] !== 'b', num: Number(parts[5]) || 1 };
  }

  // Инлайн-рендер линии, начиная с firstId, следуя за первым потомком (главная
  // линия этого уровня). Побочные потомки (ветки) рисуются в скобках.
  function renderChain(firstId: string, depth: number): ReactNode[] {
    const out: ReactNode[] = [];
    let cur: MoveTreeNode | undefined = map.get(firstId);
    let needNum = true;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      const node = cur;
      const m = meta(node);
      if (m.white) {
        out.push(
          <span key={`${node.id}:n`} className="mr-0.5 text-stone-400 dark:text-stone-500">
            {m.num}.
          </span>,
        );
      } else if (needNum) {
        out.push(
          <span key={`${node.id}:n`} className="mr-0.5 text-stone-400 dark:text-stone-500">
            {m.num}…
          </span>,
        );
      }
      needNum = false;
      out.push(
        <MoveChip
          key={node.id}
          node={node}
          active={node.id === viewNodeId}
          isCurrent={node.id === currentNodeId}
          variation={depth > 0}
          onClick={() => onSelectNode(node.id)}
        />,
      );
      const kids = childrenOf(node.id);
      if (kids.length > 1) {
        for (let i = 1; i < kids.length; i++) {
          out.push(
            <span
              key={`${node.id}:var${i}`}
              className={cn(
                'mx-0.5 text-amber-700 dark:text-amber-300',
                depth === 0 &&
                  'my-1 block border-l-2 border-amber-300/70 pl-1.5 dark:border-amber-600/50',
              )}
            >
              <span className="text-amber-500/70">(</span>
              {renderChain(kids[i].id, depth + 1)}
              <span className="text-amber-500/70">)</span>
            </span>,
          );
        }
        needNum = true;
      }
      cur = kids[0];
    }
    return out;
  }

  const rootKids = childrenOf(null);

  return (
    <Panel
      title="Ходы"
      icon={ListNumbers}
      className={className}
      bodyClassName="min-h-0 flex-1 overflow-hidden"
      action={
        moveTree.length > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-stone-400 dark:text-stone-500">
            {moveTree.length}
          </span>
        ) : undefined
      }
    >
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain p-1.5">
        <StartCell active={viewNodeId === null} onClick={() => onSelectNode(null)} />
        {rootKids.length === 0 ? (
          <EmptyHint>Партия ещё не начата</EmptyHint>
        ) : (
          <div className="mt-1 text-[12px] leading-relaxed tabular-nums">
            {renderChain(rootKids[0].id, 0)}
            {rootKids.slice(1).map((alt, i) => (
              <span
                key={`root:var${i}`}
                className="my-1 block border-l-2 border-amber-300/70 pl-1.5 text-amber-700 dark:border-amber-600/50 dark:text-amber-300"
              >
                <span className="text-amber-500/70">(</span>
                {renderChain(alt.id, 1)}
                <span className="text-amber-500/70">)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MoveChip({
  node,
  active,
  isCurrent,
  variation,
  onClick,
}: {
  node: MoveTreeNode;
  active: boolean;
  isCurrent: boolean;
  variation: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={onClick}
      title={node.legal ? node.san : `${node.san} - нелегальный ход`}
      className={cn(
        MOVE_CELL,
        'mr-0.5 inline',
        active
          ? 'bg-brand-600 text-white'
          : variation
            ? 'text-amber-700 hover:bg-amber-100/70 dark:text-amber-300 dark:hover:bg-amber-900/40'
            : 'text-stone-700 hover:bg-stone-900/[0.06] dark:text-stone-200 dark:hover:bg-white/[0.08]',
        !node.legal && 'italic',
        !active && isCurrent && 'ring-1 ring-inset ring-brand-400/70',
      )}
    >
      {node.san}
    </button>
  );
}
