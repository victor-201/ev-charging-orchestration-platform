'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total: number;
  currentItemsCount: number;
  itemLabel: string;
  compact?: boolean;
  loading?: boolean;
};

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | 'ellipsis')[] = [1];
  if (current > 3) pages.push('ellipsis');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (current <= 3) {
    for (let i = 2; i <= 5; i++) pages.push(i);
  } else if (current >= total - 2) {
    for (let i = total - 4; i <= total - 1; i++) pages.push(i);
  } else {
    for (let i = start; i <= end; i++) pages.push(i);
  }

  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);

  return pages;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  currentItemsCount,
  itemLabel,
  compact = false,
  loading = false,
}: PaginationProps) {
  if (!loading && totalPages <= 1) return null;

  const sk = 'bg-white/5 rounded animate-pulse';

  const pageNumbers = getPageNumbers(page, totalPages);
  const btnBase = 'flex items-center justify-center rounded-lg transition-all duration-200 font-medium';
  const btnActive = 'bg-cyan/20 text-cyan border border-cyan/25 cursor-pointer hover:bg-cyan/30';
  const btnInactive = 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/[0.06] border border-transparent cursor-pointer';
  const btnDisabled = 'opacity-30 cursor-not-allowed';

  if (loading) {
    return compact ? (
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between gap-3 shrink-0">
        <span className={`${sk} h-3 w-20`} />
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className={`${sk} w-7 h-7`} />
          ))}
        </div>
      </div>
    ) : (
      <div className="px-6 py-2 border-t border-white/5 flex items-center justify-between gap-4 bg-white/[0.01]">
        <span className={`${sk} h-4 w-32`} />
        <div className="flex items-center gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className={`${sk} w-8 h-8`} />
          ))}
        </div>
      </div>
    );
  }

  return compact ? (
    <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between gap-3 shrink-0">
      <span className="text-[10px] text-text-muted">
        {currentItemsCount}/{total} {itemLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          className={`${btnBase} w-7 h-7 text-[10px] ${page <= 1 ? btnDisabled : btnInactive}`}
        >
          <ChevronsLeft className="w-3 h-3" />
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`${btnBase} w-7 h-7 text-[10px] ${page <= 1 ? btnDisabled : btnInactive}`}
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span className="text-[10px] text-text-main font-medium min-w-[52px] text-center">
          {page}/{totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`${btnBase} w-7 h-7 text-[10px] ${page >= totalPages ? btnDisabled : btnInactive}`}
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className={`${btnBase} w-7 h-7 text-[10px] ${page >= totalPages ? btnDisabled : btnInactive}`}
        >
          <ChevronsRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  ) : (
    <div className="px-6 py-2 border-t border-white/5 flex items-center justify-between gap-4 bg-white/[0.01]">
      <span className="text-xs text-text-muted">
        Hiển thị {currentItemsCount} / {total} {itemLabel}
      </span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          className={`${btnBase} w-8 h-8 text-xs ${page <= 1 ? btnDisabled : btnInactive}`}
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`${btnBase} w-8 h-8 text-xs ${page <= 1 ? btnDisabled : btnInactive}`}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {pageNumbers.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-text-muted select-none">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`${btnBase} w-8 h-8 text-xs ${p === page ? btnActive : btnInactive}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`${btnBase} w-8 h-8 text-xs ${page >= totalPages ? btnDisabled : btnInactive}`}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className={`${btnBase} w-8 h-8 text-xs ${page >= totalPages ? btnDisabled : btnInactive}`}
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </nav>
    </div>
  );
}
