import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { getStatFromItem } from "#/helpers.ts/getStatFromItem";
import type { LPItem, StatName } from "#/solver/types";

interface StatsDisplayProps {
	items: LPItem[];
	stats: StatName[];
	header: string;
}

export default function StatsDisplay({
	items,
	stats,
	header,
}: StatsDisplayProps) {
	return (
		<>
			<Box sx={{ display: "flex", justifyContent: "space-between" }}>
				<Typography variant="h6">{header}</Typography>
			</Box>
            {
                stats.map((stat) => (
                    <Box key={stat} sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                            {stat}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                            {items.reduce(
                                (acc, item) => acc + (getStatFromItem(item, stat) || 0),
                                0,
                            )}
                        </Typography>
                    </Box>
                ))
            }
		</>
	);
}
