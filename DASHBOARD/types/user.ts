export type UserRole = "admin" | "editor" | "viewer";

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
  created_at: string;
  updated_at: string;
}

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
  role?: UserRole;
}
