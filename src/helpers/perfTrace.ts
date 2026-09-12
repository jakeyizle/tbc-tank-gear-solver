// A tiny named-span timing aggregator for investigating where a sim-backed solve spends its
// time. Deliberately dependency-free
// (only `performance.now()` and `console.table`) so it works unmodified in any JS context this
// app runs in: the main thread, solver.worker.ts, and the dedicated sim Worker threads
// (simExecutor.worker.ts).
//
// Lives in src/helpers/, not src/sim/ or src/solver/, because src/solver/solveConfig.ts must
// never import from src/sim/ (see solver.worker.ts's header comment on that boundary) and this
// utility needs to instrument both sides.
//
// This is investigative tooling, not a permanent feature: record/time/timeAsync/mark never
// throw and never log on their own - only an explicit `.log()` call produces console output, so
// adding spans to existing code paths causes zero behavior or output change for callers/tests
// that don't ask for a summary.
export interface PerfSummaryRow {
	name: string;
	count: number;
	totalMs: number;
	avgMs: number;
	minMs: number;
	maxMs: number;
	pctOfTotal: number;
}

interface SpanStats {
	count: number;
	totalMs: number;
	minMs: number;
	maxMs: number;
}

export class PerfTrace {
	private spans = new Map<string, SpanStats>();

	/** Records one occurrence of `name` taking `ms` milliseconds. */
	record(name: string, ms: number): void {
		const existing = this.spans.get(name);
		if (existing) {
			existing.count += 1;
			existing.totalMs += ms;
			existing.minMs = Math.min(existing.minMs, ms);
			existing.maxMs = Math.max(existing.maxMs, ms);
		} else {
			this.spans.set(name, { count: 1, totalMs: ms, minMs: ms, maxMs: ms });
		}
	}

	/** Times a synchronous `fn`, recording its duration under `name` even if it throws. */
	time<T>(name: string, fn: () => T): T {
		const stop = this.mark(name);
		try {
			return fn();
		} finally {
			stop();
		}
	}

	/** Times an async `fn`, recording its duration under `name` even if it rejects. */
	async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
		const stop = this.mark(name);
		try {
			return await fn();
		} finally {
			stop();
		}
	}

	/**
	 * Lower-level primitive `time`/`timeAsync` are built on: starts a span and returns a `stop()`
	 * that both records it under `name` AND returns the elapsed ms - needed by call sites doing
	 * gap accounting (see `recordGap`), which need each child's actual elapsed value, not just to
	 * have it recorded.
	 */
	mark(name: string): () => number {
		const start = performance.now();
		return () => {
			const ms = performance.now() - start;
			this.record(name, ms);
			return ms;
		};
	}

	/**
	 * Records `${prefix}:unaccounted` = max(0, totalMs - sum(childrenMs)) - the gap-accounting
	 * primitive this plan relies on so a span nobody thought to name shows up as a nonzero,
	 * demanding-attention number instead of silently vanishing into its parent's total. Clamped
	 * to 0 (never negative) since overlapping/jittery timings could otherwise make children sum
	 * to slightly more than the parent.
	 */
	recordGap(prefix: string, totalMs: number, childrenMs: number[]): void {
		const childrenTotal = childrenMs.reduce((a, b) => a + b, 0);
		this.record(`${prefix}:unaccounted`, Math.max(0, totalMs - childrenTotal));
	}

	/**
	 * Current recorded total for `name` (0 if never recorded). Meant for before/after delta
	 * snapshots around concurrent work (e.g. `Promise.all` over independent replicates) where a
	 * gap-check's children can't be captured via a single local `mark()` call site, since several
	 * of them may be recording into the same named span simultaneously from different branches.
	 */
	totalFor(name: string): number {
		return this.spans.get(name)?.totalMs ?? 0;
	}

	/** All recorded spans, sorted by total time descending, with each row's share of the grand
	 * total across every span (not just siblings) - makes the dominant cost immediately obvious. */
	summary(): PerfSummaryRow[] {
		const grandTotal = Array.from(this.spans.values()).reduce(
			(sum, s) => sum + s.totalMs,
			0,
		);
		return Array.from(this.spans.entries())
			.map(([name, s]) => ({
				name,
				count: s.count,
				totalMs: s.totalMs,
				avgMs: s.totalMs / s.count,
				minMs: s.minMs,
				maxMs: s.maxMs,
				pctOfTotal: grandTotal === 0 ? 0 : (s.totalMs / grandTotal) * 100,
			}))
			.sort((a, b) => b.totalMs - a.totalMs);
	}

	/** Prints the current summary as a console.table, optionally labeled. */
	log(label?: string): void {
		if (label) console.log(`[perf] ${label}`);
		console.table(this.summary());
	}

	/** Clears every recorded span. */
	reset(): void {
		this.spans.clear();
	}
}

/** Shared singleton for the common case - safe because each solve runs in its own freshly
 * spawned solver.worker.ts instance (see src/solver/index.ts's solve()), so there's no
 * cross-solve contamination risk within one Worker's lifetime. */
export const perfTrace = new PerfTrace();
