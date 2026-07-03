import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

export interface StatDisplay {
	name: string;
	value: number;
	unit?: "%";
}

interface StatsGroupProps {
	stats: StatDisplay[];
	header: string;
}

export default function StatsGroup({ stats, header }: StatsGroupProps) {
	const [expanded, setExpanded] = useState(true);

	return (
		<Box>
			<Box
				onClick={() => setExpanded((prev) => !prev)}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.5,
					cursor: "pointer",
					mb: 1,
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
			</Box>

			<Collapse in={expanded}>
				<Stack spacing={0.75}>
					{stats.map((stat) => (
						<Box
							key={stat.name}
							sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
						>
							<Typography variant="body2" color="text.secondary">
								{stat.name}
							</Typography>
							<Typography variant="body2" fontWeight="medium">
								{stat.value.toFixed(stat.value % 1 === 0 ? 0 : 2)}
								{stat.unit}
							</Typography>
						</Box>
					))}
				</Stack>
			</Collapse>
		</Box>
	);
}
