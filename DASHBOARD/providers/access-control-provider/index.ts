"use client";

import type { AccessControlProvider, CanParams, CanReturnType } from "@refinedev/core";
import { supabaseClient } from "@/utils/supabase/client";
import type { UserRole } from "@/types/user";

type Action = "list" | "create" | "edit" | "show" | "delete";

const rolePermissions: Record<UserRole, Record<string, Action[]>> = {
  admin: {
    "*": ["list", "create", "edit", "show", "delete"],
  },
  editor: {
    dashboard: ["list", "show"],
    pilot: ["list", "create", "edit", "show"],
    pilot_report: ["list", "show"],
    catalog_matches: ["list", "create", "edit", "show"],
    v_comparison: ["list", "create", "edit", "show"],
    superpharm_offers_raw: ["list", "show"],
    categories: ["list", "show"],
    peri_queue: ["list", "create", "edit", "show"],
    sync_jobs: ["list", "create", "show"],
    pricing_rules: ["list", "create", "edit", "show"],
    operator_custom_fields: ["list", "create", "edit", "show"],
    shipments: ["list", "create", "edit", "show", "delete"],
    "pickup-management": ["list", "edit", "show"],
    inventory: ["list", "create", "edit", "show", "delete"],
    products: ["list", "create", "edit", "show", "delete"],
    suppliers: ["list", "create", "edit", "show", "delete"],
    analytics: ["list", "show"],
    users: ["list", "show"],
  },
  viewer: {
    dashboard: ["list", "show"],
    pilot: ["list", "show"],
    pilot_report: ["list", "show"],
    catalog_matches: ["list", "show"],
    v_comparison: ["list", "show"],
    superpharm_offers_raw: ["list", "show"],
    categories: ["list", "show"],
    peri_queue: ["list", "show"],
    sync_jobs: ["list", "show"],
    pricing_rules: ["list", "show"],
    operator_custom_fields: ["list", "show"],
    shipments: ["list", "show"],
    "pickup-management": ["list", "show"],
    inventory: ["list", "show"],
    products: ["list", "show"],
    suppliers: ["list", "show"],
    analytics: ["list", "show"],
    users: ["list", "show"],
  },
};

let roleCache: { role: UserRole | null; timestamp: number; resolved: boolean } = {
  role: null,
  timestamp: 0,
  resolved: false,
};

const CACHE_TTL = 5 * 60 * 1000;
const NULL_CACHE_TTL = 60_000; // Re-try a failed/missing role only every 60s.
const ROLE_TIMEOUT_MS = 4_000;

const withTimeout = async <T,>(promise: PromiseLike<T>, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ROLE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/**
 * Synchronous permission check used by sidebar / nav rendering.
 * Pass the role we already know (from useGetIdentity) to avoid a DB call.
 */
export function canList(role: UserRole | null | undefined, resource: string): boolean {
  if (!role) return false;
  return hasPermission(role, resource, "list");
}

export function canDo(
  role: UserRole | null | undefined,
  resource: string,
  action: Action
): boolean {
  if (!role) return false;
  return hasPermission(role, resource, action);
}

async function getUserRole(): Promise<UserRole | null> {
  const now = Date.now();
  if (roleCache.resolved) {
    const ttl = roleCache.role ? CACHE_TTL : NULL_CACHE_TTL;
    if (now - roleCache.timestamp < ttl) {
      return roleCache.role;
    }
  }

  try {
    const {
      data: { session },
    } = await withTimeout(supabaseClient.auth.getSession(), "User session lookup timed out");
    const user = session?.user;

    if (!user) {
      roleCache = { role: null, timestamp: now, resolved: true };
      return null;
    }

    // Fall back to the role embedded in the auth JWT (user_metadata or
    // app_metadata) before hitting the DB. Saves a round-trip and avoids
    // cascading timeouts when the `users` table is slow.
    const metadataRole =
      (user.user_metadata?.role as UserRole | undefined) ||
      (user.app_metadata?.role as UserRole | undefined);

    if (metadataRole) {
      roleCache = { role: metadataRole, timestamp: now, resolved: true };
      return metadataRole;
    }

    const { data: profile } = await withTimeout(
      supabaseClient.from("users").select("role").eq("id", user.id).single(),
      "User profile role lookup timed out"
    );

    const role = (profile?.role as UserRole) || null;
    roleCache = { role, timestamp: now, resolved: true };
    return role;
  } catch (error) {
    console.error("Error fetching user role:", error);
    // Cache the null result so we don't hammer a failing endpoint.
    roleCache = { role: null, timestamp: now, resolved: true };
    return null;
  }
}

export function setCachedRole(role: UserRole | null | undefined) {
  if (!role) return;
  roleCache = { role, timestamp: Date.now(), resolved: true };
}

export function invalidateRoleCache() {
  roleCache = { role: null, timestamp: 0, resolved: false };
}

function hasPermission(role: UserRole, resource: string, action: Action): boolean {
  const permissions = rolePermissions[role];
  if (permissions["*"]?.includes(action)) return true;
  if (permissions[resource]?.includes(action)) return true;
  return false;
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }: CanParams): Promise<CanReturnType> => {
    const role = await getUserRole();

    if (!role) {
      return { can: false, reason: "User role not found. Please contact administrator." };
    }
    if (!resource) {
      return { can: false, reason: "No resource specified for permission check." };
    }

    const canPerform = hasPermission(role, resource, action as Action);
    if (!canPerform) {
      return {
        can: false,
        reason: `Your role (${role}) does not have permission to ${action} ${resource}.`,
      };
    }
    return { can: true };
  },

  options: {
    buttons: {
      enableAccessControl: true,
      hideIfUnauthorized: false,
    },
  },
};

export { getUserRole };
