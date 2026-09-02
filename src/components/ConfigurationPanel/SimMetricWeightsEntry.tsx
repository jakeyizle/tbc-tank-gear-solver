import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { monoFontFamily } from "#/theme";

export interface SimMetricWeights {
	tps: number;
	dtps: number;
	tmi5: number;
}

const METRIC_ROWS: { key: keyof SimMetricWeights; label: string }[] = [
	{ key: "tps", label: "TPS" },
	{ key: "dtps", label: "DTPS" },
	{ key: "tmi5", label: "TMI-5" },
];

interface SimMetricWeightsEntryProps {
	weights: SimMetricWeights;
	onChange: (weights: SimMetricWeights) => void;
}

/**
 * Fixed three-row ratio entry for the "Weighted Sim Metrics" objective mode - mirrors
 * StatsEntry.tsx's draft-state/commit-on-blur numeric input pattern, simplified since the set
 * of metrics is fixed (no add/remove affordance needed).
 */
export default function SimMetricWeightsEntry({
	weights,
	onChange,
}: SimMetricWeightsEntryProps) {
	// raw in-progress text for fields being edited, keyed by metric - keeps the input from
	// being reformatted mid-edit until committed on blur (same reasoning as StatsEntry.tsx).
	const [drafts, setDrafts] = useState<
		Partial<Record<keyof SimMetricWeights, string>>
	>({});

	const editValue = (key: keyof SimMetricWeights, newValue: string) => {
		setDrafts((prev) => ({ ...prev, [key]: newValue }));
	};

	const commitValue = (key: keyof SimMetricWeights, rawValue: string) => {
		const parsed = Number(rawValue);
		const value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
		onChange({ ...weights, [key]: value });
		setDrafts((prev) => {
			const next = { ...prev };
			delete next[key];
			return next;
		});
	};

	return (
		<Box display="flex" flexDirection="column" gap={0.75}>
			<Box display="flex" alignItems="center" gap={1.25}>
				<Box
					component="span"
					sx={{
						font: "500 11px/1 Roboto, sans-serif",
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: "text.secondary",
					}}
				>
					Sim metric ratios
				</Box>
				<Typography variant="caption" color="text.disabled">
					relative weight per metric — 0 to exclude
				</Typography>
			</Box>

			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: {
						xs: "1fr",
						sm: "repeat(3, 1fr)",
					},
					gap: "2px 20px",
				}}
			>
				{METRIC_ROWS.map(({ key, label }) => (
					<Box
						key={key}
						sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.375 }}
					>
						<Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
							{label}
						</Typography>
						<TextField
							value={drafts[key] ?? weights[key].toFixed(2)}
							onFocus={(e) => e.target.select()}
							onChange={(e) => editValue(key, e.target.value)}
							onBlur={(e) => commitValue(key, e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur();
							}}
							size="small"
							type="number"
							sx={{
								flexShrink: 0,
								width: 80,
								"& .MuiOutlinedInput-root": { pr: 0.5 },
								"& input": {
									fontFamily: monoFontFamily,
									fontSize: 13,
									textAlign: "right",
									py: 0.5,
									px: 0.75,
								},
							}}
							slotProps={{
								htmlInput: { min: 0, step: 0.01 },
							}}
						/>
					</Box>
				))}
			</Box>
		</Box>
	);
}
