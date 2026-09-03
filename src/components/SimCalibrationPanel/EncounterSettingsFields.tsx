import Stack from "@mui/material/Stack";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import NumberSpinner from "../input/NumberSpinner";

interface EncounterSettingsFieldsProps {
	encounter: SimCalibrationProfile["encounter"];
	onChange: (encounter: SimCalibrationProfile["encounter"]) => void;
}

export default function EncounterSettingsFields({
	encounter,
	onChange,
}: EncounterSettingsFieldsProps) {
	const field = <K extends keyof SimCalibrationProfile["encounter"]>(
		key: K,
	) => ({
		value: encounter[key],
		onValueChange: (v: number | null) =>
			v != null && onChange({ ...encounter, [key]: v }),
	});

	return (
		<Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
			<NumberSpinner
				id="encounter-duration"
				label="Fight duration (s)"
				size="small"
				min={1}
				{...field("duration")}
			/>
			<NumberSpinner
				id="encounter-duration-variation"
				label="Duration variation (s)"
				size="small"
				min={0}
				{...field("durationVariation")}
			/>
			<NumberSpinner
				id="encounter-boss-armor"
				label="Boss armor"
				size="small"
				min={0}
				{...field("bossArmor")}
			/>
			<NumberSpinner
				id="encounter-boss-health"
				label="Boss health"
				size="small"
				min={0}
				{...field("bossHealth")}
			/>
			<NumberSpinner
				id="encounter-min-base-damage"
				label="Min swing damage"
				size="small"
				min={0}
				{...field("minBaseDamage")}
			/>
			<NumberSpinner
				id="encounter-damage-spread"
				label="Damage spread"
				size="small"
				min={0}
				step={0.05}
				{...field("damageSpread")}
			/>
			<NumberSpinner
				id="encounter-swing-speed"
				label="Swing speed (s)"
				size="small"
				min={0.1}
				step={0.1}
				{...field("swingSpeed")}
			/>
		</Stack>
	);
}
