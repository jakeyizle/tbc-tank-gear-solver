import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

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
                <MenuItem value={"1"}>Human</MenuItem>
                <MenuItem value={"2"}>Orc</MenuItem>
				<MenuItem value={"3"}>Dwarf</MenuItem>
				<MenuItem value={"4"}>Night Elf</MenuItem>
				<MenuItem value={"5"}>Undead</MenuItem>
				<MenuItem value={"6"}>Tauren</MenuItem>
				<MenuItem value={"7"}>Gnome</MenuItem>
                <MenuItem value={"8"}>Troll</MenuItem>
				<MenuItem value={"10"}>Blood Elf</MenuItem>
				<MenuItem value={"11"}>Draenei</MenuItem>
            </Select>
		</FormControl>
	);
}
