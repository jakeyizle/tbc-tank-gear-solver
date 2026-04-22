import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface StatDisplay {
    name: string;
    value: number;
}

interface StatsDisplayProps {
	stats: StatDisplay[];
	header: string;
}

export default function StatsDisplay({
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
                    <Box key={stat.name} sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                            {stat.name}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                            {stat.value.toFixed(stat.value % 1 === 0 ? 0 : 2)}
                        </Typography>
                    </Box>
                ))
            }
		</>
	);
}
