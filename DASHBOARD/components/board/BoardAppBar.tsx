"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  ButtonBase,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Inventory2 as CatalogIcon,
  CloudUpload as UploadIcon,
  SettingsOutlined as SettingsIcon,
  Logout as LogoutIcon,
  HelpOutline as HelpIcon,
  HistoryEdu as LegacyIcon,
} from "@mui/icons-material";
import {
  useActiveAuthProvider,
  useGetIdentity,
  useIsExistAuthentication,
  useLogout,
  useTranslate,
  useWarnAboutChange,
} from "@refinedev/core";
import type { UserIdentity } from "@/types/user";

export const BOARD_TABS = [
  { value: "dashboard", href: "/board/dashboard", label: "דשבורד", icon: <DashboardIcon fontSize="small" /> },
  { value: "catalog",   href: "/board/catalog",   label: "קטלוג",   icon: <CatalogIcon fontSize="small" /> },
  { value: "upload",    href: "/board/upload",    label: "העלאת מוצרים", icon: <UploadIcon fontSize="small" /> },
  { value: "settings",  href: "/board/settings",  label: "הגדרות מתקדמות", icon: <SettingsIcon fontSize="small" /> },
] as const;

export type BoardTab = (typeof BOARD_TABS)[number]["value"];

const LEGACY_LINKS = [
  { href: "/shipments", label: "משלוחים" },
  { href: "/pickup-management", label: "ניהול איסוף" },
  { href: "/suppliers", label: "ספקים" },
  { href: "/analytics", label: "אנליטיקה" },
  { href: "/users", label: "משתמשים" },
];

const initialsOf = (name?: string | null, email?: string | null) => {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || source[0]?.toUpperCase() || "?";
};

export function BoardAppBar() {
  const theme = useTheme();
  const pathname = usePathname() ?? "";
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));

  const isExistAuthentication = useIsExistAuthentication();
  const authProvider = useActiveAuthProvider();
  const translate = useTranslate();
  const { warnWhen, setWarnWhen } = useWarnAboutChange();
  const { mutate: mutateLogout } = useLogout({
    v3LegacyAuthProviderCompatible: Boolean(authProvider?.isLegacy),
  });
  const { data: identity } = useGetIdentity<UserIdentity>();

  const activeTab: BoardTab | false = useMemo(() => {
    const match = BOARD_TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
    return match ? match.value : false;
  }, [pathname]);

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [legacyAnchor, setLegacyAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = () => {
    setMenuAnchor(null);
    if (warnWhen) {
      const confirmed = window.confirm(
        translate("warnWhenUnsavedChanges", "Are you sure you want to leave? You have unsaved changes."),
      );
      if (!confirmed) return;
      setWarnWhen(false);
    }
    mutateLogout();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "background.paper",
        backgroundImage: "none",
        backdropFilter: "none",
        color: "text.primary",
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 60, md: 68 },
          gap: { xs: 1, md: 2 },
          px: { xs: 1.25, md: 2.5 },
        }}
      >
        {/* Logo + brand */}
        <Box
          component={Link}
          href="/board/dashboard"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.2,
            textDecoration: "none",
            color: "inherit",
            flex: "0 0 auto",
            mr: { md: 1.5 },
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              overflow: "hidden",
            }}
          >
            <img
              src="/brand/hacontainer-mark.png"
              alt="הקונטיינר"
              style={{ width: 30, height: 30, objectFit: "contain" }}
            />
          </Box>
          {!isCompact && (
            <Stack spacing={0} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
                הקונטיינר
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: "0.7rem" }}>
                מרכז ניהול קטלוג ותפעול
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          variant={isCompact ? "scrollable" : "standard"}
          allowScrollButtonsMobile
          scrollButtons={isCompact ? "auto" : false}
          sx={{
            flex: 1,
            minWidth: 0,
            "& .MuiTabs-indicator": {
              bgcolor: theme.palette.primary.main,
              height: 3,
              borderRadius: 999,
            },
            "& .MuiTab-root": {
              minHeight: 60,
              px: { xs: 1.5, md: 2.2 },
              py: 1,
              gap: 0.6,
              color: theme.palette.text.secondary,
              "&.Mui-selected": {
                color: theme.palette.text.primary,
              },
            },
          }}
        >
          {BOARD_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              component={Link}
              href={tab.href}
              prefetch={false}
              icon={tab.icon}
              iconPosition="start"
              label={tab.label}
              wrapped={false}
            />
          ))}
        </Tabs>

        {/* Right actions */}
        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flex: "0 0 auto" }}>
          <Tooltip title="גישה למערכות הישנות (משלוחים, איסוף, ספקים, אנליטיקה, משתמשים)">
            <IconButton
              size="small"
              onClick={(e) => setLegacyAnchor(e.currentTarget)}
              aria-label="מערכות ישנות"
            >
              <LegacyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="עזרה">
            <IconButton
              size="small"
              component="a"
              href="https://github.com/anthropics/claude-code/issues"
              target="_blank"
              rel="noopener"
            >
              <HelpIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {isExistAuthentication && (
            <Tooltip title={identity?.email ?? "משתמש"}>
              <ButtonBase
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                aria-label="תפריט משתמש"
                sx={{
                  borderRadius: 999,
                  p: 0.4,
                  ml: 0.5,
                  "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.05) },
                }}
              >
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    fontSize: 13,
                    bgcolor: theme.palette.secondary.main,
                    color: "#fff",
                  }}
                >
                  {initialsOf(identity?.name, identity?.email)}
                </Avatar>
              </ButtonBase>
            </Tooltip>
          )}
        </Stack>

        <Menu
          anchorEl={legacyAnchor}
          open={Boolean(legacyAnchor)}
          onClose={() => setLegacyAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              מערכות נוספות
            </Typography>
          </Box>
          {LEGACY_LINKS.map((link) => (
            <MenuItem
              key={link.href}
              component={Link}
              href={link.href}
              onClick={() => setLegacyAnchor(null)}
              sx={{ minWidth: 220 }}
            >
              {link.label}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          <Box sx={{ px: 2, pt: 1.2, pb: 0.6, minWidth: 240 }}>
            <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
              {identity?.name ?? identity?.email ?? "משתמש"}
            </Typography>
            {identity?.email && (
              <Typography variant="caption" color="text.secondary" sx={{ direction: "ltr", display: "block" }}>
                {identity.email}
              </Typography>
            )}
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem onClick={handleLogout}>
            <LogoutIcon fontSize="small" style={{ marginInlineEnd: 8 }} />
            {translate("buttons.logout", "התנתק")}
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
