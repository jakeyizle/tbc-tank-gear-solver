import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { CLASS_LABELS } from "#/data/classes";

interface ClassSelectProps {
	value: string;
	onChange: (value: string) => void;
}

export default function ClassSelect({ value, onChange }: ClassSelectProps) {
	return (
		<Select
			aria-label="Class"
			size="small"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			sx={{ minWidth: 120 }}
		>
			{Object.entries(CLASS_LABELS).map(([id, label]) => (
				<MenuItem key={id} value={id}>
					{label}
				</MenuItem>
			))}
		</Select>
	);
}
