import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ModifierSource } from "#/solver/types";
import ClassSelect from "./ClassSelect";
import RaceSelect from "./RaceSelect";
import { TalentSection } from "./TalentSection";

interface CharacterSectionProps {
	classValue: string;
	setClassValue: (value: string) => void;
	raceValue: string;
	setRaceValue: (value: string) => void;
	talents: ModifierSource[];
	setTalents: (talents: ModifierSource[]) => void;
}

export default function CharacterSection({
	classValue,
	setClassValue,
	raceValue,
	setRaceValue,
	talents,
	setTalents,
}: CharacterSectionProps) {
	return (
		<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
			<Typography variant="h6" gutterBottom>
				Character
			</Typography>
			<Grid spacing={1} container>
				<Grid size={2}>
					<ClassSelect value={classValue} onChange={setClassValue} />
				</Grid>
				<Grid size={2}>
					<RaceSelect value={raceValue} onChange={setRaceValue} />
				</Grid>
				<Grid size={8}>
					<TalentSection talents={talents} setTalents={setTalents} />
				</Grid>
			</Grid>
		</Paper>
	);
}
