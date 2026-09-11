import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { memo } from "react";
import type { RaidProfileSettings } from "#/types/SimCalibrationProfile";
import ClassSelect from "./ClassSelect";
import RaceSelect from "./RaceSelect";
import RaidProfileFields from "./RaidProfileFields";

interface CharacterSectionProps {
	classValue: string;
	setClassValue: (value: string) => void;
	raceValue: string;
	setRaceValue: (value: string) => void;
	raidProfile: RaidProfileSettings;
	onRaidProfileChange: (raidProfile: RaidProfileSettings) => void;
}

// The character: who they are, and everything about them the simulator reads.
//
// RaidProfileFields moved here out of "Advanced: Sim Calibration Profile", where it was
// collapsed by default and captioned "Only used by Weighted Sim Metrics". That caption stopped
// being true in Phase 2: the raid profile's buffs, debuffs, consumables and talent string are
// what the measured LinearStatModel is derived from, so they shape EVERY solve. Leaving the
// talent string and the entire buff list hidden behind an accordion labelled as irrelevant was
// the same problem as the inert buff checkboxes it replaced, one level down.
//
// The talent summary and its "Edit talents" popover that used to live here are gone with the
// per-rank talent stat model; RaidProfileFields carries the talent string the sim actually reads.
//
// Memoized so a parent re-render that doesn't change these props (e.g. routes/index.tsx's
// solveProgress ticks during a solve) skips reconciling this section entirely - see
// useSolverConfigs.ts's note on why fresh handler identities would otherwise defeat this.
function CharacterSection({
	classValue,
	setClassValue,
	raceValue,
	setRaceValue,
	raidProfile,
	onRaidProfileChange,
}: CharacterSectionProps) {
	return (
		<Paper variant="outlined" sx={{ px: 1.75, py: 1.25 }}>
			<Stack
				direction="row"
				alignItems="center"
				gap={1.25}
				sx={{ minWidth: 0 }}
			>
				<Typography
					variant="body2"
					sx={{ fontWeight: 500, width: 78, flexShrink: 0 }}
				>
					Character
				</Typography>
				<ClassSelect value={classValue} onChange={setClassValue} />
				<RaceSelect value={raceValue} onChange={setRaceValue} />
			</Stack>

			<Divider sx={{ my: 1.5 }} />

			<RaidProfileFields
				raidProfile={raidProfile}
				onChange={onRaidProfileChange}
			/>
		</Paper>
	);
}

export default memo(CharacterSection);
