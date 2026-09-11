import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { memo } from "react";
import ClassSelect from "./ClassSelect";
import RaceSelect from "./RaceSelect";

interface CharacterSectionProps {
	classValue: string;
	setClassValue: (value: string) => void;
	raceValue: string;
	setRaceValue: (value: string) => void;
}

// The talent summary and its "Edit talents" popover lived here. Talents are no longer modeled as
// per-rank stat effects - the simulator is the stat authority, and it reads the character's
// talents from the raid profile's talentsString (see src/data/talentString.ts). The talent
// surface belongs with the rest of the sim-shaped character fields; RaidProfileFields moves here
// later in this phase.
//
// Memoized so a parent re-render that doesn't change these props (e.g. routes/index.tsx's
// solveProgress ticks during a solve) skips reconciling this section entirely - see
// useSolverConfigs.ts's note on why fresh handler identities would otherwise defeat this.
function CharacterSection({
	classValue,
	setClassValue,
	raceValue,
	setRaceValue,
}: CharacterSectionProps) {
	return (
		<Paper
			variant="outlined"
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 1.25,
				px: 1.75,
				py: 1.25,
			}}
		>
			<Typography
				variant="body2"
				sx={{ fontWeight: 500, width: 78, flexShrink: 0 }}
			>
				Character
			</Typography>

			<Stack
				direction="row"
				spacing={1}
				alignItems="center"
				sx={{ flex: 1, minWidth: 0 }}
			>
				<ClassSelect value={classValue} onChange={setClassValue} />
				<RaceSelect value={raceValue} onChange={setRaceValue} />
			</Stack>
		</Paper>
	);
}

export default memo(CharacterSection);
