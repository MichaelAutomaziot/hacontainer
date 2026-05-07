"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  ButtonBase,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Stack,
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
  HistoryEdu as LegacyIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
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

export const LEGACY_BOARD_NAV = [
  {
    href: "/board/dashboard",
    label: "דשבורד",
    hint: "מצב המערכת + פעולות מומלצות",
    icon: <DashboardIcon />,
  },
  {
    href: "/board/catalog",
    label: "קטלוג",
    hint: "מוצרים, השוואה, הצעות סופר-פארם",
    icon: <CatalogIcon />,
  },
  {
    href: "/board/upload",
    label: "העלאת מוצרים",
    hint: "בחר מוצרים → העלה לסופר-פארם",
    icon: <UploadIcon />,
  },
  {
    href: "/board/settings",
    label: "הגדרות",
    hint: "חוקי תמחור, ערוצים, סנכרונים",
    icon: <SettingsIcon />,
  },
] as const;

export const BOARD_NAV = [
  {
    href: "/board/upload",
    label: "העלאת מוצרים",
    hint: "בדיקה והעלאה בלחיצה אחת",
    icon: <UploadIcon />,
  },
  {
    href: "/board/catalog",
    label: "רשימת מוצרים",
    hint: "מה קיים בכל פלטפורמה",
    icon: <CatalogIcon />,
  },
] as const;

const LEGACY_LINKS = [
  { href: "/shipments", label: "משלוחים" },
  { href: "/pickup-management", label: "ניהול איסוף" },
  { href: "/suppliers", label: "ספקים" },
  { href: "/analytics", label: "אנליטיקה" },
  { href: "/users", label: "משתמשים" },
];

const SIDEBAR_WIDTH = 260;

const initialsOf = (name?: string | null, email?: string | null) => {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || source[0]?.toUpperCase() || "?";
};

const isActiveRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const theme = useTheme();
  const pathname = usePathname() ?? "";

  const isExistAuthentication = useIsExistAuthentication();
  const authProvider = useActiveAuthProvider();
  const translate = useTranslate();
  const { warnWhen, setWarnWhen } = useWarnAboutChange();
  const { mutate: mutateLogout } = useLogout({
    v3LegacyAuthProviderCompatible: Boolean(authProvider?.isLegacy),
  });
  const { data: identity } = useGetIdentity<UserIdentity>();

  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [legacyAnchor, setLegacyAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = () => {
    setUserMenuAnchor(null);
    if (warnWhen) {
      const ok = window.confirm(
        translate("warnWhenUnsavedChanges", "Are you sure you want to leave? You have unsaved changes."),
      );
      if (!ok) return;
      setWarnWhen(false);
    }
    mutateLogout();
  };

  return (
    <Box
      dir="rtl"
      sx={{
        width: SIDEBAR_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#fbfbf9",
        borderInlineStart: `1px solid ${alpha(theme.palette.text.primary, 0.09)}`,
      }}
    >
      {/* Logo header */}
      <Box
        sx={{
          px: 1.7,
          py: 1.6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.07)}`,
        }}
      >
        <Box
          component={Link}
          href="/board/upload"
          onClick={onClose}
          sx={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
            flex: 1,
            minWidth: 0,
          }}
        >
          <img
            src="/brand/hacontainer-logo-transparent.png"
            alt="הקונטיינר"
            style={{ width: 150, height: "auto", maxHeight: 42, objectFit: "contain" }}
          />
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose} sx={{ display: { md: "none" } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Nav */}
      <Stack spacing={0.5} sx={{ p: 1.1, flex: 1, overflowY: "auto" }}>
        {BOARD_NAV.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Tooltip key={item.href} title={item.hint} placement="left" arrow>
              <Box
                component={Link}
                href={item.href}
                prefetch={false}
                onClick={onClose}
                sx={(theme) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 1.1,
                  px: 1.25,
                  py: 1.15,
                  borderRadius: 1.25,
                  textDecoration: "none",
                  color: theme.palette.text.primary,
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.075) : "transparent",
                  border: `1px solid ${active ? alpha(theme.palette.primary.main, 0.18) : "transparent"}`,
                  borderInlineEnd: active ? `3px solid ${theme.palette.primary.main}` : "3px solid transparent",
                  transition: "background-color 160ms ease, border-color 160ms ease, color 160ms ease",
                  "&:hover": {
                    bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.text.primary, 0.035),
                    borderColor: active ? alpha(theme.palette.primary.main, 0.22) : alpha(theme.palette.text.primary, 0.08),
                  },
                })}
              >
                <Box
                  sx={(theme) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 1,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: active
                      ? alpha(theme.palette.primary.main, 0.11)
                      : alpha(theme.palette.text.primary, 0.05),
                    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
                    "& svg": { fontSize: 21 },
                  })}
                >
                  {item.icon}
                </Box>
                <Stack spacing={0} sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ lineHeight: 1.22, fontWeight: 600 }} noWrap>
                    {item.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25, fontSize: "0.74rem" }} noWrap>
                    {item.hint}
                  </Typography>
                </Stack>
              </Box>
            </Tooltip>
          );
        })}

        <Divider sx={{ my: 1.4 }} />

        <Tooltip title="גישה למערכות הישנות (משלוחים, איסופים, ספקים, אנליטיקה, משתמשים)" placement="left" arrow>
          <ButtonBase
            onClick={(e) => setLegacyAnchor(e.currentTarget)}
            sx={(theme) => ({
              display: "flex",
              alignItems: "center",
              gap: 1.4,
              px: 1.4,
              py: 0.85,
              borderRadius: 1.25,
              color: theme.palette.text.secondary,
              "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.04) },
            })}
          >
            <Box
              sx={(theme) => ({
                width: 30,
                height: 30,
                borderRadius: 1,
                display: "grid",
                placeItems: "center",
                bgcolor: alpha(theme.palette.text.primary, 0.05),
                color: theme.palette.text.secondary,
                "& svg": { fontSize: 18 },
              })}
            >
              <LegacyIcon />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              מערכות נוספות
            </Typography>
          </ButtonBase>
        </Tooltip>
      </Stack>

      {/* User block */}
      {isExistAuthentication && (
        <Box
          sx={{
            p: 1.1,
            borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.07)}`,
          }}
        >
          <ButtonBase
            onClick={(e) => setUserMenuAnchor(e.currentTarget)}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 1.2,
              p: 0.9,
              borderRadius: 1.25,
              "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.05) },
            }}
          >
            <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: alpha(theme.palette.secondary.main, 0.92), color: "#fff" }}>
              {initialsOf(identity?.name, identity?.email)}
            </Avatar>
            <Stack spacing={0} sx={{ minWidth: 0, flex: 1, textAlign: "right" }}>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.15 }} noWrap>
                {identity?.name ?? "משתמש"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ direction: "ltr", lineHeight: 1.1 }} noWrap>
                {identity?.email ?? ""}
              </Typography>
            </Stack>
          </ButtonBase>
        </Box>
      )}

      <Menu
        anchorEl={legacyAnchor}
        open={Boolean(legacyAnchor)}
        onClose={() => setLegacyAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
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
            onClick={() => {
              setLegacyAnchor(null);
              onClose?.();
            }}
            sx={{ minWidth: 220 }}
          >
            {link.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Box sx={{ px: 2, pt: 1.2, pb: 0.6, minWidth: 220 }}>
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
    </Box>
  );
}

export function BoardSider() {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile floating menu trigger */}
      {isCompact && (
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: theme.zIndex.appBar,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1.5,
            py: 1,
            bgcolor: "background.paper",
            borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
          }}
        >
          <IconButton onClick={() => setMobileOpen(true)} size="small">
            <MenuIcon />
          </IconButton>
          <img
            src="/brand/hacontainer-logo-transparent.png"
            alt="הקונטיינר"
            style={{ height: 32, objectFit: "contain" }}
          />
          <Box sx={{ width: 34 }} />
        </Box>
      )}

      {/* Desktop permanent sidebar (right-anchored for RTL) */}
      <Drawer
        variant="permanent"
        anchor="right"
        sx={{
          display: { xs: "none", md: "block" },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.drawer,
          "& .MuiDrawer-paper": {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
            position: "fixed",
            top: 0,
            bottom: 0,
            right: 0,
            left: "auto",
            borderInlineEnd: 0,
            borderInlineStart: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
            background: theme.palette.background.paper,
            backgroundImage: "none",
            color: theme.palette.text.primary,
            boxShadow: "none",
            "& .MuiTypography-root": { color: "inherit" },
            "& .MuiSvgIcon-root": { color: "inherit" },
            "& .MuiList-root": { paddingBlock: 0 },
            "& .MuiListItemIcon-root": { color: "inherit", minWidth: 0 },
            "& .MuiListItemText-primary": { color: "inherit" },
            "& .MuiListItemText-secondary": { color: theme.palette.text.secondary },
            "& .MuiCollapse-root .MuiListItemButton-root": { color: "inherit" },
          },
        }}
        PaperProps={{ style: { right: 0, left: "auto" } }}
      >
        <SidebarContent />
      </Drawer>

      {/* Mobile temporary drawer */}
      <Drawer
        variant="temporary"
        anchor="right"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
            background: theme.palette.background.paper,
            backgroundImage: "none",
            color: theme.palette.text.primary,
            boxShadow: "none",
            "& .MuiTypography-root": { color: "inherit" },
            "& .MuiSvgIcon-root": { color: "inherit" },
          },
        }}
        PaperProps={{ style: { right: 0, left: "auto" } }}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </Drawer>
    </>
  );
}

export const BOARD_SIDEBAR_WIDTH = SIDEBAR_WIDTH;
