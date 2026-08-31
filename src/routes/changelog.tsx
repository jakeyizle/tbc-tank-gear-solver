import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { createFileRoute } from '@tanstack/react-router'
import { changelog } from '#/data/changelog'

export const Route = createFileRoute('/changelog')({
  component: Changelog,
})

function Changelog() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3}>
          <Stack spacing={0.5}>
            <Typography variant="h4" component="h1" fontWeight={700}>
              Changelog
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Current version: v{__APP_VERSION__}
            </Typography>
          </Stack>

          {changelog.map((entry) => (
            <Stack key={entry.version} spacing={1}>
              <Typography variant="h6" component="h2" fontWeight={600}>
                v{entry.version}{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  {entry.date}
                </Typography>
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 3 }}>
                {entry.changes.map((change) => (
                  <Typography key={change} component="li">
                    {change}
                  </Typography>
                ))}
              </Box>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Container>
  )
}
