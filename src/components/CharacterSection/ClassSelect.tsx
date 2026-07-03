import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { CLASS_LABELS } from "#/data/classes";

interface ClassSelectProps {
    value: string
    onChange: (value: string) => void
}

export default function ClassSelect({ value, onChange }: ClassSelectProps) {
	return (
		<FormControl>
			<FormLabel id="class-select-label">Class</FormLabel>
			<Select
				labelId="class-select-label"
				id="class-select"
				value={value}
                onChange={(e) => onChange(e.target.value)}
			>
                {Object.entries(CLASS_LABELS).map(([id, label]) => (
                    <MenuItem key={id} value={id}>{label}</MenuItem>
                ))}
            </Select>
		</FormControl>
	);
}
