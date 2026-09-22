# @serafort/vercel-edge

Enterprise IAM, fast Web Crypto JWT verification, and Geo-Tenant routing for Vercel Edge Middleware and Edge Functions.

## Features

- ⚡ **Sub-Millisecond Verification**: Local RSA/ECDSA JWKS token verification at the edge via Web Crypto API with zero origin roundtrips.
- 🌍 **Geolocation Compliance**: Enforces country allowlists and denylists at the edge using `x-vercel-ip-country` headers before hitting application backends.
- 🛡️ **Edge Middleware**: `createEdgeMiddleware(options, protectOptions)` with wildcard RBAC (`org:*`), route exemptions, returnTo preservation, and automatic 302 redirects.
- 🏢 **Multi-Tenant Isolation**: Enforces tenant boundaries and prevents cross-tenant access at the edge.
- 🔀 **Header Decoration**: Enriches downstream requests with `x-serafort-user-id`, `x-serafort-tenant-id`, `x-serafort-roles`, and `x-serafort-geo-country`.

## Installation

```bash
npm install @serafort/vercel-edge @serafort/core
```

## Quick Start

### 1. Edge Middleware (`middleware.ts`)

```typescript
// middleware.ts
import { createEdgeMiddleware } from '@serafort/vercel-edge';

export const middleware = createEdgeMiddleware(
  {
    endpoint: process.env.SERAFORT_ENDPOINT || 'https://api.serafort.com',
    publicRoutes: ['/login', '/health', '/api/public/*'],
    loginUrl: '/login',
    geoRestrictions: {
      deniedCountries: ['KP', 'IR'],
    },
  },
  {
    roles: ['admin'],
    permissions: ['org:*'],
  }
);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### 2. Edge API Route Handler

```typescript
// app/api/edge-data/route.ts
import { verifyEdgeRequest } from '@serafort/vercel-edge';

export const runtime = 'edge';

export async function GET(request: Request) {
  const session = await verifyEdgeRequest(request, {
    endpoint: 'https://api.serafort.com',
  });

  if (!session.isAuthenticated) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    user: session.user,
    country: session.geo.country,
  });
}
```
