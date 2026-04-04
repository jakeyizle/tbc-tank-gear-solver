import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";

const radioValues = [
	{ value: 0, label: "None" },
	{ value: 1, label: "Uncrushable (102.4%)" },
];

interface UncrushableRadioGroupProps {
	onChange: (value: number) => void;
	uncrushabilitySetting: number;
}

export default function UncrushableRadioGroup({
	onChange,
	uncrushabilitySetting,
}: UncrushableRadioGroupProps) {
	const handleChange = (event: React.SyntheticEvent<Element, Event>) => {
		const target = event.target as HTMLInputElement;
		onChange(Number(target.value));
	};
	return (
		<FormControl>
			<FormLabel id="uncrushable-radio-buttons-group-label">
				Uncrushable
			</FormLabel>
			<RadioGroup
				aria-labelledby="uncrushable-radio-buttons-group-label"
				name="uncrushable-radio-buttons-group"
				onChange={handleChange}
				value={uncrushabilitySetting}
			>
				{radioValues.map((radio) => (
					<FormControlLabel
						key={radio.value}
						value={radio.value}
						control={<Radio />}
						label={radio.label}
					/>
				))}
			</RadioGroup>
		</FormControl>
	);
}
