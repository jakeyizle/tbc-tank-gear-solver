import { STAT_LABELS } from "#/solver/types";
import type { Stat } from "#/solver/types";

export function formatStatList(stats: Stat[]): string {
	return stats
		.filter((s) => s.value !== 0)
		.map((s) => {
			const sign = s.type === "multiplier" ? "" : s.value > 0 ? "+" : "";
			const value =
				s.type === "multiplier"
					? `${(s.value * 100).toFixed(0)}%`
					: Number.isInteger(s.value)
						? s.value
						: s.value.toFixed(2);
			return `${sign}${value} ${STAT_LABELS[s.name]}`;
		})
		.join(", ");
}
