import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export default function LoadingResultsPlaceholder() {
	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				flexDirection: "column",
				height: "100vh",
			}}
		>
			<CircularProgress aria-label="Loading…" />
		</Box>
	);
}
