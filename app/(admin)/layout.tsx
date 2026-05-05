'use client';

import { Suspense, useMemo } from 'react';
import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/nextjs-router';
import { ThemedLayoutV2, RefineSnackbarProvider, notificationProvider } from '@refinedev/mui';
import { authProvider } from '@/providers/auth-provider';
import { dataProvider } from '@/providers/data-provider';
import { accessControlProvider } from '@/providers/access-control-provider';
import { hebrewTranslations as t } from '@/locales/he';
import { WorkbenchSider } from '@/components/layout/WorkbenchSider';
import { RouteLoading } from '@/components/shared/RouteLoading';

const SiderTitle = ({ collapsed }: { collapsed?: boolean }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: collapsed ? 0 : '10px',
      fontFamily: 'Rubik, Assistant, sans-serif',
      fontSize: collapsed ? '0.94rem' : '1.08rem',
      fontWeight: 800,
      padding: collapsed ? '0 8px' : '0 16px',
      color: '#f7fbf8',
      whiteSpace: 'nowrap',
      width: '100%',
    }}
  >
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: collapsed ? 42 : 132,
        height: collapsed ? 42 : 52,
        borderRadius: 8,
        background: 'rgba(255,255,255,.96)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.72), 0 12px 24px rgba(0,0,0,.2)',
        flex: '0 0 auto',
        overflow: 'hidden',
      }}
    >
      <img
        src={collapsed ? '/brand/hacontainer-mark.png' : '/brand/hacontainer-logo-transparent.png'}
        alt="הקונטיינר"
        style={{
          width: collapsed ? 34 : 124,
          height: collapsed ? 34 : 44,
          objectFit: 'contain',
        }}
      />
    </span>
    {!collapsed && (
      <span style={{ display: 'grid', lineHeight: 1.05 }}>
        <span>מערכת ניהול</span>
        <span style={{ fontFamily: 'Assistant, sans-serif', fontSize: 12, fontWeight: 700, opacity: 0.66 }}>
          מרכז ניהול קטלוג ותפעול
        </span>
      </span>
    )}
  </div>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const resources = useMemo(() => [
            // === סנכרון סופר-פארם — main flow ===
            { name: 'pilot-group', meta: { label: t.pilot.nav.pilotGroup } },
            {
              name: 'dashboard',
              list: '/dashboard',
              meta: { parent: 'pilot-group', label: t.nav.dashboard },
            },
            {
              name: 'sync_jobs',
              list: '/sync',
              meta: {
                parent: 'pilot-group',
                label: t.pilot.nav.syncCenter,
                canDelete: false,
              },
            },
            {
              name: 'catalog_matches',
              list: '/comparison',
              meta: {
                parent: 'pilot-group',
                label: t.pilot.nav.comparison,
              },
            },
            {
              name: 'pilot',
              list: '/pilot',
              meta: { parent: 'pilot-group', label: t.pilot.nav.pilotQueue },
            },
            {
              name: 'products',
              create: '/products/new',
              list: '/products/new',
              meta: { parent: 'pilot-group', label: t.products.formTitle?.new ?? 'הזנת מוצר חדש' },
            },

            // === קטלוג ===
            { name: 'catalog-group', meta: { label: t.pilot.nav.catalogGroup } },
            {
              name: 'inventory',
              list: '/inventory',
              show: '/inventory/show/:id',
              meta: {
                parent: 'catalog-group',
                label: t.pilot.nav.inventoryHaContainer,
              },
            },
            {
              name: 'superpharm_offers_raw',
              list: '/superpharm',
              meta: {
                parent: 'catalog-group',
                label: t.pilot.nav.superpharmOffers,
              },
            },
            {
              name: 'categories',
              list: '/categories',
              meta: {
                parent: 'catalog-group',
                label: t.pilot.nav.categoriesSP,
              },
            },

            // === תפעול ===
            { name: 'ops-group', meta: { label: t.pilot.nav.opsGroup } },
            {
              name: 'pricing_rules',
              list: '/settings/rules',
              edit: '/settings/rules/edit/:id',
              create: '/settings/rules/create',
              meta: {
                parent: 'ops-group',
                label: t.pilot.nav.pricingRules,
              },
            },
            {
              name: 'operator_custom_fields',
              list: '/settings/operator',
              meta: {
                parent: 'ops-group',
                label: t.pilot.nav.operatorSettings,
              },
            },

            // === אחר — לוגיסטיקה ופנימי ===
            { name: 'logistics-group', meta: { label: t.pilot.nav.logisticsGroup } },
            {
              name: 'shipments',
              list: '/shipments',
              create: '/shipments/create',
              edit: '/shipments/edit/:id',
              show: '/shipments/show/:id',
              meta: {
                parent: 'logistics-group',
                label: t.nav.shipments,
                canDelete: true,
              },
            },
            {
              name: 'pickup-management',
              list: '/pickup-management',
              meta: { parent: 'logistics-group', label: t.nav.pickupManagement },
            },
            {
              name: 'suppliers',
              list: '/suppliers',
              meta: { parent: 'logistics-group', label: t.nav.suppliers },
            },
            {
              name: 'analytics',
              list: '/analytics',
              meta: { parent: 'logistics-group', label: t.nav.analytics },
            },
            {
              name: 'users',
              list: '/users',
              edit: '/users/edit/:id',
              show: '/users/show/:id',
              meta: { parent: 'logistics-group', label: t.nav.users },
            },
            // Hidden routes — files kept on disk, dropped from sidebar:
            //   /payment-links, /peri-queue, /pilot/report
            //   (note: /products/* exposed via the `products` resource above)
          ], []);

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
            <ThemedLayoutV2
              Sider={WorkbenchSider}
              initialSiderCollapsed={false}
              Title={SiderTitle}
            >
              {children}
            </ThemedLayoutV2>
          </Suspense>
        </Refine>
      </RefineSnackbarProvider>
  );
}
