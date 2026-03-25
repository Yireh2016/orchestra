/**
 * Authentication and authorization types for the Orchestra monorepo.
 */

/** Supported authentication providers. */
export enum AuthProvider {
  /** Google OAuth / OpenID Connect. */
  GOOGLE = 'google',
  /** Enterprise single sign-on (SAML / OIDC). */
  SSO = 'sso',
}

/** Roles that determine a user's permission level within a team. */
export enum UserRole {
  /** Full administrative access: manage templates, team settings, and members. */
  ADMIN = 'admin',
  /** Standard team member: can trigger workflows, view results, approve gates. */
  MEMBER = 'member',
  /** Read-only access: can view workflows and results but cannot trigger or approve. */
  VIEWER = 'viewer',
}

/** An authenticated user in the Orchestra system. */
export interface AuthUser {
  /** Unique user identifier. */
  id: string;
  /** User's email address. */
  email: string;
  /** Display name. */
  name: string;
  /** ID of the team the user belongs to. */
  teamId: string;
  /** The user's role within their team. */
  role: UserRole;
  /** URL to the user's avatar image, if available. */
  avatarUrl?: string;
}

/** A team within the Orchestra system. */
export interface Team {
  /** Unique team identifier. */
  id: string;
  /** Display name of the team. */
  name: string;
  /** Team-level configuration settings. */
  settings: TeamSettings;
}

/** Configurable settings for a {@link Team}. */
export interface TeamSettings {
  /** Default coding-agent provider for this team (e.g. "claude-code"). */
  defaultAgentProvider?: string;
  /** Default model for the coding agent. */
  defaultAgentModel?: string;
  /** Maximum number of concurrent agent instances the team may run. */
  maxConcurrentAgents?: number;
  /** Default base branch for new repositories. */
  defaultBaseBranch?: string;
  /** Whether to require manual approval gates by default. */
  requireManualApproval?: boolean;
  /** Notification channel ID for workflow updates. */
  notificationChannelId?: string;
  /** Arbitrary extra settings. */
  extras?: Record<string, unknown>;
}
