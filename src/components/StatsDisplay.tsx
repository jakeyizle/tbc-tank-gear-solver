import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { calculateStat } from "#/helpers.ts/calculateStat";
import {useSolveConfig} from "#/hooks/useSolveConfig";
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
    const { solveConfig } = useSolveConfig();
    
    if (!solveConfig) {
        return null;
    }
    
    const { raceId, classId } = solveConfig;
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
                            {calculateStat({items, raceId, classId, stat})}
                        </Typography>
                    </Box>
                ))
            }
		</>
	);
}
