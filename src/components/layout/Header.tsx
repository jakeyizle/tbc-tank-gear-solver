import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Link } from '@tanstack/react-router'
import { APP_NAME } from '#/constants'

export default function Header() {
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{
            color: 'text.primary',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          {APP_NAME}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Button component={Link} to="/about" color="inherit">
          About
        </Button>
      </Toolbar>
    </AppBar>
  )
}
