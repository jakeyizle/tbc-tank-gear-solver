import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import { analyzeItemInput } from "#/helpers.ts/parseItemInput";
import { SettingsSubgroup } from "#/components/GlobalSettingsSection";

interface ItemInputSectionProps {
	itemInput: string;
	setItemInput: (value: string) => void;
	areEnchantsGemsLocked: boolean;
	setAreEnchantsGemsLocked: (value: boolean) => void;
}

const PLACEHOLDER = `Paste your WowSims Exporter output here, e.g.

{"items":[{"id":28825,"enchant":2673,"gems":[24033]}, ...]}

— or — a comma-separated list of item IDs:

28825, 29011, 28749`;

export default function ItemInputSection({
	itemInput,
	setItemInput,
	areEnchantsGemsLocked,
	setAreEnchantsGemsLocked,
}: ItemInputSectionProps) {
	const analysis = useMemo(() => analyzeItemInput(itemInput), [itemInput]);

	const feedback =
		analysis.status === "valid" ? (
			<Stack direction="row" spacing={0.5} alignItems="center">
				<CheckCircleIcon color="success" fontSize="small" />
				<Typography variant="caption" color="success.main">
					{analysis.count} {analysis.count === 1 ? "item" : "items"} recognized
					{analysis.format === "json" ? " from WowSims export" : ""}
				</Typography>
			</Stack>
		) : analysis.status === "error" ? (
			<Stack direction="row" spacing={0.5} alignItems="center">
				<ErrorOutlineIcon color="error" fontSize="small" />
				<Typography variant="caption" color="error.main">
					{analysis.message}
				</Typography>
			</Stack>
		) : null;

	return (
		<SettingsSubgroup
			title="Gear pool"
			description="The pool of items every gear set draws from."
		>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
				Export your character with the{" "}
				<strong>WowSims Exporter</strong> addon and paste the result below. The
				solver considers every item you provide.
			</Typography>
			<TextField
				label="Gear export or item IDs"
				placeholder={PLACEHOLDER}
				variant="outlined"
				fullWidth
				multiline
				minRows={4}
				maxRows={12}
				value={itemInput}
				onChange={(e) => setItemInput(e.target.value)}
				error={analysis.status === "error"}
				slotProps={{ htmlInput: { spellCheck: false } }}
			/>
			<Box sx={{ minHeight: 24, mt: 0.5 }}>{feedback}</Box>
			<FormControlLabel
				sx={{ mt: 0.5 }}
				control={
					<Checkbox
						size="small"
						checked={areEnchantsGemsLocked}
						onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
					/>
				}
				label="Lock enchants and gems"
			/>
			<FormHelperText sx={{ mt: -0.5 }}>
				Keep the enchants and gems from your export instead of letting the
				solver optimize them.
			</FormHelperText>
		</SettingsSubgroup>
	);
}
