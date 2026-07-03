import LockIcon from "@mui/icons-material/Lock";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { CLASS_LABELS } from "#/data/classes";
import { RACE_LABELS } from "#/data/races";
import { analyzeItemInput } from "#/helpers/parseItemInput";

interface GlobalSettingsSummaryProps {
	classValue: string;
	raceValue: string;
	itemInput: string;
	areEnchantsGemsLocked: boolean;
}

export default function GlobalSettingsSummary({
	classValue,
	raceValue,
	itemInput,
	areEnchantsGemsLocked,
}: GlobalSettingsSummaryProps) {
	const analysis = useMemo(() => analyzeItemInput(itemInput), [itemInput]);

	const parts = [
		CLASS_LABELS[classValue],
		RACE_LABELS[raceValue],
		analysis.status === "valid"
			? `${analysis.count} ${analysis.count === 1 ? "item" : "items"} loaded`
			: "No gear pool loaded",
	].filter(Boolean);

	return (
		<Paper variant="outlined" sx={{ px: 2, py: 1, mb: 2 }}>
			<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
				<Typography variant="body2" color="text.secondary">
					{parts.join(" · ")}
				</Typography>
				{areEnchantsGemsLocked && (
					<Stack direction="row" spacing={0.5} alignItems="center">
						<LockIcon fontSize="inherit" color="action" />
						<Typography variant="body2" color="text.secondary">
							Enchants locked
						</Typography>
					</Stack>
				)}
			</Stack>
		</Paper>
	);
}
