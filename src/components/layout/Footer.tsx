import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from '@tanstack/react-router'
import { APP_NAME } from '#/constants'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <Box
      component="footer"
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        px: 2,
        py: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant="body2">
        &copy; {year} {APP_NAME}{' '}
        <Link component={RouterLink} to="/changelog" color="inherit">
          v{__APP_VERSION__}
        </Link>
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
        This is an unofficial fan-made tool and is not affiliated with or
        endorsed by Blizzard Entertainment, Inc. World of Warcraft and
        Blizzard Entertainment are trademarks or registered trademarks of
        Blizzard Entertainment, Inc. in the U.S. and/or other countries.
      </Typography>
    </Box>
  )
}
