import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";

const radioValues = [
    {value:0, label: "None"},
    {value:1, label: "Level 72 (5.4%)"},
    {value:2, label: "Level 73 (5.6%)"},
]

interface CritRadioGroupProps {
    onChange: (value: number) => void;
    uncritabilitySetting: number
}

export default function CritRadioGroup({uncritabilitySetting, onChange}: CritRadioGroupProps) {

    const handleChange = (event: React.SyntheticEvent<Element, Event>) => {
        const target = event.target as HTMLInputElement;                
        onChange(Number(target.value));
    }

	return (
		<FormControl>
			<FormLabel id="crit-radio-buttons-group-label">Crit Reduction</FormLabel>
			<RadioGroup
				aria-labelledby="crit-radio-buttons-group-label"
				name="crit-radio-buttons-group"
                value={uncritabilitySetting}
                onChange={handleChange}
			>
                {radioValues.map((radio) => (
                    <FormControlLabel key={radio.value} value={radio.value} control={<Radio />} label={radio.label} />
                ))}				
			</RadioGroup>
		</FormControl>
	);
}
