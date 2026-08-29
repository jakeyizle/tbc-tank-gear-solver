import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
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

function talentSummary(talents: ModifierSource[]): string {
	const spent = talents.filter((t) => (t.rank || 0) > 0);
	if (spent.length === 0) return "No talents selected";
	return spent.map((t) => `${t.name} ${t.rank}`).join(" · ");
}

export default function CharacterSection({
	classValue,
	setClassValue,
	raceValue,
	setRaceValue,
	talents,
	setTalents,
}: CharacterSectionProps) {
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

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
			<Typography variant="body2" sx={{ fontWeight: 500, width: 78, flexShrink: 0 }}>
				Character
			</Typography>

			<Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
				<ClassSelect value={classValue} onChange={setClassValue} />
				<RaceSelect value={raceValue} onChange={setRaceValue} />
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{talentSummary(talents)}
				</Typography>
			</Stack>

			<Typography
				variant="body2"
				color="primary"
				sx={{ cursor: "pointer", flexShrink: 0 }}
				onClick={(e) => setAnchorEl(e.currentTarget)}
			>
				Edit talents
			</Typography>

			<Popover
				open={Boolean(anchorEl)}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
			>
				<Box sx={{ p: 2, maxWidth: 480 }}>
					<TalentSection talents={talents} setTalents={setTalents} />
				</Box>
			</Popover>
		</Paper>
	);
}
