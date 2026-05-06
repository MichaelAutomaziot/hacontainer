'use client';

import { alpha, Box, Typography, Button, Paper } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface UnauthorizedProps {
  message?: string;
}

export default function Unauthorized({ message }: UnauthorizedProps) {
  const router = useRouter();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        p: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: { xs: 3, md: 5 },
          textAlign: 'center',
          maxWidth: 450,
          width: '100%',
        }}
      >
        <Box
          sx={(theme) => ({
            width: 80,
            height: 80,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.error.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.error.main, 0.18)}`,
          })}
        >
          <LockIcon sx={{ fontSize: 40, color: 'error.main' }} />
        </Box>

        <Typography variant="h4" gutterBottom fontWeight={600}>
          גישה נדחתה
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {message || 'אין לך הרשאות לצפות בעמוד זה. רק משתמשים עם הרשאת מנהל יכולים לגשת לעמוד זה.'}
        </Typography>

        <Button
          variant="contained"
          onClick={() => router.push('/dashboard')}
          size="large"
        >
          חזור ללוח הבקרה
        </Button>
      </Paper>
    </Box>
  );
}
