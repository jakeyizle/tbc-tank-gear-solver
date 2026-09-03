import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={2}>
          <Typography variant="h4" component="h1" fontWeight={700}>
            About
          </Typography>

          <Typography>
            This is a gear optimization tool for Protection Paladin tanks in
            World of Warcraft: The Burning Crusade (TBC). Paste your gear
            pool, configure talents, buffs, and constraints for one or more
            sets, and the solver selects the optimal item, enchant, and gem
            combination for each using Linear Programming.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            Scope &amp; limitations
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            <Typography component="li">
              Only Protection Paladin is supported — other classes have no
              data yet.
            </Typography>
            <Typography component="li">
              Item, enchant, and gem data is scoped to TBC phases; you choose
              which phase's data to solve against.
            </Typography>
            <Typography component="li">
              You supply the gear pool: paste a WowSims Exporter addon export
              (JSON). A full character export also pre-fills class, race, and
              talents.
            </Typography>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600}>
            Credits
          </Typography>
          <Typography>
            Item data and icons courtesy of{' '}
            <Link href="https://www.wowhead.com/tbc" target="_blank" rel="noopener noreferrer">
              Wowhead
            </Link>
            . This is an unofficial fan-made tool, not affiliated with or
            endorsed by Blizzard Entertainment.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
