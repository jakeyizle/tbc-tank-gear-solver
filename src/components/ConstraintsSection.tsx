import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CritRadioGroup from "#/components/CritRadioGroup";
import UncrushableRadioGroup from "#/components/UncrushableRadioGroup";

interface ConstraintsSectionProps {
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	onUpdateConstraints: (
		uncritabilitySetting: number,
		uncrushabilitySetting: number
	) => void;
}

export default function ConstraintsSection({
	uncritabilitySetting,
	uncrushabilitySetting,
	onUpdateConstraints,
}: ConstraintsSectionProps) {
	return (
		<Box>
			<Typography variant="subtitle2" sx={{ mb: 1.5 }}>
				Constraints
			</Typography>
			<Stack direction="row" spacing={3}>
				<CritRadioGroup
					onChange={(val) =>
						onUpdateConstraints(val, uncrushabilitySetting)
					}
					uncritabilitySetting={uncritabilitySetting}
				/>
				<UncrushableRadioGroup
					onChange={(val) =>
						onUpdateConstraints(uncritabilitySetting, val)
					}
					uncrushabilitySetting={uncrushabilitySetting}
				/>
			</Stack>
		</Box>
	);
}
