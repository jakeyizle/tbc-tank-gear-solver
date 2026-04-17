import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

interface ItemInputSectionProps {
	itemInput: string;
	setItemInput: (value: string) => void;
	areEnchantsGemsLocked: boolean;
	setAreEnchantsGemsLocked: (value: boolean) => void;
}

export default function ItemInputSection({
	itemInput,
	setItemInput,
	areEnchantsGemsLocked,
	setAreEnchantsGemsLocked,
}: ItemInputSectionProps) {
	return (
		<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
			<Typography variant="h6" gutterBottom>
				Items
			</Typography>
			<TextField
				label="Item IDs"
				variant="outlined"
				fullWidth
				size="small"
				value={itemInput}
				onChange={(e) => setItemInput(e.target.value)}
			/>
			<FormControlLabel
				control={
					<Checkbox
						size="small"
						value={areEnchantsGemsLocked}
						onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
					/>
				}
				label="Lock Enchants and Gems"
			/>
		</Paper>
	);
}
