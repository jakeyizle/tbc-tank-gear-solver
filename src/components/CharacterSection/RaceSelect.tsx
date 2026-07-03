import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { RACE_LABELS } from "#/data/races";

interface RaceSelectProps {
    value: string
    onChange: (value: string) => void
}

export default function RaceSelect({ value, onChange }: RaceSelectProps) {
	return (
		<FormControl>
			<FormLabel id="race-select-label">Race</FormLabel>
			<Select
				labelId="race-select-label"
				id="race-select"
				value={value}
                onChange={(e) => onChange(e.target.value)}
			>
                {Object.entries(RACE_LABELS).map(([id, label]) => (
                    <MenuItem key={id} value={id}>{label}</MenuItem>
                ))}
            </Select>
		</FormControl>
	);
}
