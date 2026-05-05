"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  alpha,
  Box,
  ButtonBase,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  AccountTree as CategoryIcon,
  Analytics as AnalyticsIcon,
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
  Compare as CompareIcon,
  Dashboard as DashboardIcon,
  ExpandLess,
  ExpandMore,
  Inventory2 as InventoryIcon,
  LocalShipping as ShipmentsIcon,
  LocalShippingOutlined as PickupIcon,
  Logout as LogoutIcon,
  Payment as PaymentIcon,
  People as UsersIcon,
  PictureAsPdf as ReportIcon,
  PlaylistAddCheck as PilotIcon,
  RuleFolder as RulesIcon,
  ShoppingBasket as PeriIcon,
  Store as SuppliersIcon,
  Storefront as SuperPharmIcon,
  Sync as SyncIcon,
  Tune as OperatorIcon,
  Category as ProductsIcon,
} from "@mui/icons-material";
import {
  useActiveAuthProvider,
  useGetIdentity,
  useIsExistAuthentication,
  useLogout,
  useTranslate,
  useWarnAboutChange,
} from "@refinedev/core";
import { type RefineThemedLayoutV2SiderProps, useThemedLayoutContext } from "@refinedev/mui";
import { hebrewTranslations as t } from "@/locales/he";
import { canList, setCachedRole } from "@/providers/access-control-provider";
import type { UserIdentity } from "@/types/user";

type NavItem = {
  label: string;
  href: string;
  resource: string;
  icon: React.ReactNode;
  hint: string;
};

type NavGroup = {
  key: string;
  label: string;
  subtitle: string;
  accent: string;
  items: NavItem[];
};

const EXPANDED_WIDTH = 304;
const COLLAPSED_WIDTH = 76;

const navGroups: NavGroup[] = [
  {
    key: "pilot",
    label: t.pilot.nav.pilotGroup,
    subtitle: "ניהול הזרימה: משיכה, השוואה, העלאה",
    accent: "#e04c4a",
    items: [
      { label: t.nav.dashboard, href: "/dashboard", resource: "dashboard", icon: <DashboardIcon />, hint: "מצב סנכרון ומדדים" },
      { label: t.pilot.nav.syncCenter, href: "/sync", resource: "sync_jobs", icon: <SyncIcon />, hint: "מרכז סנכרון — כפתור העלאה ראשי" },
      { label: t.pilot.nav.comparison, href: "/comparison", resource: "catalog_matches", icon: <CompareIcon />, hint: "השוואה ובדיקה ידנית" },
      { label: t.pilot.nav.pilotQueue, href: "/pilot", resource: "pilot", icon: <PilotIcon />, hint: "תור העלאה (מפורט)" },
    ],
  },
  {
    key: "catalog",
    label: t.pilot.nav.catalogGroup,
    subtitle: "המוצרים והקטגוריות",
    accent: "#c12026",
    items: [
      { label: t.pilot.nav.inventoryHaContainer, href: "/inventory", resource: "inventory", icon: <InventoryIcon />, hint: "קטלוג HaContainer (מקור אמת)" },
      { label: t.pilot.nav.superpharmOffers, href: "/superpharm", resource: "superpharm_offers_raw", icon: <SuperPharmIcon />, hint: "הצעות סופר-פארם" },
      { label: t.pilot.nav.categoriesSP, href: "/categories", resource: "categories", icon: <CategoryIcon />, hint: "עץ קטגוריות SP" },
    ],
  },
  {
    key: "ops",
    label: t.pilot.nav.opsGroup,
    subtitle: "תמחור והגדרות",
    accent: "#9b8c8b",
    items: [
      { label: t.pilot.nav.pricingRules, href: "/settings/rules", resource: "pricing_rules", icon: <RulesIcon />, hint: "חוקי תמחור" },
      { label: t.pilot.nav.operatorSettings, href: "/settings/operator", resource: "operator_custom_fields", icon: <OperatorIcon />, hint: "שדות מפעיל ו-AF01" },
    ],
  },
  {
    key: "logistics",
    label: t.pilot.nav.logisticsGroup,
    subtitle: "תפעול קיים",
    accent: "#d19a61",
    items: [
      { label: t.nav.shipments, href: "/shipments", resource: "shipments", icon: <ShipmentsIcon />, hint: "רשימת משלוחים" },
      { label: t.nav.pickupManagement, href: "/pickup-management", resource: "pickup-management", icon: <PickupIcon />, hint: "איסופים מוכנים" },
      { label: t.nav.suppliers, href: "/suppliers", resource: "suppliers", icon: <SuppliersIcon />, hint: "ניהול ספקים" },
      { label: t.nav.analytics, href: "/analytics", resource: "analytics", icon: <AnalyticsIcon />, hint: "אנליטיקת משלוחים" },
      { label: t.nav.users, href: "/users", resource: "users", icon: <UsersIcon />, hint: "הרשאות ומשתמשים" },
    ],
  },
];

// Workflow shortcut shown at the bottom of the sidebar.
const workflow = [
  { href: "/sync", label: "1. מרכז סנכרון" },
  { href: "/comparison", label: "2. בדיקה ידנית" },
  { href: "/pilot", label: "3. תור העלאה" },
];

const isActiveRoute = (pathname: string, href: string) => {
  if (href === "/dashboard") return pathname === "/" || pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

const WorkbenchSiderImpl = ({ Title }: RefineThemedLayoutV2SiderProps) => {
  const pathname = usePathname();
  const theme = useTheme();
  const translate = useTranslate();
  const isExistAuthentication = useIsExistAuthentication();
  const authProvider = useActiveAuthProvider();
  const { warnWhen, setWarnWhen } = useWarnAboutChange();
  const { mutate: mutateLogout } = useLogout({
    v3LegacyAuthProviderCompatible: Boolean(authProvider?.isLegacy),
  });
  const {
    siderCollapsed,
    setSiderCollapsed,
    mobileSiderOpen,
    setMobileSiderOpen,
  } = useThemedLayoutContext();

  const { data: identity } = useGetIdentity<UserIdentity>();
  const role = identity?.role;

  // Share role with the access-control cache so Refine's `can()` doesn't
  // re-fetch from the DB on subsequent permission checks.
  useEffect(() => {
    if (role) setCachedRole(role);
  }, [role]);

  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canList(role, item.resource)),
      }))
      .filter((group) => group.items.length > 0);
  }, [role]);

  const activeGroupKey = useMemo(() => {
    return visibleGroups.find((group) =>
      group.items.some((item) => isActiveRoute(pathname, item.href)),
    )?.key;
  }, [pathname, visibleGroups]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((group) => [group.key, true])),
  );

  const width = siderCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const toggleGroup = (key: string) => {
    if (siderCollapsed) {
      setSiderCollapsed(false);
      setOpenGroups((prev) => ({ ...prev, [key]: true }));
      return;
    }

    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  const handleLogout = () => {
    if (warnWhen) {
      const confirmed = window.confirm(
        translate("warnWhenUnsavedChanges", "Are you sure you want to leave? You have unsaved changes."),
      );
      if (!confirmed) return;
      setWarnWhen(false);
    }

    mutateLogout();
  };

  const closeMobile = useCallback(() => setMobileSiderOpen(false), [setMobileSiderOpen]);

  const renderNav = () => (
    <Stack spacing={1.1} sx={{ px: siderCollapsed ? 1 : 1.35, py: 1.2 }}>
      {visibleGroups.map((group) => {
        const activeInGroup = group.key === activeGroupKey;
        const isOpen = openGroups[group.key] ?? false;

        return (
          <Box
            key={group.key}
            sx={{
              borderRadius: 2,
              border: siderCollapsed ? "none" : `1px solid ${alpha("#ffffff", activeInGroup ? 0.17 : 0.07)}`,
              background: siderCollapsed
                ? "transparent"
                : activeInGroup
                  ? `linear-gradient(135deg, ${alpha(group.accent, 0.14)}, ${alpha("#ffffff", 0.06)})`
                  : alpha("#ffffff", 0.035),
              overflow: "hidden",
            }}
          >
            {siderCollapsed ? (
              <Tooltip title={`${group.label} · ${group.subtitle}`} placement="left" arrow>
                <ButtonBase
                  onClick={() => toggleGroup(group.key)}
                  aria-label={`פתח ${group.label}`}
                  sx={{
                    width: "100%",
                    display: "grid",
                    placeItems: "center",
                    py: 0.75,
                    borderRadius: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 30,
                      height: 3,
                      borderRadius: 999,
                      bgcolor: group.accent,
                      opacity: activeInGroup ? 1 : 0.48,
                    }}
                  />
                </ButtonBase>
              </Tooltip>
            ) : (
              <ButtonBase
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isOpen}
                aria-controls={`sider-group-${group.key}`}
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 1.25,
                  py: 1.05,
                  textAlign: "right",
                }}
              >
                <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 30,
                      borderRadius: 999,
                      bgcolor: group.accent,
                      boxShadow: activeInGroup ? `0 0 18px ${alpha(group.accent, 0.7)}` : "none",
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ color: "#fff", lineHeight: 1.15 }}>
                      {group.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(247,251,248,.58)" }}>
                      {group.subtitle}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={0.7} alignItems="center">
                  <Chip
                    label={group.items.length}
                    size="small"
                    sx={{
                      height: 22,
                      color: "#fff",
                      bgcolor: alpha(group.accent, 0.18),
                      border: `1px solid ${alpha(group.accent, 0.22)}`,
                    }}
                  />
                  {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </Stack>
              </ButtonBase>
            )}

            <Collapse id={`sider-group-${group.key}`} in={siderCollapsed || isOpen} timeout="auto">
              <Stack spacing={0.35} sx={{ px: siderCollapsed ? 0 : 0.7, pb: siderCollapsed ? 0.35 : 0.75 }}>
                {group.items.map((item) => {
                  const active = isActiveRoute(pathname, item.href);

                  return (
                    <Tooltip
                      key={item.href}
                      title={siderCollapsed ? `${item.label} · ${item.hint}` : item.hint}
                      placement="left"
                      arrow
                    >
                      <Box
                        component={Link}
                        href={item.href}
                        prefetch
                        onClick={closeMobile}
                        sx={{
                          display: "grid",
                          gridTemplateColumns: siderCollapsed ? "1fr" : "34px 1fr",
                          alignItems: "center",
                          gap: 1,
                          minHeight: siderCollapsed ? 44 : 42,
                          px: siderCollapsed ? 0 : 1,
                          borderRadius: 1.5,
                          color: active ? "#ffffff" : "rgba(247,251,248,.78)",
                          background: active
                            ? `linear-gradient(135deg, ${alpha(group.accent, 0.26)}, ${alpha("#ffffff", 0.11)})`
                            : "transparent",
                          boxShadow: active ? `inset -3px 0 0 ${group.accent}` : "none",
                          transition: "background-color 160ms ease, color 160ms ease, transform 160ms ease",
                          textDecoration: "none",
                          "&:hover": {
                            color: "#fff",
                            bgcolor: alpha("#ffffff", 0.09),
                            transform: "translateX(-2px)",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            mx: siderCollapsed ? "auto" : 0,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: 1.35,
                            color: active ? group.accent : "rgba(247,251,248,.7)",
                            bgcolor: active ? alpha(group.accent, 0.12) : alpha("#ffffff", 0.045),
                            "& .MuiSvgIcon-root": { fontSize: 21 },
                          }}
                        >
                          {item.icon}
                        </Box>

                        {!siderCollapsed && (
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 850, lineHeight: 1.16 }} noWrap>
                              {item.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "rgba(247,251,248,.52)" }} noWrap>
                              {item.hint}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );

  const content = (
    <Box
      sx={{
        width,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        color: "#f7fbf8",
        background:
          "linear-gradient(180deg, rgba(38,31,32,.995), rgba(22,19,20,.99)), linear-gradient(135deg, rgba(193,32,38,.24), transparent 42%, rgba(255,255,255,.06))",
      }}
    >
      <Box
        sx={{
          height: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: siderCollapsed ? "center" : "space-between",
          px: siderCollapsed ? 1 : 1.5,
          borderBottom: `1px solid ${alpha("#ffffff", 0.09)}`,
        }}
      >
        {Title ? (
          <Title collapsed={siderCollapsed} />
        ) : (
          <Typography variant="subtitle1">הקונטיינר</Typography>
        )}

        {!siderCollapsed && (
          <Tooltip title="כווץ תפריט" arrow>
            <IconButton size="small" onClick={() => setSiderCollapsed(true)} sx={{ color: "#fff" }}>
              <CollapseIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {siderCollapsed && (
        <Tooltip title="פתח תפריט" placement="left" arrow>
          <IconButton
            size="small"
            onClick={() => setSiderCollapsed(false)}
            sx={{
              width: 34,
              height: 34,
              mx: "auto",
              mt: 1,
              color: "#fff",
              bgcolor: alpha("#ffffff", 0.08),
            }}
          >
            <ExpandIcon />
          </IconButton>
        </Tooltip>
      )}

      {!siderCollapsed && (
        <Box sx={{ px: 1.5, pt: 1.5 }}>
          <Box
            sx={{
              p: 1.3,
              borderRadius: 2,
              border: `1px solid ${alpha("#ffffff", 0.1)}`,
              bgcolor: alpha("#ffffff", 0.055),
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box>
                <Typography variant="overline" sx={{ color: "rgba(247,251,248,.52)" }}>
                  נתיב עבודה
                </Typography>
                <Typography variant="subtitle2" sx={{ color: "#fff" }}>
                  מקטלוג ועד העלאה
                </Typography>
              </Box>
              <Chip label="LIVE" size="small" sx={{ color: "#fff", bgcolor: "#c12026", fontWeight: 900 }} />
            </Stack>

            <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {workflow.map((step) => (
                <Box
                  key={step.href}
                  component={Link}
                  href={step.href}
                  prefetch
                  onClick={closeMobile}
                  sx={{
                    px: 0.9,
                    py: 0.45,
                    borderRadius: 1.2,
                    color: isActiveRoute(pathname, step.href) ? "#fff" : "rgba(247,251,248,.76)",
                    bgcolor: isActiveRoute(pathname, step.href) ? "#c12026" : alpha("#ffffff", 0.07),
                    fontSize: 12,
                    fontWeight: 850,
                    textDecoration: "none",
                  }}
                >
                  {step.label}
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", py: 0.6 }}>
        {renderNav()}
      </Box>

      <Box sx={{ p: siderCollapsed ? 1 : 1.5, borderTop: `1px solid ${alpha("#ffffff", 0.09)}` }}>
        {isExistAuthentication && (
          <Tooltip title={translate("buttons.logout", "Logout")} placement="left" arrow>
            <ButtonBase
              onClick={handleLogout}
              sx={{
                width: "100%",
                minHeight: 42,
                borderRadius: 1.5,
                display: "grid",
                gridTemplateColumns: siderCollapsed ? "1fr" : "34px 1fr",
                gap: 1,
                alignItems: "center",
                px: siderCollapsed ? 0 : 1,
                color: "rgba(247,251,248,.76)",
                "&:hover": {
                  color: "#fff",
                  bgcolor: alpha(theme.palette.error.main, 0.16),
                },
              }}
            >
              <Box sx={{ width: 34, height: 34, mx: siderCollapsed ? "auto" : 0, display: "grid", placeItems: "center" }}>
                <LogoutIcon fontSize="small" />
              </Box>
              {!siderCollapsed && (
                <Typography variant="body2" sx={{ fontWeight: 850, textAlign: "right" }}>
                  {translate("buttons.logout", t.nav.logout)}
                </Typography>
              )}
            </ButtonBase>
          </Tooltip>
        )}
        {!siderCollapsed && (
          <>
            <Divider sx={{ my: 1.2, borderColor: alpha("#ffffff", 0.08) }} />
            <Typography variant="caption" sx={{ color: "rgba(247,251,248,.45)" }}>
              טיפ: התחילו ב־השוואה, העבירו לפיילוט, ואז בדקו סנכרון.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <Box
        sx={{
          width: { md: width },
          display: { xs: "none", md: "block" },
          flexShrink: 0,
          transition: "width 220ms ease",
        }}
      />

      {/* Using inline `style` (not sx) bypasses stylis-plugin-rtl, so values
          are applied verbatim. `right: 0` parks the sider on the visual right
          edge regardless of theme/plugin shenanigans. */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: "auto",
          zIndex: 1200,
        }}
      >
        <Drawer
          anchor="right"
          variant="temporary"
          open={mobileSiderOpen}
          onClose={closeMobile}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" } }}
          PaperProps={{
            sx: { width: EXPANDED_WIDTH, maxWidth: "86vw", overflow: "hidden" },
            style: { right: 0, left: "auto" },
          }}
        >
          {content}
        </Drawer>

        <Drawer
          anchor="right"
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width,
              overflow: "hidden",
              transition: "width 220ms ease",
              borderLeft: `1px solid ${alpha("#ffffff", 0.12)}`,
            },
          }}
          PaperProps={{ style: { right: 0, left: "auto" } }}
        >
          {content}
        </Drawer>
      </nav>
    </>
  );
};

export const WorkbenchSider = memo(WorkbenchSiderImpl);
