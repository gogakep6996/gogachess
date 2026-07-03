'use client';

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { MoveHistoryEntry, MoveTreeNode } from '@/lib/socket-events';
import { STARTING_FEN } from '@/lib/socket-events';
import { cn } from '@/lib/utils';

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
    <div
      className={cn(
        'flex min-h-0 flex-col rounded-xl border border-stone-200/80 bg-paper/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200/70 px-2 py-1 dark:border-stone-800/70">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          История
        </h3>
        <span className="text-[10px] text-stone-400">
          {history.length} {history.length === 1 ? 'ход' : history.length >= 2 && history.length <= 4 ? 'хода' : 'ходов'}
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {history.length === 0 ? (
          <div className="px-1 py-2 text-center text-[11px] text-stone-400">
            Пока ходов нет
          </div>
        ) : (
          <ol className="space-y-0.5">
            <li>
              <button
                type="button"
                data-active={viewIdx === -1}
                onClick={() => onSelect(-1)}
                className={cn(
                  'w-full rounded px-1.5 py-0.5 text-left text-[11px] transition',
                  viewIdx === -1
                    ? 'bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800',
                )}
              >
                Старт партии
              </button>
            </li>
            {pairs.map(({ num, w, b }) => (
              <li key={num} className="flex items-center gap-1 text-[11px] tabular-nums">
                <span className="w-5 shrink-0 text-right text-stone-400">{num}.</span>
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
    </div>
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
      title={entry.legal ? entry.san : `${entry.san} · нелегальный`}
      className={cn(
        'flex-1 truncate rounded px-1.5 py-0.5 text-left font-medium transition',
        active
          ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
          : 'hover:bg-stone-100 dark:hover:bg-stone-800',
        !entry.legal && 'italic text-amber-700 dark:text-amber-300',
      )}
    >
      {entry.san}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Дерево ходов с ветками (варианты как в Lichess). Инлайн-нотация: главная
// линия — обычным цветом, варианты — в скобках, приглушённым/янтарным цветом
// и с отступом, чтобы визуально отличаться.
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
          <span key={`${node.id}:n`} className="mr-0.5 text-stone-400">
            {m.num}.
          </span>,
        );
      } else if (needNum) {
        out.push(
          <span key={`${node.id}:n`} className="mr-0.5 text-stone-400">
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
                'mx-0.5 rounded text-amber-700 dark:text-amber-300',
                depth === 0 &&
                  'my-0.5 block border-l-2 border-amber-300/60 pl-1.5 dark:border-amber-500/40',
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
    <div
      className={cn(
        'flex min-h-0 flex-col rounded-xl border border-stone-200/80 bg-paper/70 shadow-soft backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/50',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200/70 px-2 py-1 dark:border-stone-800/70">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          История
        </h3>
        {moveTree.length > 0 && (
          <span className="text-[10px] text-stone-400">{moveTree.length}</span>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        <button
          type="button"
          data-active={viewNodeId === null}
          onClick={() => onSelectNode(null)}
          className={cn(
            'mb-1 w-full rounded px-1.5 py-0.5 text-left text-[11px] transition',
            viewNodeId === null
              ? 'bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
              : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800',
          )}
        >
          Старт партии
        </button>
        {rootKids.length === 0 ? (
          <div className="px-1 py-2 text-center text-[11px] text-stone-400">Пока ходов нет</div>
        ) : (
          <div className="text-[11px] leading-relaxed tabular-nums">
            {renderChain(rootKids[0].id, 0)}
            {rootKids.slice(1).map((alt, i) => (
              <span
                key={`root:var${i}`}
                className="my-0.5 block rounded border-l-2 border-amber-300/60 pl-1.5 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
              >
                <span className="text-amber-500/70">(</span>
                {renderChain(alt.id, 1)}
                <span className="text-amber-500/70">)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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
      title={node.legal ? node.san : `${node.san} · нелегальный`}
      className={cn(
        'mr-0.5 inline rounded px-1 py-0.5 font-medium transition',
        active
          ? 'bg-brand-500 text-white'
          : variation
            ? 'text-amber-700 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/30'
            : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800',
        !node.legal && 'italic',
        !active && isCurrent && 'ring-1 ring-brand-400/70',
      )}
    >
      {node.san}
    </button>
  );
}
