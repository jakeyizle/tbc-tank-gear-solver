import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { BalanceEndpoint } from "#/sim/solveBalancedSimMetric";
import { monoFontFamily } from "#/theme";

interface SimBalanceSliderProps {
	balance: number;
	onChange: (balance: number) => void;
	// Only available once a "Weighted Sim Metrics" solve has actually run - see
	// SolveResult.simBalanceEndpoints. Undefined before the first solve, so the slider itself is
	// always usable; the anchor readout just doesn't appear until there's a real solve to anchor
	// it to.
	endpoints?: { threat: BalanceEndpoint; survival: BalanceEndpoint };
}

function formatAnchor(endpoint: BalanceEndpoint): string {
	const { tps, tmi5 } = endpoint.simMetrics;
	return `${tps.toLocaleString(undefined, { maximumFractionDigits: 0 })} TPS / ${tmi5.toLocaleString(undefined, { maximumFractionDigits: 2 })} TMI-5`;
}

/**
 * A single 0 (Survivability) .. 1 (Threat) dial for the "Weighted Sim Metrics" objective mode -
 * replaced an earlier {tps, dtps, tmi5} ratio entry (SimMetricWeightsEntry.tsx) that had no
 * principled interpretation, since different metrics' calibrated weights live on incomparable
 * scales (see docs/plans/sim-backed-objectives.md's rejection of exactly that "weighted blend"
 * mechanism). This slider is implemented underneath as an epsilon-constraint anchored to two
 * real, sim-verified endpoints (see solveBalancedSimMetric.ts) rather than a raw threshold the
 * user would have no intuition for - the anchor readout below shows those two real endpoints once
 * a solve has produced them, so a slider position is never a bare, uninterpretable number.
 */
export default function SimBalanceSlider({
	balance,
	onChange,
	endpoints,
}: SimBalanceSliderProps) {
	// Local, purely-visual drag position - committing every tick straight to `onChange` round-
	// trips through the full config-list state on every pixel of drag (updateConfig -> setConfigs
	// -> re-render of every ConfigCard), which is what made the slider feel laggy. Dragging now
	// only updates this local state (instant, no parent re-render); the real `onChange` fires once
	// on release (onChangeCommitted) or on a keyboard step (onChange fires once per key press,
	// cheap enough on its own).
	const [liveBalance, setLiveBalance] = useState(balance);
	useEffect(() => setLiveBalance(balance), [balance]);

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
					Threat / Survivability balance
				</Box>
			</Box>

			<Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 0.5 }}>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ flexShrink: 0 }}
				>
					Survivability
				</Typography>
				<Slider
					value={liveBalance}
					onChange={(_e, value) => setLiveBalance(value as number)}
					onChangeCommitted={(_e, value) => onChange(value as number)}
					min={0}
					max={1}
					step={0.01}
					size="small"
					valueLabelDisplay="auto"
					valueLabelFormat={(value) => `${Math.round(value * 100)}% Threat`}
				/>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ flexShrink: 0 }}
				>
					Threat
				</Typography>
			</Box>

			{endpoints && (
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						gap: 2,
						px: 0.5,
					}}
				>
					<Typography
						variant="caption"
						color="text.disabled"
						sx={{ fontFamily: monoFontFamily }}
					>
						100% Survivability: {formatAnchor(endpoints.survival)}
					</Typography>
					<Typography
						variant="caption"
						color="text.disabled"
						sx={{ fontFamily: monoFontFamily }}
					>
						100% Threat: {formatAnchor(endpoints.threat)}
					</Typography>
				</Box>
			)}
		</Box>
	);
}
