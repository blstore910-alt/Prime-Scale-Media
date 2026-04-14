import * as React from "react";
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
  total: number;
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
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const buildPages = () => {
    const pages: (number | -1 | -2)[] = [];
    let start = Math.max(1, page - 3);
    let end = Math.min(totalPages, page + 3);
    if (end - start < 6) {
      start = Math.max(1, Math.min(start, totalPages - 6));
      end = Math.min(totalPages, start + 6);
    }

    if (start > 1) pages.push(1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-2);
    if (end < totalPages) pages.push(totalPages);

    return pages;
  };

  const pages = buildPages();

  if (totalPages <= 1) return null;

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
