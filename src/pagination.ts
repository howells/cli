/**
 * Pagination envelope for list-style commands.
 *
 * Many vendor APIs don't return a cursor or total count, so we use a
 * `returned === limit` heuristic to flag truncation. That's not exact —
 * an API that happened to return exactly `limit` rows when none more
 * exist will be flagged `has_more: true` and the next call will return
 * empty. Agents should treat `has_more` as an upper bound and stop on
 * empty pages.
 */

export interface PageMeta {
  /** Number of rows in this response. */
  returned: number;
  /** Limit that was applied. */
  limit: number;
  /**
   * True when `returned === limit` — more rows probably exist. Heuristic.
   */
  has_more: boolean;
  /** Suggested offset for the next page. Undefined when `has_more` is false. */
  next_offset?: number;
  /** Offset that produced this page (echo of input). */
  offset?: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface PaginateOptions {
  limit: number;
  /** Offset that produced this page (used for `next_offset` arithmetic). */
  offset?: number;
}

/**
 * Wrap a row array in a {@link Page} with `has_more` / `next_offset`
 * computed from the heuristic.
 *
 * @example
 *   const rows = await api(...);
 *   return paginate(rows, { limit: 100, offset: 0 });
 */
export function paginate<T>(rows: T[], opts: PaginateOptions): Page<T> {
  const { limit } = opts;
  const offset = opts.offset ?? 0;
  const has_more = rows.length === limit;
  return {
    data: rows,
    meta: {
      returned: rows.length,
      limit,
      has_more,
      next_offset: has_more ? offset + limit : undefined,
      offset,
    },
  };
}
