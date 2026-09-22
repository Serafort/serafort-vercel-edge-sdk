import type { UserContext, SerafortClient } from '@serafort/core';

export interface GeoLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface GeoRestrictions {
  /** ISO 3166-1 alpha-2 country codes allowed (e.g. ['US', 'CA', 'GB']) */
  allowedCountries?: string[];
  /** ISO 3166-1 alpha-2 country codes blocked */
  deniedCountries?: string[];
}

export interface SerafortEdgeOptions {
  /** Serafort IAM backend endpoint */
  endpoint: string;
  /** Name of the session cookie. Default: '__serafort_token' */
  cookieName?: string;
  /** Route patterns to exempt from edge auth (e.g. ['/api/public/*', '/login', '/health']) */
  publicRoutes?: string[];
  /** Default redirect URL when unauthenticated. If omitted, returns JSON 401 */
  loginUrl?: string;
  /** Header key for tenant ID. Default: 'X-Tenant-ID' */
  tenantHeader?: string;
  /** Optional geolocation restrictions enforced at the edge */
  geoRestrictions?: GeoRestrictions;
  /** Pre-configured SerafortClient instance */
  client?: SerafortClient;
}

export interface EdgeAuthSession {
  user: UserContext | null;
  token: string | null;
  isAuthenticated: boolean;
  geo: GeoLocation;
}

export interface EdgeProtectOptions {
  /** Required roles */
  roles?: string[];
  /** Required permissions (supports wildcards e.g. 'org:*') */
  permissions?: string[];
  /** Required tenant ID */
  tenantId?: string;
  /** Custom redirect URL when unauthorized */
  redirectTo?: string;
  /** Per-route geolocation allowlist */
  allowedCountries?: string[];
}
