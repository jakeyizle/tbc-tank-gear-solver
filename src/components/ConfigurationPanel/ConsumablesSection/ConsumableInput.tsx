import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";

interface ConsumableInputProps {
	name: string;
	isChecked: boolean;
	onChange: () => void;
}

export default function ConsumableInput({
	name,
	isChecked,
	onChange,
}: ConsumableInputProps) {
	return (
		<FormControlLabel
			control={
				<Checkbox size="small" checked={isChecked} onChange={onChange} />
			}
			label={<Typography variant="body2">{name}</Typography>}
		/>
	);
}
