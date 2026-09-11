import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { memo, useState } from "react";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import CalibrationSettingsFields from "./CalibrationSettingsFields";
import EncounterSettingsFields from "./EncounterSettingsFields";
import HealingModelFields from "./HealingModelFields";

interface SimCalibrationPanelProps {
	profile: SimCalibrationProfile;
	onChange: (profile: SimCalibrationProfile) => void;
}

/**
 * How the calibration sim is RUN - iteration counts, the encounter it runs against, and the
 * healing model - as opposed to who the character is, which now lives in CharacterSection.
 *
 * The raid profile used to be in here too, behind this accordion and its "only used by Weighted
 * Sim Metrics" caption. That stopped being true in Phase 2 (its buffs, debuffs, consumables and
 * talent string are what the measured LinearStatModel is derived from, so they shape every
 * solve), so it moved to the character surface. What is left genuinely is calibration-only,
 * except the encounter's target level, which also sets the attacker level the stat model is
 * measured against.
 *
 * Collapsed by default since most solves never touch it; unedited settings reproduce today's
 * fixed v1 calibration profile exactly.
 */
// Memoized so a parent re-render that doesn't change these props (e.g. routes/index.tsx's
// solveProgress ticks during a solve) skips reconciling this panel - see useSolverConfigs.ts's
// note on why fresh handler identities would otherwise defeat this.
function SimCalibrationPanel({ profile, onChange }: SimCalibrationPanelProps) {
	const [expanded, setExpanded] = useState(false);

	return (
		<Paper variant="outlined" sx={{ p: 2 }}>
			<Box
				onClick={() => setExpanded((prev) => !prev)}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.5,
					cursor: "pointer",
				}}
			>
				<IconButton size="small" sx={{ p: 0 }}>
					{expanded ? (
						<ExpandLessIcon fontSize="small" />
					) : (
						<ExpandMoreIcon fontSize="small" />
					)}
				</IconButton>
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
					Advanced: Sim Calibration Profile
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ ml: "auto" }}
				>
					Mostly "Weighted Sim Metrics"; target level affects every solve
				</Typography>
			</Box>

			<Collapse in={expanded}>
				<Stack spacing={2} sx={{ mt: 2 }}>
					<Stack spacing={0.5}>
						<Typography variant="overline" color="text.secondary">
							Calibration
						</Typography>
						<CalibrationSettingsFields
							calibration={profile.calibration}
							onChange={(calibration) => onChange({ ...profile, calibration })}
						/>
					</Stack>

					<Divider />

					<Stack spacing={0.5}>
						<Typography variant="overline" color="text.secondary">
							Encounter
						</Typography>
						<EncounterSettingsFields
							encounter={profile.encounter}
							onChange={(encounter) => onChange({ ...profile, encounter })}
						/>
					</Stack>

					<Divider />

					<Stack spacing={0.5}>
						<Typography variant="overline" color="text.secondary">
							Healing Model
						</Typography>
						<HealingModelFields
							healingModel={profile.healingModel}
							onChange={(healingModel) =>
								onChange({ ...profile, healingModel })
							}
						/>
					</Stack>
				</Stack>
			</Collapse>
		</Paper>
	);
}

export default memo(SimCalibrationPanel);
