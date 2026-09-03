import Stack from "@mui/material/Stack";
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
		</Stack>
	);
}
