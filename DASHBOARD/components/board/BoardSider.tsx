"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Inventory2Outlined as CatalogIcon,
  CloudUploadOutlined as UploadIcon,
  SettingsOutlined as SettingsIcon,
  ManageAccountsOutlined as ProfileIcon,
  Logout as LogoutIcon,
  AppsOutlined as LegacyIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  ChevronLeft as ChevronIcon,
} from "@mui/icons-material";
import { ProfileSettingsDialog } from "@/components/board/ProfileSettingsDialog";
import {
  useActiveAuthProvider,
  useGetIdentity,
  useIsExistAuthentication,
  useLogout,
  useTranslate,
  useWarnAboutChange,
} from "@refinedev/core";
import type { UserIdentity } from "@/types/user";

/* ------------------------------------------------------------------ *
 *  Navigation model — the four boards, in workflow order.
 *  Upload is the primary surface; the rest support it.
 * ------------------------------------------------------------------ */

type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
};

export const BOARD_NAV: readonly NavItem[] = [
  {
    href: "/board/upload",
    label: "העלאת מוצרים",
    hint: "בחירת מוצרים והעלאה לסופר-פארם",
    icon: <UploadIcon />,
  },
  {
    href: "/board/catalog",
    label: "רשימת מוצרים",
    hint: "מלאי, השוואה והצעות סופר-פארם",
    icon: <CatalogIcon />,
  },
  {
    href: "/board/settings",
    label: "הגדרות",
    hint: "חוקי תמחור, ערוצים וסנכרונים",
    icon: <SettingsIcon />,
  },
] as const;

const LEGACY_LINKS = [
  { href: "/shipments", label: "משלוחים" },
  { href: "/pickup-management", label: "ניהול איסוף" },
  { href: "/suppliers", label: "ספקים" },
  { href: "/analytics", label: "אנליטיקה" },
  { href: "/users", label: "משתמשים" },
];

const SIDEBAR_WIDTH = 264;
const LOGO_SRC = "/brand/hacontainer-logo-transparent.png";

const initialsOf = (name?: string | null, email?: string | null) => {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") ||
    source[0]?.toUpperCase() ||
    "?"
  );
};

const isActiveRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);

/* ------------------------------------------------------------------ *
 *  A single navigation row.
 * ------------------------------------------------------------------ */

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Box
      component={Link}
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.5,
        py: 1.15,
        borderRadius: 2,
        textDecoration: "none",
        color: active ? theme.palette.primary.dark : theme.palette.text.primary,
        bgcolor: active ? alpha(theme.palette.primary.main, 0.085) : "transparent",
        transition: "background-color 150ms ease, color 150ms ease",
        "&:hover": {
          bgcolor: active
            ? alpha(theme.palette.primary.main, 0.11)
            : alpha(theme.palette.text.primary, 0.045),
        },
        "&:focus-visible": {
          outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`,
          outlineOffset: 1,
        },
      })}
    >
      <Box
        component="span"
        sx={(theme) => ({
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          color: active ? theme.palette.primary.main : theme.palette.text.secondary,
          "& svg": { fontSize: 22 },
        })}
      >
        {item.icon}
      </Box>
      <Stack spacing={0} sx={{ minWidth: 0 }}>
        <Typography
          variant="subtitle2"
          noWrap
          sx={{ lineHeight: 1.25, fontWeight: active ? 700 : 600 }}
        >
          {item.label}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ lineHeight: 1.3, fontSize: "0.74rem" }}
        >
          {item.hint}
        </Typography>
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 *  Sidebar body — shared between the desktop rail and the mobile drawer.
 * ------------------------------------------------------------------ */

function SidebarBody({ onClose }: { onClose?: () => void }) {
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
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    setUserMenuAnchor(null);
    if (warnWhen) {
      const ok = window.confirm(
        translate(
          "warnWhenUnsavedChanges",
          "Are you sure you want to leave? You have unsaved changes.",
        ),
      );
      if (!ok) return;
      setWarnWhen(false);
    }
    mutateLogout();
  };

  const dividerColor = alpha(theme.palette.text.primary, 0.08);

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: theme.palette.background.paper,
      }}
    >
      {/* Brand */}
      <Box
        sx={{
          px: 2,
          py: 1.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: `1px solid ${dividerColor}`,
        }}
      >
        <Box
          component={Link}
          href="/board/upload"
          onClick={onClose}
          sx={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}
        >
          <img
            src={LOGO_SRC}
            alt="הקונטיינר"
            style={{ width: 148, height: "auto", maxHeight: 40, objectFit: "contain" }}
          />
        </Box>
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label="סגירת תפריט">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Primary navigation */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 1.25, py: 1.5 }}>
        <Typography
          variant="overline"
          sx={{
            display: "block",
            px: 1.5,
            mb: 0.5,
            color: "text.secondary",
            fontSize: "0.68rem",
          }}
        >
          ניווט
        </Typography>
        <Stack spacing={0.5}>
          {BOARD_NAV.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActiveRoute(pathname, item.href)}
              onNavigate={onClose}
            />
          ))}
        </Stack>

        <Divider sx={{ my: 1.75, borderColor: dividerColor }} />

        <ButtonBase
          onClick={(e) => setLegacyAnchor(e.currentTarget)}
          sx={(t) => ({
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            color: t.palette.text.secondary,
            textAlign: "start",
            "&:hover": {
              bgcolor: alpha(t.palette.text.primary, 0.045),
              color: t.palette.text.primary,
            },
          })}
        >
          <LegacyIcon sx={{ fontSize: 21 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
            מערכות נוספות
          </Typography>
          <ChevronIcon sx={{ fontSize: 18, opacity: 0.6 }} />
        </ButtonBase>
      </Box>

      {/* Account */}
      {isExistAuthentication && (
        <Box sx={{ p: 1.25, borderTop: `1px solid ${dividerColor}` }}>
          <ButtonBase
            onClick={(e) => setUserMenuAnchor(e.currentTarget)}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              p: 1,
              borderRadius: 2,
              "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.045) },
            }}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                fontSize: 13,
                fontWeight: 700,
                bgcolor: alpha(theme.palette.secondary.main, 0.92),
                color: "#fff",
              }}
            >
              {initialsOf(identity?.name, identity?.email)}
            </Avatar>
            <Stack spacing={0} sx={{ minWidth: 0, flex: 1, textAlign: "start" }}>
              <Typography variant="subtitle2" noWrap sx={{ lineHeight: 1.2 }}>
                {identity?.name ?? "משתמש"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ direction: "ltr", textAlign: "start", lineHeight: 1.15 }}
              >
                {identity?.email ?? ""}
              </Typography>
            </Stack>
            <ChevronIcon sx={{ fontSize: 18, opacity: 0.6, transform: "rotate(90deg)" }} />
          </ButtonBase>
        </Box>
      )}

      {/* Legacy systems menu */}
      <Menu
        anchorEl={legacyAnchor}
        open={Boolean(legacyAnchor)}
        onClose={() => setLegacyAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
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

      {/* Account menu */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ px: 2, pt: 1.2, pb: 0.6, minWidth: 230 }}>
          <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
            {identity?.name ?? identity?.email ?? "משתמש"}
          </Typography>
          {identity?.email && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ direction: "ltr", display: "block", textAlign: "start" }}
            >
              {identity.email}
            </Typography>
          )}
        </Box>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            setUserMenuAnchor(null);
            setProfileOpen(true);
          }}
        >
          <ProfileIcon fontSize="small" style={{ marginInlineEnd: 8 }} />
          הגדרות פרופיל
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <LogoutIcon fontSize="small" style={{ marginInlineEnd: 8 }} />
          {translate("buttons.logout", "התנתק")}
        </MenuItem>
      </Menu>

      <ProfileSettingsDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 *  Public component: desktop rail (sticky, physical right edge in RTL)
 *  + mobile top bar + temporary drawer.
 * ------------------------------------------------------------------ */

export function BoardSider() {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile: sticky top bar carrying the menu trigger */}
      {isCompact && (
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: theme.zIndex.appBar,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            px: 1.5,
            py: 1,
            bgcolor: "background.paper",
            borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
          }}
        >
          <IconButton onClick={() => setMobileOpen(true)} size="small" aria-label="פתיחת תפריט">
            <MenuIcon />
          </IconButton>
          <img src={LOGO_SRC} alt="הקונטיינר" style={{ height: 30, objectFit: "contain" }} />
          <Box sx={{ width: 34 }} />
        </Box>
      )}

      {/* Desktop: fixed rail, pinned to the inline-start edge — which in this
          RTL document is the physical right. `inset-inline-start` is a logical
          property, so stylis-plugin-rtl leaves it alone (the old bug was a
          physical `right: 0` in sx getting flipped to `left: 0`). The matching
          gutter on <main> is `padding-inline-start` for the same reason. */}
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          width: SIDEBAR_WIDTH,
          position: "fixed",
          insetInlineStart: 0,
          top: 0,
          height: "100dvh",
          zIndex: theme.zIndex.appBar,
          borderInlineEnd: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        }}
      >
        <SidebarBody />
      </Box>

      {/* Mobile: temporary drawer, locked to the physical right edge */}
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
            backgroundImage: "none",
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            boxShadow: theme.shadows[8],
          },
        }}
        PaperProps={{ style: { right: 0, left: "auto" } }}
      >
        <SidebarBody onClose={() => setMobileOpen(false)} />
      </Drawer>
    </>
  );
}

export const BOARD_SIDEBAR_WIDTH = SIDEBAR_WIDTH;
