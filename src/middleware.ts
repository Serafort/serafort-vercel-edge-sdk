import { SerafortClient, type UserContext } from '@serafort/core';
import { extractVercelGeo, isGeoAllowed } from './geo.js';
import type {
  SerafortEdgeOptions,
  EdgeAuthSession,
  EdgeProtectOptions,
} from './types.js';

function matchesRoute(path: string, pattern: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix + '/');
  }
  return false;
}

export function isPublicRoute(pathname: string, publicRoutes: string[] = []): boolean {
  return publicRoutes.some((route) => matchesRoute(pathname, route));
}

export function extractToken(request: Request, cookieName: string = '__serafort_token'): string | null {
  // 1. Authorization header
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Cookie
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookies) {
      if (c.startsWith(`${cookieName}=`)) {
        return c.substring(cookieName.length + 1).trim();
      }
    }
  }

  return null;
}

/**
 * Validates an incoming Vercel Edge request, verifying tokens and extracting geo metadata.
 */
export async function verifyEdgeRequest(
  request: Request,
  options: SerafortEdgeOptions
): Promise<EdgeAuthSession> {
  const client =
    options.client ||
    new SerafortClient({
      endpoint: options.endpoint,
    });

  const cookieName = options.cookieName || '__serafort_token';
  const geo = extractVercelGeo(request);
  const token = extractToken(request, cookieName);

  if (!token) {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      geo,
    };
  }

  try {
    const user = await client.b2b.validateToken(token);
    return {
      user,
      token,
      isAuthenticated: true,
      geo,
    };
  } catch {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      geo,
    };
  }
}

/**
 * Creates a standard Vercel Edge Middleware handler.
 */
export function createEdgeMiddleware(
  options: SerafortEdgeOptions,
  protectOptions: EdgeProtectOptions = {}
) {
  const client =
    options.client ||
    new SerafortClient({
      endpoint: options.endpoint,
    });

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // 1. Check Public Routes
    if (isPublicRoute(url.pathname, options.publicRoutes)) {
      return new Response(null, {
        headers: { 'x-middleware-next': '1' },
      });
    }

    // 2. Check Global & Route Geo Restrictions
    const geo = extractVercelGeo(request);
    if (
      options.geoRestrictions &&
      !isGeoAllowed(geo.country, options.geoRestrictions)
    ) {
      return Response.json(
        { error: 'Forbidden', message: `Access denied from country: ${geo.country || 'Unknown'}` },
        { status: 403 }
      );
    }

    if (
      protectOptions.allowedCountries &&
      protectOptions.allowedCountries.length > 0
    ) {
      if (!isGeoAllowed(geo.country, { allowedCountries: protectOptions.allowedCountries })) {
        return Response.json(
          { error: 'Forbidden', message: `Route restricted to: ${protectOptions.allowedCountries.join(', ')}` },
          { status: 403 }
        );
      }
    }

    // 3. Authenticate Token
    const session = await verifyEdgeRequest(request, options);

    if (!session.isAuthenticated || !session.user) {
      const loginUrl = protectOptions.redirectTo || options.loginUrl;
      if (loginUrl) {
        const returnUrl = encodeURIComponent(url.pathname + url.search);
        return Response.redirect(`${loginUrl}?returnUrl=${returnUrl}`, 302);
      }
      return Response.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = session.user;

    // 4. Tenant Check
    if (protectOptions.tenantId && user.tenantId !== protectOptions.tenantId) {
      return Response.json(
        { error: 'Forbidden', message: 'Tenant access denied' },
        { status: 403 }
      );
    }

    // 5. Role Check
    if (protectOptions.roles && protectOptions.roles.length > 0) {
      const hasRole = protectOptions.roles.some((r) => user.roles.includes(r));
      if (!hasRole) {
        return Response.json(
          { error: 'Forbidden', message: `Required role missing: ${protectOptions.roles.join(', ')}` },
          { status: 403 }
        );
      }
    }

    // 6. Permission Check with Wildcards
    if (protectOptions.permissions && protectOptions.permissions.length > 0) {
      for (const perm of protectOptions.permissions) {
        if (!client.b2b.hasPermission(user, perm)) {
          return Response.json(
            { error: 'Forbidden', message: `Required permission missing: ${perm}` },
            { status: 403 }
          );
        }
      }
    }

    // 7. Inject Enriched Headers and Continue
    const responseHeaders = new Headers();
    responseHeaders.set('x-middleware-next', '1');
    responseHeaders.set('x-serafort-user-id', user.userId);
    responseHeaders.set('x-serafort-tenant-id', user.tenantId);
    responseHeaders.set('x-serafort-roles', user.roles.join(','));
    if (geo.country) {
      responseHeaders.set('x-serafort-geo-country', geo.country);
    }

    return new Response(null, {
      headers: responseHeaders,
    });
  };
}
