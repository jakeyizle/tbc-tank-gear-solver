import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

export default function EmptyResultsPlaceholder() {
	return (
		<Paper elevation={1} sx={{ p: 2 }}>
			<Typography variant="body2" color="text.secondary" align="center">
				Run "Solve All" to see results
			</Typography>
		</Paper>
	);
}
