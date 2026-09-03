import Stack from "@mui/material/Stack";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import NumberSpinner from "../input/NumberSpinner";

interface HealingModelFieldsProps {
	healingModel: SimCalibrationProfile["healingModel"];
	onChange: (healingModel: SimCalibrationProfile["healingModel"]) => void;
}

export default function HealingModelFields({
	healingModel,
	onChange,
}: HealingModelFieldsProps) {
	const field = <K extends keyof SimCalibrationProfile["healingModel"]>(
		key: K,
	) => ({
		value: healingModel[key],
		onValueChange: (v: number | null) =>
			v != null && onChange({ ...healingModel, [key]: v }),
	});

	return (
		<Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
			<NumberSpinner
				id="healing-hps"
				label="Incoming HPS"
				size="small"
				min={0}
				{...field("hps")}
			/>
			<NumberSpinner
				id="healing-cadence"
				label="Heal cadence (s)"
				size="small"
				min={0.1}
				step={0.1}
				{...field("cadenceSeconds")}
			/>
			<NumberSpinner
				id="healing-cadence-variation"
				label="Cadence variation"
				size="small"
				min={0}
				step={0.1}
				{...field("cadenceVariation")}
			/>
			<NumberSpinner
				id="healing-absorb-frac"
				label="Absorb fraction"
				size="small"
				min={0}
				max={1}
				step={0.01}
				{...field("absorbFrac")}
			/>
			<NumberSpinner
				id="healing-burst-window"
				label="TMI Burst Window (s)"
				size="small"
				min={1}
				{...field("burstWindow")}
			/>
			<NumberSpinner
				id="healing-inspiration-uptime"
				label="Inspiration uptime"
				size="small"
				min={0}
				max={1}
				step={0.01}
				{...field("inspirationUptime")}
			/>
		</Stack>
	);
}
