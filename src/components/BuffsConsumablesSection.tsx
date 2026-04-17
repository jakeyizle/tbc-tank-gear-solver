import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ElixirFlaskFormGroup from "#/components/ElixirFlaskFormGroup";

interface BuffsConsumablesSectionProps {
	buffs: {
		markOfTheWild: boolean;
		improvedMotw: boolean;
		blessingOfKings: boolean;
		graceOfAir: boolean;
	};
	consumables: {
		scrollOfAgilityV: boolean;
	};
}

export default function BuffsConsumablesSection({
	buffs,
	consumables,
}: BuffsConsumablesSectionProps) {
	return (
		<Box>
			<Typography variant="subtitle2" sx={{ mb: 1.5 }}>
				Buffs & Consumables
			</Typography>
			<Stack direction="row" spacing={2}>
				<FormGroup>
					<FormLabel sx={{ fontSize: "0.75rem" }}>Buffs</FormLabel>
					<FormControlLabel
						control={<Checkbox size="small" checked={buffs.markOfTheWild} />}
						label={<Typography variant="body2">Mark of the Wild</Typography>}
					/>
					<FormControlLabel
						control={<Checkbox size="small" checked={buffs.improvedMotw} />}
						label={<Typography variant="body2">Improved MotW</Typography>}
					/>
					<FormControlLabel
						control={
							<Checkbox size="small" checked={buffs.blessingOfKings} />
						}
						label={<Typography variant="body2">Blessing of Kings</Typography>}
					/>
					<FormControlLabel
						control={<Checkbox size="small" checked={buffs.graceOfAir} />}
						label={<Typography variant="body2">Grace of Air</Typography>}
					/>
				</FormGroup>
				<Box>
					<FormGroup>
						<FormLabel sx={{ fontSize: "0.75rem" }}>Consumables</FormLabel>
						<FormControlLabel
							control={
								<Checkbox size="small" checked={consumables.scrollOfAgilityV} />
							}
							label={
								<Typography variant="body2">Scroll of Agility V</Typography>
							}
						/>
					</FormGroup>
					<ElixirFlaskFormGroup />
				</Box>
			</Stack>
		</Box>
	);
}
