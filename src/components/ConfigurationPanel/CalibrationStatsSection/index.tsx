import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import type { StatName } from "#/solver/types";

interface DisplayCalibrationStat {
	name: StatName;
	label: string;
	checked: boolean;
	// Spell Power and Armor - always calibrated regardless of this toggle (see
	// ALWAYS_INCLUDED_CALIBRATION_STATS), so their chip renders locked/non-interactive rather
	// than implying they can be turned off.
	alwaysIncluded: boolean;
}

interface CalibrationStatsSectionProps {
	stats: DisplayCalibrationStat[];
	onChange: (statName: StatName) => void;
}

// Chip-toggle list for which stats get a +/- perturbation sim during calibration (see
// SolverConfiguration.enabledCalibrationStats) - structurally identical to
// ConsumablesSection/BuffSection (same "label + wrapped row of small Chips" pattern), only
// rendered for sim-backed objective modes (see ConfigCard.tsx).
export default function CalibrationStatsSection({
	stats,
	onChange,
}: CalibrationStatsSectionProps) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				gap: 1.25,
				pt: 1.5,
				borderTop: 1,
				borderColor: "divider",
			}}
		>
			<Box
				component="span"
				sx={{
					font: "500 11px/1 Roboto, sans-serif",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					color: "text.secondary",
					pt: 0.5,
					flexShrink: 0,
				}}
			>
				Calibration stats
			</Box>

			<Stack
				direction="row"
				spacing={0.75}
				flexWrap="wrap"
				useFlexGap
				sx={{ flex: 1 }}
			>
				{stats.map((stat) => {
					const chip = (
						<Chip
							key={stat.name}
							label={
								stat.alwaysIncluded ? (
									<Box
										component="span"
										sx={{
											display: "inline-flex",
											alignItems: "center",
											gap: 0.375,
										}}
									>
										<LockIcon sx={{ fontSize: 12 }} />
										{stat.label}
									</Box>
								) : stat.checked ? (
									`✓ ${stat.label}`
								) : (
									stat.label
								)
							}
							size="small"
							onClick={
								stat.alwaysIncluded ? undefined : () => onChange(stat.name)
							}
							sx={
								stat.alwaysIncluded
									? {
											bgcolor: "rgba(126,163,189,0.1)",
											border: "1px solid rgba(126,163,189,0.35)",
											color: "text.secondary",
											fontWeight: 500,
											cursor: "default",
										}
									: stat.checked
										? {
												bgcolor: "rgba(126,163,189,0.2)",
												border: "1px solid rgba(126,163,189,0.6)",
												color: "primary.light",
												fontWeight: 500,
											}
										: {
												bgcolor: "transparent",
												border: "1px solid rgba(255,255,255,0.14)",
												color: "rgba(255,255,255,0.4)",
												textDecoration: "line-through",
											}
							}
						/>
					);
					return stat.alwaysIncluded ? (
						<Tooltip
							key={stat.name}
							title="Always calibrated - used to normalize every stat's TPS/DTPS/TMI weight"
						>
							{chip}
						</Tooltip>
					) : (
						chip
					);
				})}
			</Stack>
		</Box>
	);
}
