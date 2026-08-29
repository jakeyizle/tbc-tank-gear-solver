import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { RACE_LABELS } from "#/data/races";

interface RaceSelectProps {
	value: string;
	onChange: (value: string) => void;
}

export default function RaceSelect({ value, onChange }: RaceSelectProps) {
	return (
		<Select
			aria-label="Race"
			size="small"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			sx={{ minWidth: 120 }}
		>
			{Object.entries(RACE_LABELS).map(([id, label]) => (
				<MenuItem key={id} value={id}>
					{label}
				</MenuItem>
			))}
		</Select>
	);
}
