"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "./pagination";

type Props = {
  /**
   * How many rows there are in all — or null when we could not read it.
   *
   * NOT a number in that case. postgrest-js leaves `count` null, with
   * `error` null, when the content-range header is missing, and
   * `count ?? rows.length` then means "this page is everything": the
   * pager hid itself on a full first page and page 2 became
   * unreachable. Every list in this app funnels through here, so the
   * unknown case is handled once — here — rather than in each screen.
   */
  total: number | null;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  className?: string;
  siblingCount?: number;
};

export default function TablePagination({
  total,
  page,
  perPage,
  onPageChange,
  className,
}: Props) {
  // Unknown means unknown: no page count and no numbers, but Previous
  // and Next stay, so nothing is out of reach.
  const unknown = total === null || !Number.isFinite(total);
  const totalPages = unknown
    ? page + 1
    : Math.max(1, Math.ceil((total as number) / perPage));

  // ── HOW MANY NUMBERS FIT, NOT HOW MANY WE CAN THINK OF ─────────────
  //
  // Seven consecutive page numbers plus two ellipses plus first, last,
  // Previous and Next is thirteen controls — fine on a desktop table,
  // and about twice the width a phone has. The row wraps now rather than
  // spilling, but wrapping thirteen items onto three lines is not an
  // improvement either.
  //
  // Three around the current page on a narrow screen, seven on a wide
  // one. The first and last page, the ellipses and both arrows stay
  // either way, so nothing becomes unreachable — the middle just gets
  // shorter.
  const [span, setSpan] = useState(7);
  useEffect(() => {
    const apply = () =>
      setSpan(
        typeof window !== "undefined" && window.innerWidth < 640 ? 3 : 7,
      );
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const buildPages = () => {
    const pages: (number | -1 | -2)[] = [];
    const half = Math.floor(span / 2);
    let start = Math.max(1, page - half);
    let end = Math.min(totalPages, page + half);
    if (end - start < span - 1) {
      start = Math.max(1, Math.min(start, totalPages - (span - 1)));
      end = Math.min(totalPages, start + (span - 1));
    }

    if (start > 1) pages.push(1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-2);
    if (end < totalPages) pages.push(totalPages);

    return pages;
  };

  const pages = unknown ? [] : buildPages();

  // With an unknown total we cannot claim there is only one page, so
  // the arrows stay. With a known one, a single page needs no pager.
  if (!unknown && totalPages <= 1) return null;

  return (
    <div className={className}>
      <Pagination>
        <PaginationContent>
          <PaginationPrevious
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(Math.max(1, page - 1));
            }}
          />
          {pages.map((p, idx) => {
            if (p < 0) return <PaginationEllipsis key={`e-${idx}`} />;
            return (
              <PaginationItem key={p}>
                <PaginationLink
                  className="cursor-pointer"
                  isActive={p === page}
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(p as number);
                  }}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          <PaginationNext
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              onPageChange(Math.min(totalPages, page + 1));
            }}
          />
        </PaginationContent>
      </Pagination>
    </div>
  );
}
