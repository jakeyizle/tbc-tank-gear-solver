import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
	ENCOUNTER_PRESETS,
	findMatchingPresetId,
} from "#/sim/encounterPresets";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import NumberSpinner from "../input/NumberSpinner";

const CUSTOM_PRESET_ID = "custom";

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

	const selectedPresetId = findMatchingPresetId(encounter) ?? CUSTOM_PRESET_ID;

	return (
		<Stack spacing={1.5}>
			<Stack direction="row" spacing={1} alignItems="center">
				<Typography variant="body2" sx={{ minWidth: 60 }} noWrap>
					Preset
				</Typography>
				<Select
					size="small"
					value={selectedPresetId}
					onChange={(e) => {
						const preset = ENCOUNTER_PRESETS.find(
							(p) => p.id === e.target.value,
						);
						if (preset) onChange(preset.values);
					}}
					sx={{ minWidth: 220 }}
				>
					{ENCOUNTER_PRESETS.map((preset) => (
						<MenuItem key={preset.id} value={preset.id}>
							{preset.name}
						</MenuItem>
					))}
					<MenuItem value={CUSTOM_PRESET_ID} disabled>
						Custom
					</MenuItem>
				</Select>
			</Stack>
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
		</Stack>
	);
}
