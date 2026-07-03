import PublicIcon from "@mui/icons-material/Public";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

interface GlobalSettingsSectionProps {
	children: ReactNode;
}

/**
 * Bounded region for settings that apply to EVERY gear set (as opposed to the
 * per-set settings inside the ranked gear sets below). Children are rendered as
 * labeled subgroups separated by dividers.
 */
export default function GlobalSettingsSection({
	children,
}: GlobalSettingsSectionProps) {
	return (
		<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
			<Stack direction="row" spacing={1} alignItems="center">
				<PublicIcon fontSize="small" color="action" />
				<Typography variant="h6">Global settings</Typography>
			</Stack>
			<Typography variant="body2" color="text.secondary" gutterBottom>
				These settings apply to every gear set.
			</Typography>
			<Stack
				divider={<Divider flexItem />}
				spacing={2}
				sx={{ mt: 1 }}
			>
				{children}
			</Stack>
		</Paper>
	);
}

interface SettingsSubgroupProps {
	title: string;
	description?: string;
	children: ReactNode;
}

/** A labeled subgroup within a settings region. */
export function SettingsSubgroup({
	title,
	description,
	children,
}: SettingsSubgroupProps) {
	return (
		<Box>
			<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
				{title}
			</Typography>
			{description && (
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: "block", mb: 1 }}
				>
					{description}
				</Typography>
			)}
			<Box sx={{ mt: description ? 0 : 1 }}>{children}</Box>
		</Box>
	);
}
