import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import type { Buff } from "#/solver/types";

interface BuffsSectionProps {
	buffs: Buff[];
	onBuffChange: (buffId: string) => void;
}

export default function BuffSection({ buffs, onBuffChange }: BuffsSectionProps) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				gap: 1.25,
			}}
		>
			<Box
				component="span"
				sx={{
					font: "500 11px/1 Roboto, sans-serif",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					color: "text.secondary",
					pt: 0.5,
					flexShrink: 0,
				}}
			>
				Buffs
			</Box>

			<Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
				{buffs.map((buff) => (
					<Chip
						key={buff.id}
						label={buff.checked ? `✓ ${buff.name}` : buff.name}
						size="small"
						onClick={() => onBuffChange(buff.id)}
						sx={buff.checked
							? {
									bgcolor: "rgba(201,154,84,0.2)",
									border: "1px solid rgba(201,154,84,0.6)",
									color: "secondary.light",
									fontWeight: 500,
								}
							: {
									bgcolor: "transparent",
									border: "1px solid rgba(255,255,255,0.14)",
									color: "rgba(255,255,255,0.4)",
									textDecoration: "line-through",
								}}
					/>
				))}
			</Stack>
		</Box>
	);
}
