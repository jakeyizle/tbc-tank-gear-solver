import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";

interface BuffInputProps {
	name: string;
	isChecked: boolean;
	onChange: () => void;
}

export default function BuffInput({
	name,
	isChecked,
	onChange,
}: BuffInputProps) {
	return (
		<FormControlLabel
			control={
				<Checkbox size="small" checked={isChecked} onChange={onChange} />
			}
			label={<Typography variant="body2">{name}</Typography>}
		/>
	);
}
