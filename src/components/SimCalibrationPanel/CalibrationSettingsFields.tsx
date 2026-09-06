import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { clearRound1WeightsCache } from "#/sim/round1WeightsCache";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import NumberSpinner from "../input/NumberSpinner";

interface CalibrationSettingsFieldsProps {
	calibration: SimCalibrationProfile["calibration"];
	onChange: (calibration: SimCalibrationProfile["calibration"]) => void;
}

export default function CalibrationSettingsFields({
	calibration,
	onChange,
}: CalibrationSettingsFieldsProps) {
	return (
		<Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
			<NumberSpinner
				id="calibration-iterations"
				label="Sim iterations"
				size="small"
				min={100}
				step={100}
				value={calibration.iterations}
				onValueChange={(v) =>
					v != null && onChange({ ...calibration, iterations: v })
				}
			/>
			<NumberSpinner
				id="calibration-max-rounds"
				label="Max calibration rounds"
				size="small"
				min={1}
				max={20}
				value={calibration.maxRounds}
				onValueChange={(v) =>
					v != null && onChange({ ...calibration, maxRounds: v })
				}
			/>
			<NumberSpinner
				id="calibration-worker-count"
				label="Sim workers (0 = auto)"
				size="small"
				min={0}
				max={16}
				value={calibration.workerCount}
				onValueChange={(v) =>
					v != null && onChange({ ...calibration, workerCount: v })
				}
			/>
			<Tooltip
				title="Runs this many independent calibration batches per round and averages
					them, instead of just one. Reduces noise in the calibrated weights (useful
					for noisy metrics like TMI-5) at the cost of running that many times slower."
				arrow
				placement="top"
			>
				<Box>
					<NumberSpinner
						id="calibration-replicates"
						label="Calibration replicates"
						size="small"
						min={1}
						max={10}
						value={calibration.replicates ?? 1}
						onValueChange={(v) =>
							v != null && onChange({ ...calibration, replicates: v })
						}
					/>
				</Box>
			</Tooltip>
			<Typography
				variant="caption"
				color="primary"
				sx={{ alignSelf: "center", cursor: "pointer" }}
				onClick={() => {
					clearRound1WeightsCache();
				}}
			>
				Clear cached baseline calibration
			</Typography>
		</Stack>
	);
}
