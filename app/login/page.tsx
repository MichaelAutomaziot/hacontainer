"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Google as GoogleIcon,
  Inventory2 as InventoryIcon,
  Login as LoginIcon,
  Storefront as StorefrontIcon,
  Sync as SyncIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { hebrewTranslations } from "@/locales/he";
import { supabaseClient } from "@/utils/supabase/client";

const LOGIN_TIMEOUT_MS = 15_000;

const withTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), LOGIN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export default function LoginPage() {
  const _router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await withTimeout(
        supabaseClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        "ההתחברות נמשכת יותר מדי זמן. בדוק חיבור או נסה שוב."
      );

      if (signInError) throw signInError;

      const redirect =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect")
          : null;
      const target = redirect && redirect.startsWith("/") ? redirect : "/dashboard";
      // Hard nav: cookie is set, browser shows its own progress, avoids running
      // middleware + Refine boot twice (router.replace + router.refresh).
      window.location.assign(target);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "שגיאה בהתחברות");
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await withTimeout(
        supabaseClient.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        }),
        "פתיחת Google נמשכת יותר מדי זמן. נסה שוב."
      );
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err.message || "שגיאה בהתחברות עם Google");
      setIsGoogleLoading(false);
    }
  };

  const handleTogglePassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowPassword(!showPassword);
  };

  return (
    <>
      {(isLoading || isGoogleLoading) && (
        <LinearProgress
          color="primary"
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1500,
            height: 3,
          }}
        />
      )}
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          px: 2,
          py: { xs: 3, md: 6 },
          position: "relative",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 1120,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "0.95fr 1.05fr" },
            gap: { xs: 2, md: 3 },
            alignItems: "stretch",
          }}
        >
          <Paper
            sx={{
              p: { xs: 2.5, md: 4 },
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: { md: 560 },
              bgcolor: "rgba(38, 31, 32, 0.98)",
              color: "#f7fbf8",
              position: "relative",
              overflow: "hidden",
              backgroundImage:
                "linear-gradient(135deg, rgba(193,32,38,.62), rgba(255,255,255,.08)), linear-gradient(180deg, #2b2324, #171415)",
              "&:before": {
                content: '""',
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,.06) 1px, transparent 1px)",
                backgroundSize: "30px 30px",
                maskImage: "linear-gradient(180deg, rgba(0,0,0,.82), transparent)",
              },
            }}
          >
            <Stack spacing={2.5} sx={{ position: "relative" }}>
              <Box
                sx={{
                  width: { xs: 190, sm: 230 },
                  height: 84,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "rgba(255,255,255,0.94)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.55), 0 18px 36px rgba(0,0,0,.22)",
                  overflow: "hidden",
                }}
              >
                <Box
                  component="img"
                  src="/brand/hacontainer-logo-transparent.png"
                  alt="הקונטיינר"
                  sx={{ width: "88%", height: "74%", objectFit: "contain" }}
                />
              </Box>
              <Box>
                <Typography variant="h3" sx={{ color: "#fff", mb: 1 }}>
                  מערכת הניהול של הקונטיינר
                </Typography>
                <Typography variant="body1" sx={{ color: "rgba(247,251,248,.72)", maxWidth: 390 }}>
                  מרכז העבודה לסנכרון קטלוג הקונטיינר, פערי Super-Pharm, תור פיילוט וניהול תפעולי.
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1.3} sx={{ mt: 4, position: "relative" }}>
              {[
                { icon: <InventoryIcon />, label: "קטלוג", value: "הקונטיינר" },
                { icon: <StorefrontIcon />, label: "Marketplace", value: "Super-Pharm" },
                { icon: <SyncIcon />, label: "סנכרון", value: "Konimbo" },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    p: 1.35,
                    bgcolor: "rgba(255,255,255,.08)",
                    border: "1px solid rgba(255,255,255,.16)",
                    borderRadius: 2,
                    color: "#fff",
                    boxShadow: "none",
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      {item.icon}
                      <Typography variant="body2" sx={{ color: "rgba(247,251,248,.72)" }}>
                        {item.label}
                      </Typography>
                    </Stack>
                    <Typography variant="subtitle2" sx={{ color: "#fff" }}>
                      {item.value}
                    </Typography>
                  </Stack>
                </Box>
              ))}
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label="RTL" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.28)" }} variant="outlined" />
                <Chip label="Ops" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.28)" }} variant="outlined" />
                <Chip label="Live sync" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.28)" }} variant="outlined" />
              </Stack>
            </Stack>
          </Paper>

          <Paper
            sx={{
              p: { xs: 2.5, md: 4 },
              minHeight: { md: 560 },
              display: "flex",
              alignItems: "center",
            }}
          >
            <Box sx={{ width: "100%", maxWidth: 460, mx: "auto" }}>
              <Typography variant="overline" color="text.secondary">
                {hebrewTranslations.auth.login}
              </Typography>
              <Typography variant="h4" sx={{ mb: 1 }}>
                {hebrewTranslations.auth.loginTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                הזדהות מאובטחת למערכת הניהול.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2.5 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    type="email"
                    label={hebrewTranslations.forms.labels.email}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="ltr-input"
                  />

                  <TextField
                    type={showPassword ? "text" : "password"}
                    label={hebrewTranslations.forms.labels.password}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="ltr-input"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={handleTogglePassword}
                            onMouseDown={(event) => event.preventDefault()}
                            edge="end"
                            aria-label="toggle password visibility"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Button
                    type="submit"
                    size="large"
                    fullWidth
                    color="primary"
                    variant="contained"
                    disabled={isLoading}
                    startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                    sx={{
                      py: 1.5,
                      mt: 0.5,
                      fontSize: "1.05rem",
                      fontWeight: 900,
                      color: "#ffffff !important",
                      letterSpacing: 0,
                    }}
                  >
                    {isLoading ? "מתחבר..." : hebrewTranslations.auth.loginButton}
                  </Button>
                </Stack>
              </form>

              <Divider sx={{ my: 3 }}>{hebrewTranslations.auth.login}</Divider>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                startIcon={isGoogleLoading ? <CircularProgress size={18} /> : <GoogleIcon />}
                sx={{ py: 1.4 }}
              >
                {isGoogleLoading ? "מתחבר..." : "התחברות עם Google"}
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </>
  );
}
