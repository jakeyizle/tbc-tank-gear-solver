import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ClassSelect from "#/components/ClassSelect";
import RaceSelect from "#/components/RaceSelect";

interface CharacterSectionProps {
	classValue: string;
	setClassValue: (value: string) => void;
	raceValue: string;
	setRaceValue: (value: string) => void;
}

export default function CharacterSection({
	classValue,
	setClassValue,
	raceValue,
	setRaceValue,
}: CharacterSectionProps) {
	return (
		<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
			<Typography variant="h6" gutterBottom>
				Character
			</Typography>
			<Stack direction="row" spacing={1}>
				<ClassSelect value={classValue} onChange={setClassValue} />
				<RaceSelect value={raceValue} onChange={setRaceValue} />
			</Stack>
		</Paper>
	);
}
