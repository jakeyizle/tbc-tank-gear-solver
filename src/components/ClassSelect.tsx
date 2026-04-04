import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

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
                <MenuItem value={'1'}>Warrior</MenuItem>
                <MenuItem value={'2'}>Paladin</MenuItem>
                <MenuItem value={'11'}>Druid</MenuItem>
            </Select>
		</FormControl>
	);
}
