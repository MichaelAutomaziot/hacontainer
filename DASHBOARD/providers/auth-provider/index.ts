"use client";

import type { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "@/utils/supabase/client";
import { invalidateRoleCache, setCachedRole } from "@/providers/access-control-provider";
import type { UserRole } from "@/types/user";

const AUTH_TIMEOUT_MS = 8_000;

const withTimeout = async <T,>(promise: PromiseLike<T>, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type CachedIdentity = {
  id: string;
  email: string | null | undefined;
  name: string | null | undefined;
  role?: string | null;
};

let identityCache: CachedIdentity | null = null;

export function invalidateIdentityCache() {
  identityCache = null;
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.signInWithPassword({ email, password }),
        "Login timed out"
      );

      if (error) {
        return {
          success: false,
          error: { name: "LoginError", message: error.message },
        };
      }

      identityCache = null;
      invalidateRoleCache();

      return {
        success: true,
        redirectTo: "/dashboard",
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: error?.message || "Login failed",
        },
      };
    }
  },

  logout: async () => {
    try {
      await supabaseClient.auth.signOut();
      identityCache = null;
      invalidateRoleCache();
      return { success: true, redirectTo: "/login" };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "LogoutError",
          message: error?.message || "Logout failed",
        },
      };
    }
  },

  register: async ({ email, password, fullName }) => {
    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        }),
        "Registration timed out"
      );

      if (error) {
        return {
          success: false,
          error: { name: "RegisterError", message: error.message },
        };
      }

      if (data?.user && !data?.session) {
        return { success: true, redirectTo: "/login?message=check-email" };
      }

      identityCache = null;
      invalidateRoleCache();

      return { success: true, redirectTo: "/dashboard" };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "RegisterError",
          message: error?.message || "Registration failed",
        },
      };
    }
  },

  forgotPassword: async ({ email }) => {
    try {
      const { error } = await withTimeout(
        supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        "Password reset timed out"
      );

      if (error) {
        return {
          success: false,
          error: { name: "ForgotPasswordError", message: error.message },
        };
      }

      return { success: true, redirectTo: "/login?message=check-email-reset" };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "ForgotPasswordError",
          message: error?.message || "Failed to send reset email",
        },
      };
    }
  },

  updatePassword: async ({ password }) => {
    try {
      const { error } = await withTimeout(
        supabaseClient.auth.updateUser({ password }),
        "Password update timed out"
      );

      if (error) {
        return {
          success: false,
          error: { name: "UpdatePasswordError", message: error.message },
        };
      }

      return { success: true, redirectTo: "/" };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "UpdatePasswordError",
          message: error?.message || "Failed to update password",
        },
      };
    }
  },

  check: async () => {
    try {
      const {
        data: { session },
        error,
      } = await withTimeout(
        supabaseClient.auth.getSession(),
        "Session check timed out"
      );

      if (error || !session) {
        identityCache = null;
        return { authenticated: false, redirectTo: "/login", logout: true };
      }

      return { authenticated: true };
    } catch (error: any) {
      identityCache = null;
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
        error: {
          name: "AuthCheckError",
          message: error?.message || "Authentication check failed",
        },
      };
    }
  },

  getIdentity: async () => {
    if (identityCache) return identityCache;

    try {
      const {
        data: { session },
      } = await withTimeout(
        supabaseClient.auth.getSession(),
        "Session lookup timed out"
      );

      const user = session?.user;
      if (!user) return null;

      const metadataRole =
        (user.user_metadata?.role as UserRole | undefined) ||
        (user.app_metadata?.role as UserRole | undefined);

      const fallback: CachedIdentity = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
        role: metadataRole ?? null,
      };

      // If the JWT already carries the role we don't need a DB hit.
      if (metadataRole) {
        setCachedRole(metadataRole);
        identityCache = fallback;
        return fallback;
      }

      try {
        const { data: profile } = await withTimeout(
          supabaseClient
            .from("users")
            .select("id, email, role, full_name")
            .eq("id", user.id)
            .single(),
          "Profile lookup timed out"
        );

        if (profile) {
          identityCache = {
            id: profile.id,
            email: profile.email,
            name: profile.full_name || profile.email,
            role: profile.role,
          };
          if (profile.role) setCachedRole(profile.role as UserRole);
          return identityCache;
        }
      } catch (profileError) {
        console.warn("Profile lookup failed, falling back to auth identity:", profileError);
      }

      identityCache = fallback;
      return fallback;
    } catch (error: any) {
      console.error("getIdentity error:", error);
      return null;
    }
  },

  onError: async (error) => {
    console.error("Auth error:", error);

    if (error?.statusCode === 401) {
      identityCache = null;
      invalidateRoleCache();
      return { logout: true, redirectTo: "/login", error };
    }

    return { error };
  },
};
