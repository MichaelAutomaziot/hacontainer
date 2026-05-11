'use client';

import { Suspense, useMemo } from 'react';
import { Box } from '@mui/material';
import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/nextjs-router';
import { RefineSnackbarProvider, notificationProvider } from '@refinedev/mui';
import { authProvider } from '@/providers/auth-provider';
import { dataProvider } from '@/providers/data-provider';
import { accessControlProvider } from '@/providers/access-control-provider';
import { hebrewTranslations as t } from '@/locales/he';
import { BoardSider, BOARD_SIDEBAR_WIDTH } from '@/components/board/BoardSider';
import { RouteLoading } from '@/components/shared/RouteLoading';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const resources = useMemo(
    () => [
      // === הבורדים החדשים — 4 לוחות ===
      { name: 'board-group', meta: { label: 'בורדים' } },
      {
        name: 'dashboard',
        list: '/board/upload',
        meta: { parent: 'board-group', label: 'דשבורד' },
      },
      // Catalog board hosts inventory + comparison + superpharm + categories.
      {
        name: 'inventory',
        list: '/board/catalog?tab=inventory',
        show: '/inventory/show/:id',
        meta: { parent: 'board-group', label: t.pilot.nav.inventoryHaContainer },
      },
      {
        name: 'catalog_matches',
        list: '/board/catalog?tab=comparison',
        meta: { parent: 'board-group', label: t.pilot.nav.comparison },
      },
      {
        name: 'v_comparison',
        list: '/board/catalog?tab=comparison',
        meta: { parent: 'board-group', label: 'השוואה (תצוגה)' },
      },
      {
        name: 'superpharm_offers_raw',
        list: '/board/catalog?tab=superpharm',
        meta: { parent: 'board-group', label: t.pilot.nav.superpharmOffers },
      },
      {
        name: 'categories',
        list: '/board/catalog?tab=categories',
        meta: { parent: 'board-group', label: t.pilot.nav.categoriesSP },
      },
      // Upload board.
      {
        name: 'pilot',
        list: '/board/upload',
        meta: { parent: 'board-group', label: 'העלאת מוצרים' },
      },
      {
        name: 'sync_jobs',
        list: '/board/settings?tab=jobs',
        meta: { parent: 'board-group', label: 'היסטוריית סנכרונים', canDelete: false },
      },
      {
        name: 'products',
        create: '/products/new',
        list: '/products/new',
        meta: { parent: 'board-group', label: t.products.formTitle?.new ?? 'הזנת מוצר חדש' },
      },
      // Settings board hosts pricing rules + operator + channels.
      {
        name: 'pricing_rules',
        list: '/board/settings?tab=rules',
        edit: '/settings/rules/edit/:id',
        create: '/settings/rules/create',
        meta: { parent: 'board-group', label: t.pilot.nav.pricingRules },
      },
      {
        name: 'operator_custom_fields',
        list: '/board/settings?tab=operator',
        meta: { parent: 'board-group', label: t.pilot.nav.operatorSettings },
      },

      // === Legacy routes — kept active for bookmarks, hidden from primary nav ===
      { name: 'legacy-group', meta: { label: t.pilot.nav.logisticsGroup } },
      {
        name: 'shipments',
        list: '/shipments',
        create: '/shipments/create',
        edit: '/shipments/edit/:id',
        show: '/shipments/show/:id',
        meta: { parent: 'legacy-group', label: t.nav.shipments, canDelete: true },
      },
      {
        name: 'pickup-management',
        list: '/pickup-management',
        meta: { parent: 'legacy-group', label: t.nav.pickupManagement },
      },
      {
        name: 'suppliers',
        list: '/suppliers',
        meta: { parent: 'legacy-group', label: t.nav.suppliers },
      },
      {
        name: 'analytics',
        list: '/analytics',
        meta: { parent: 'legacy-group', label: t.nav.analytics },
      },
      {
        name: 'users',
        list: '/users',
        edit: '/users/edit/:id',
        show: '/users/show/:id',
        meta: { parent: 'legacy-group', label: t.nav.users },
      },
    ],
    [],
  );

  return (
    <RefineSnackbarProvider>
      <Refine
        routerProvider={routerProvider}
        dataProvider={dataProvider}
        authProvider={authProvider}
        accessControlProvider={accessControlProvider}
        notificationProvider={notificationProvider}
        resources={resources}
        options={{
          syncWithLocation: true,
          warnWhenUnsavedChanges: true,
          useNewQueryKeys: true,
          projectId: 'hacontainer-dashboard',
          disableTelemetry: true,
        }}
      >
        <Suspense fallback={<RouteLoading />}>
          {/* RTL shell. The desktop sidebar is `position: fixed` pinned to the
              inline-start (physical right) edge; <main> reserves the matching
              gutter with `padding-inline-start`. Both use logical properties so
              stylis-plugin-rtl can't flip them. On mobile the sidebar collapses
              to a drawer and the gutter goes away. */}
          <Box
            className="admin-shell-wrapper"
            sx={{
              minHeight: '100dvh',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.default',
              boxSizing: 'border-box',
              width: '100%',
              // `clip` (not `hidden`) so this never becomes a scroll container —
              // keeps sticky descendants (mobile top bar, table headers) working.
              overflowX: 'clip',
              paddingInlineStart: { md: `${BOARD_SIDEBAR_WIDTH}px` },
            }}
          >
            <BoardSider />
            <Box
              component="main"
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.default',
                boxSizing: 'border-box',
                overflowX: 'clip',
              }}
            >
              {children}
            </Box>
          </Box>
        </Suspense>
      </Refine>
    </RefineSnackbarProvider>
  );
}
