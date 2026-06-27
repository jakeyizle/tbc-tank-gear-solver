import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
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
		<Box>
			<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
				Character
			</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{ display: "block", mb: 1.5 }}
			>
				Who the solver is building gear for.
			</Typography>

			<Stack spacing={2}>
				{/* Identity subgroup */}
				<Box>
					<Typography
						variant="overline"
						color="text.secondary"
						sx={{ display: "block", lineHeight: 1.5 }}
					>
						Identity
					</Typography>
					<Stack direction="row" spacing={1}>
						<Box sx={{ minWidth: 140 }}>
							<ClassSelect value={classValue} onChange={setClassValue} />
						</Box>
						<Box sx={{ minWidth: 140 }}>
							<RaceSelect value={raceValue} onChange={setRaceValue} />
						</Box>
					</Stack>
				</Box>

				{/* Talents subgroup */}
				<Box>
					<Typography
						variant="overline"
						color="text.secondary"
						sx={{ display: "block", lineHeight: 1.5, mb: 0.5 }}
					>
						Talents
					</Typography>
					<TalentSection talents={talents} setTalents={setTalents} />
				</Box>
			</Stack>
		</Box>
	);
}
