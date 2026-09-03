import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import CalibrationSettingsFields from "./CalibrationSettingsFields";
import EncounterSettingsFields from "./EncounterSettingsFields";
import HealingModelFields from "./HealingModelFields";
import RaidProfileFields from "./RaidProfileFields";

interface SimCalibrationPanelProps {
	profile: SimCalibrationProfile;
	onChange: (profile: SimCalibrationProfile) => void;
}

/**
 * Everything the "Weighted Sim Metrics" objective mode's calibration sim uses that isn't the
 * gear itself - see src/types/SimCalibrationProfile.ts. Collapsed by default since most solves
 * never touch this; unedited settings reproduce today's fixed v1 calibration profile exactly.
 */
export default function SimCalibrationPanel({
	profile,
	onChange,
}: SimCalibrationPanelProps) {
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
					Only used by "Weighted Sim Metrics"
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

					<Divider />

					<RaidProfileFields
						raidProfile={profile.raidProfile}
						onChange={(raidProfile) => onChange({ ...profile, raidProfile })}
					/>
				</Stack>
			</Collapse>
		</Paper>
	);
}
