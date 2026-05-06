# Refine + Supabase Project Guide
## Lessons Learned & Best Practices

**Purpose**: This document summarizes all patterns, mistakes, and lessons learned from building a Refine admin dashboard with Supabase. Use this as a reference to avoid common pitfalls.

---

## Table of Contents
1. [Project Architecture](#1-project-architecture)
2. [Supabase Configuration](#2-supabase-configuration)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Data Provider & Resource Definition](#4-data-provider--resource-definition)
5. [TypeScript Types & Interfaces](#5-typescript-types--interfaces)
6. [Form Handling Patterns](#6-form-handling-patterns)
7. [Common Mistakes to Avoid](#7-common-mistakes-to-avoid)
8. [Security Considerations](#8-security-considerations)
9. [Performance Optimizations](#9-performance-optimizations)
10. [Code Examples](#10-code-examples)

---

## 1. Project Architecture

### Recommended Folder Structure
```
src/
├── app/
│   ├── (admin)/           # Main admin dashboard (route group)
│   │   ├── [resource]/    # CRUD pages per resource
│   │   │   ├── page.tsx           # List page
│   │   │   ├── create/page.tsx    # Create page
│   │   │   ├── edit/[id]/page.tsx # Edit page
│   │   │   └── show/[id]/page.tsx # Show page
│   │   ├── api/           # Backend API routes
│   │   └── layout.tsx     # Refine provider setup
│   └── (portal)/          # Public-facing pages (separate layout)
├── providers/
│   ├── auth-provider/     # Auth logic
│   ├── data-provider/     # Refine Supabase integration
│   └── access-control-provider/ # RBAC
├── hooks/                 # Custom React hooks
├── components/            # Reusable UI components
├── types/                 # TypeScript type definitions
├── interfaces/            # TypeScript interfaces (same as types)
├── utils/                 # Utility functions
│   └── supabase/         # Supabase client configuration
└── contexts/             # React contexts
```

### Key Files
| File | Purpose |
|------|---------|
| `src/app/(admin)/layout.tsx` | Refine configuration, resources, providers |
| `src/providers/auth-provider/auth-provider.client.ts` | Auth methods (login, logout, etc.) |
| `src/providers/access-control-provider/index.ts` | Role-based access control |
| `src/providers/data-provider/index.ts` | Supabase data provider wrapper |
| `src/utils/supabase/client.ts` | Supabase client instances |
| `src/utils/supabase/middleware.ts` | Route protection middleware |

---

## 2. Supabase Configuration

### CRITICAL: Dual Client Pattern

When using Supabase with Next.js SSR, you need TWO clients:

```typescript
// src/utils/supabase/client.ts

import { createClient } from "@refinedev/supabase";
import { createBrowserClient } from "@supabase/ssr";

// Client 1: For AUTH operations (SSR-compatible, uses cookies)
export const supabaseAuthClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    db: { schema: "your_schema" },
    isSingleton: true, // CRITICAL: Prevents multiple GoTrueClient warning
  }
);

// Client 2: For DATA operations (separate storage key)
export const supabaseBrowserClient = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    db: { schema: "your_schema" },
    auth: {
      persistSession: true,
      storageKey: "your-app-data-client-auth", // DIFFERENT key!
    },
  }
);
```

### WHY Two Clients?
1. **Auth Client**: Uses cookies for SSR middleware to recognize sessions
2. **Data Client**: Used by Refine's data provider for database operations
3. **Different storage keys**: Avoids "Multiple GoTrueClient instances" warning

### Session Synchronization (REQUIRED)
After login, you MUST sync the session to the data client:

```typescript
// In auth-provider login method
const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
  email, password
});

if (data?.session) {
  // CRITICAL: Sync session to data client
  await supabaseBrowserClient.auth.setSession(data.session);
}
```

### Custom Schema Configuration
If using a custom schema (not `public`):

```typescript
// In client configuration
db: { schema: "automaziot" } // or your schema name

// In data fetching (when needed)
await supabaseBrowserClient
  .schema('public')  // Explicitly specify schema
  .from('users')
  .select('role')
```

---

## 3. Authentication & Authorization

### Middleware Setup
```typescript
// src/middleware.ts
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Protected & Public Routes
```typescript
// src/utils/supabase/middleware.ts

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/portal", // Public pages
];

const PUBLIC_API_ROUTES = [
  "/api/public/", // Public APIs
];

// In middleware:
if (isPublicRoute(pathname)) {
  // Allow access
  return response;
}

// Redirect unauthenticated users
if (!user) {
  return NextResponse.redirect(new URL("/login", request.url));
}
```

### Access Control Provider
```typescript
// src/providers/access-control-provider/index.ts

export type UserRole = 'admin' | 'editor' | 'viewer' | 'custom_role';

const rolePermissions: Record<UserRole, Record<string, Action[]>> = {
  admin: {
    '*': ['list', 'create', 'edit', 'show', 'delete'], // Wildcard
  },
  editor: {
    services: ['list', 'create', 'edit', 'show', 'delete'],
    users: ['list', 'show'], // Read-only
  },
  viewer: {
    services: ['list', 'show'],
  },
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const role = await getUserRole();

    // Check wildcard first
    if (rolePermissions[role]['*']?.includes(action)) {
      return { can: true };
    }

    // Check specific resource
    if (rolePermissions[role][resource]?.includes(action)) {
      return { can: true };
    }

    return { can: false, reason: `Unauthorized` };
  },
};
```

### MISTAKE: Role Caching Issues
```typescript
// BAD: Cache without invalidation mechanism
let cachedRole: UserRole | null = null;
const CACHE_TTL = 30000; // 30 seconds - too long if permissions change!

// BETTER: Shorter TTL or invalidation on permission changes
const CACHE_TTL = 5000; // 5 seconds
// OR: Add cache invalidation mechanism
```

---

## 4. Data Provider & Resource Definition

### Data Provider Setup
```typescript
// src/providers/data-provider/index.ts
"use client";

import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";

export const dataProvider = dataProviderSupabase(supabaseBrowserClient);
```

### Resource Definition
```typescript
// src/app/(admin)/layout.tsx

<Refine
  dataProvider={dataProvider}
  authProvider={authProviderClient}
  accessControlProvider={accessControlProvider}
  resources={[
    {
      name: "services",           // MUST match Supabase table name!
      list: "/services",
      create: "/services/create",
      edit: "/services/edit/:id",
      show: "/services/show/:id",
      meta: {
        canDelete: true,
        label: "Services",        // Display name in UI
      },
    },
    {
      name: "client_proposals",   // Note: underscore for table name
      list: "/client-proposals",  // Note: hyphen for URL (convention)
      edit: "/client-proposals/edit/:id",
      show: "/client-proposals/show/:id",
      meta: {
        canDelete: true,
        label: "Client Proposals",
      },
    },
  ]}
  options={{
    syncWithLocation: true,
    warnWhenUnsavedChanges: true,
  }}
>
```

### CRITICAL: Name vs URL Convention
| Aspect | Convention | Example |
|--------|------------|---------|
| Resource `name` | Matches Supabase table | `client_proposals` |
| URL paths | Kebab-case | `/client-proposals` |
| Components | PascalCase | `ClientProposalEdit` |

---

## 5. TypeScript Types & Interfaces

### Type Organization Pattern
```typescript
// src/interfaces/client-proposals.ts

// Database enum type
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

// Item stored in proposal (ID reference)
export interface ProposalItem {
  id: string;
  custom_price?: number;
  custom_duration?: number;
}

// Full custom item (embedded data, not DB reference)
export interface CustomBasePackage {
  id: string;               // Format: "custom-pkg-{uuid}"
  name_he: string;
  base_price: number;
  // ... all fields embedded
}

// Main entity interface
export interface ClientProposal {
  id: string;

  // Reference-based (legacy)
  selected_base_packages: ProposalItem[];

  // Embedded data (new structure)
  custom_items?: {
    base_packages: CustomBasePackage[];
    addons: CustomAddon[];
  };

  // Timestamps
  created_at: string;
  updated_at: string;
}

// Form data (may differ from entity)
export interface ClientProposalFormData {
  // Same fields but may exclude read-only ones
}
```

### MISTAKE: Using `any` Type
```typescript
// BAD: Loses type safety
const handleSubmit = async (data: any) => {
  const price = (pkg as any).price ?? pkg.base_price;
};

// GOOD: Proper typing
interface PackageWithPrice {
  price?: number;
  base_price: number;
}

const handleSubmit = async (data: ClientProposalFormData) => {
  const pkg = data.selected_packages[0] as PackageWithPrice;
  const price = pkg.price ?? pkg.base_price;
};
```

---

## 6. Form Handling Patterns

### React Hook Form with Refine
```typescript
"use client";

import { useForm } from "@refinedev/react-hook-form";

export default function EditPage() {
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    refineCore: { formLoading, onFinish },
  } = useForm<ClientProposal>({
    refineCoreProps: {
      action: "edit",
      resource: "client_proposals",
    },
  });

  // Custom submit handler when you need to transform data
  const handleFormSubmit = handleSubmit(async (data) => {
    const submitData = {
      ...data,
      // Transform as needed
      updated_at: new Date().toISOString(),
    };
    await onFinish(submitData);
  });

  return (
    <form onSubmit={handleFormSubmit}>
      <TextField {...register("name", { required: true })} />
      {/* ... */}
    </form>
  );
}
```

### MISTAKE: Mixed State Sources
```typescript
// BAD: Mixing form state with component state
const [customItems, setCustomItems] = useState([]);
const formValue = watch("selected_items");
// Now you have two sources of truth!

// GOOD: Use form arrays
import { useFieldArray } from "react-hook-form";

const { fields, append, remove } = useFieldArray({
  control,
  name: "custom_items",
});
```

---

## 7. Common Mistakes to Avoid

### 1. Debug Logs in Production
```typescript
// BAD: Left in production code
console.log('====== LOGIN ATTEMPT ======');
console.log('Email:', email);
console.log('Session:', data.session);

// GOOD: Use environment-based logger
if (process.env.NODE_ENV === 'development') {
  console.log('Login attempt:', email);
}

// BETTER: Use a proper logging library
import { logger } from '@/utils/logger';
logger.debug('Login attempt', { email });
```

### 2. Parallel Data Structures
```typescript
// BAD: Supporting two different structures indefinitely
if (record.custom_items) {
  // New structure
} else if (record.selected_packages) {
  // Old structure
}
// This creates maintenance burden

// GOOD: Migrate data and use single structure
// Create a migration to convert old to new format
```

### 3. Hardcoded Email-Based Access
```typescript
// BAD: Hardcoded email
const FINANCES_ALLOWED_EMAIL = 'admin@automaziot.ai';
if (email === FINANCES_ALLOWED_EMAIL) { ... }

// GOOD: Use database roles
// Add a "finance_admin" role to the user in DB
if (userRoles.includes('finance_admin')) { ... }
```

### 4. Missing Error Handling
```typescript
// BAD: No error handling
const { data } = await supabase.from('services').select('*');
setServices(data);

// GOOD: Proper error handling
const { data, error } = await supabase.from('services').select('*');
if (error) {
  toast.error('Failed to load services');
  console.error(error);
  return;
}
setServices(data ?? []);
```

### 5. No RLS Policies
```typescript
// BAD: Only frontend access control
// Anyone with direct DB access can bypass

// GOOD: Enable RLS in Supabase
-- SQL Migration
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active services" ON services
  FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can modify all" ON services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
```

---

## 8. Security Considerations

### RLS Policy Examples
```sql
-- Enable RLS
ALTER TABLE client_proposals ENABLE ROW LEVEL SECURITY;

-- Read: Only own proposals or admin
CREATE POLICY "Read own or admin" ON client_proposals
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Insert: Authenticated users
CREATE POLICY "Insert authenticated" ON client_proposals
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Only owner or admin
CREATE POLICY "Update own or admin" ON client_proposals
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );
```

### API Route Protection
```typescript
// src/app/api/protected/route.ts

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        // ... set, remove
      },
    }
  );

  // Verify user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check role if needed
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return Response.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  // Process request...
}
```

---

## 9. Performance Optimizations

### Pagination
```typescript
// Using Refine's useTable hook
const {
  tableQueryResult: { data, isLoading },
  current,
  setCurrent,
  pageSize,
  setPageSize,
  pageCount,
} = useTable({
  resource: "services",
  pagination: {
    pageSize: 25,
  },
  sorters: {
    initial: [{ field: "created_at", order: "desc" }],
  },
});
```

### Select Only Needed Fields
```typescript
// BAD: Select all
const { data } = await supabase.from('services').select('*');

// GOOD: Select only needed fields
const { data } = await supabase
  .from('services')
  .select('id, name_he, base_price, status');
```

### Indexes (Supabase Migration)
```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_proposals_created_at ON client_proposals(created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX idx_services_category_status ON services(category, status);
```

---

## 10. Code Examples

### Complete Resource Page
```typescript
// src/app/(admin)/services/page.tsx
"use client";

import { useTable } from "@refinedev/core";
import { List, EditButton, ShowButton, DeleteButton } from "@refinedev/mui";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

interface Service {
  id: string;
  name_he: string;
  base_price: number;
  status: 'active' | 'inactive';
}

export default function ServiceList() {
  const {
    tableQueryResult: { data, isLoading, isError },
    current,
    setCurrent,
    pageSize,
    setPageSize,
    sorters,
    setSorters,
  } = useTable<Service>({
    resource: "services",
    pagination: { pageSize: 25 },
    sorters: { initial: [{ field: "name_he", order: "asc" }] },
  });

  const columns: GridColDef[] = [
    { field: "name_he", headerName: "Name", flex: 1 },
    {
      field: "base_price",
      headerName: "Price",
      width: 120,
      valueFormatter: (params) => `${params.value} ILS`,
    },
    { field: "status", headerName: "Status", width: 100 },
    {
      field: "actions",
      headerName: "Actions",
      width: 200,
      renderCell: ({ row }) => (
        <>
          <EditButton hideText recordItemId={row.id} />
          <ShowButton hideText recordItemId={row.id} />
          <DeleteButton hideText recordItemId={row.id} />
        </>
      ),
    },
  ];

  if (isError) return <div>Error loading data</div>;

  return (
    <List>
      <DataGrid
        rows={data?.data ?? []}
        columns={columns}
        loading={isLoading}
        pageSizeOptions={[10, 25, 50]}
        paginationModel={{ page: current - 1, pageSize }}
        onPaginationModelChange={(model) => {
          setCurrent(model.page + 1);
          setPageSize(model.pageSize);
        }}
        sortModel={sorters.map((s) => ({ field: s.field, sort: s.order }))}
        onSortModelChange={(model) => {
          setSorters(model.map((m) => ({ field: m.field, order: m.sort ?? "asc" })));
        }}
      />
    </List>
  );
}
```

### Custom Hook Example
```typescript
// src/hooks/useAccessControl.ts
"use client";

import { useCan } from "@refinedev/core";

export function useAccessControl(resource: string) {
  const { data: canList } = useCan({ resource, action: "list" });
  const { data: canCreate } = useCan({ resource, action: "create" });
  const { data: canEdit } = useCan({ resource, action: "edit" });
  const { data: canDelete } = useCan({ resource, action: "delete" });

  return {
    canList: canList?.can ?? false,
    canCreate: canCreate?.can ?? false,
    canEdit: canEdit?.can ?? false,
    canDelete: canDelete?.can ?? false,
  };
}
```

---

## Quick Reference Checklist

### Before Starting a New Project
- [ ] Set up dual Supabase clients (auth + data)
- [ ] Configure custom schema if needed
- [ ] Enable RLS on all tables
- [ ] Create middleware for route protection
- [ ] Define types for all database tables
- [ ] Set up access control provider with roles

### Before Each Resource
- [ ] Create TypeScript interface matching table
- [ ] Add resource to Refine configuration
- [ ] Create list/create/edit/show pages
- [ ] Add RLS policies for the table
- [ ] Test all CRUD operations

### Before Production
- [ ] Remove all console.log statements
- [ ] Verify RLS policies are active
- [ ] Test access control for all roles
- [ ] Add proper error handling everywhere
- [ ] Set up proper logging
- [ ] Review security advisories

---

## Additional Resources

- [Refine Documentation](https://refine.dev/docs)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js App Router](https://nextjs.org/docs/app)

---

*Document generated from automaziot-admin project analysis*
*Last updated: December 2024*
