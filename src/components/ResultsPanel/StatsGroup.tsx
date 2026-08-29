import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { monoFontFamily } from "#/theme";

export interface StatDisplay {
	name: string;
	value: number;
	unit?: "%";
	rating?: number;
}

interface StatsGroupProps {
	stats: StatDisplay[];
	header: string;
	showRating?: boolean;
	defaultExpanded?: boolean;
	collapsedSummary?: string;
}

function formatValue(stat: StatDisplay): string {
	const decimals = stat.value % 1 === 0 ? 0 : 2;
	const formatted = stat.value.toLocaleString(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
	return `${formatted}${stat.unit ?? ""}`;
}

export default function StatsGroup({
	stats,
	header,
	showRating = false,
	defaultExpanded = true,
	collapsedSummary,
}: StatsGroupProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	return (
		<Box>
			<Box
				onClick={() => setExpanded((prev) => !prev)}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.5,
					cursor: "pointer",
					mb: expanded ? 1 : 0,
				}}
			>
				<IconButton size="small" sx={{ p: 0 }}>
					{expanded ? (
						<ExpandLessIcon fontSize="small" />
					) : (
						<ExpandMoreIcon fontSize="small" />
					)}
				</IconButton>
				<Typography
					variant="overline"
					color="text.secondary"
					sx={{ lineHeight: 1.5 }}
				>
					{header}
				</Typography>
				{!expanded && collapsedSummary && (
					<Typography
						variant="caption"
						sx={{
							ml: "auto",
							fontFamily: monoFontFamily,
							color: "text.secondary",
						}}
					>
						{collapsedSummary}
					</Typography>
				)}
			</Box>

			<Collapse in={expanded}>
				{showRating ? (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: "1fr 74px 54px",
							rowGap: 0.5,
							columnGap: 1,
						}}
					>
						<span />
						<span />
						<Typography
							variant="caption"
							color="text.disabled"
							sx={{
								textTransform: "uppercase",
								letterSpacing: "0.06em",
								textAlign: "right",
							}}
						>
							rating
						</Typography>
						{stats.map((stat) => (
							<Box key={stat.name} sx={{ display: "contents" }}>
								<Typography variant="body2" color="text.secondary">
									{stat.name}
								</Typography>
								<Typography
									variant="body2"
									sx={{
										fontFamily: monoFontFamily,
										fontWeight: 500,
										textAlign: "right",
									}}
								>
									{formatValue(stat)}
								</Typography>
								<Typography
									variant="caption"
									color="text.disabled"
									sx={{ fontFamily: monoFontFamily, textAlign: "right" }}
								>
									{stat.rating !== undefined
										? Math.round(stat.rating).toLocaleString()
										: "—"}
								</Typography>
							</Box>
						))}
					</Box>
				) : (
					<Stack spacing={0.75}>
						{stats.map((stat) => (
							<Box
								key={stat.name}
								sx={{
									display: "flex",
									justifyContent: "space-between",
									gap: 2,
								}}
							>
								<Typography variant="body2" color="text.secondary">
									{stat.name}
								</Typography>
								<Typography variant="body2" fontWeight="medium">
									{formatValue(stat)}
								</Typography>
							</Box>
						))}
					</Stack>
				)}
			</Collapse>
		</Box>
	);
}
