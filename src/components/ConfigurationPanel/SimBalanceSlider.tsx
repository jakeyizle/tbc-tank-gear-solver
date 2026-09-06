import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

interface SimBalanceSliderProps {
	balance: number;
	onChange: (balance: number) => void;
	survivabilityMetric: "tmi" | "dtps";
	onChangeSurvivabilityMetric: (metric: "tmi" | "dtps") => void;
}

/**
 * A single 0 (Survivability) .. 1 (Threat) dial for the "balanced" objective mode - a plain
 * weighted blend of TPS against whichever metric `survivabilityMetric` names (see
 * calibrateWeights.ts's metricRatiosForBalance), not an epsilon-constraint anchored to real
 * endpoint solves like an earlier version of this component - so there's no endpoint anchor
 * readout here, just the dial itself and the metric choice.
 */
export default function SimBalanceSlider({
	balance,
	onChange,
	survivabilityMetric,
	onChangeSurvivabilityMetric,
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
				<Tooltip
					title="TMI-5 (recommended): burst-risk-weighted, penalizes rare dangerous
						spikes far more than average damage. DTPS: plain average damage taken per
						second."
					arrow
					placement="top"
				>
					<ToggleButtonGroup
						size="small"
						exclusive
						value={survivabilityMetric}
						onChange={(_e, value) =>
							value && onChangeSurvivabilityMetric(value as "tmi" | "dtps")
						}
					>
						<ToggleButton value="tmi" sx={{ px: 1, py: 0.25, fontSize: 11 }}>
							TMI-5
						</ToggleButton>
						<ToggleButton value="dtps" sx={{ px: 1, py: 0.25, fontSize: 11 }}>
							DTPS
						</ToggleButton>
					</ToggleButtonGroup>
				</Tooltip>
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
		</Box>
	);
}
