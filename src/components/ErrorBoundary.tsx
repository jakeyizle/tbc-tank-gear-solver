import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import * as React from 'react'

interface ErrorBoundaryProps {
	children: React.ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: unknown, info: React.ErrorInfo) {
		console.error(error, info);
	}

	render() {
		if (this.state.hasError) {
			return (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 2,
						p: 6,
						textAlign: "center",
					}}
				>
					<Typography variant="h5" fontWeight={700}>
						Something went wrong.
					</Typography>
					<Typography color="text.secondary">
						Please reload the page. If the problem persists, check that your
						gear pool input is valid.
					</Typography>
					<Button variant="contained" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</Box>
			);
		}

		return this.props.children;
	}
}
