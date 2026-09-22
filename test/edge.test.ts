import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractVercelGeo, isGeoAllowed } from '../src/geo.js';
import { createEdgeMiddleware, verifyEdgeRequest } from '../src/middleware.js';
import { SerafortClient, type UserContext } from '@serafort/core';

describe('@serafort/vercel-edge Suite', () => {
  const mockUser: UserContext = {
    userId: 'usr_edge_999',
    tenantId: 'tenant_vercel',
    roles: ['admin', 'developer'],
    permissions: ['org:*', 'edge:invoke'],
    claims: {},
  };

  let mockClient: SerafortClient;

  beforeEach(() => {
    mockClient = new SerafortClient({ endpoint: 'https://api.test.serafort.com' });
    vi.spyOn(mockClient.b2b, 'validateToken').mockImplementation(async (token: string) => {
      if (token === 'valid_edge_token') {
        return mockUser;
      }
      throw new Error('Invalid token');
    });
  });

  describe('Geolocation helpers', () => {
    it('extracts Vercel geo headers', () => {
      const req = new Request('https://edge.example.com', {
        headers: {
          'x-vercel-ip-country': 'US',
          'x-vercel-ip-country-region': 'CA',
          'x-vercel-ip-city': 'San Francisco',
        },
      });

      const geo = extractVercelGeo(req);
      expect(geo.country).toBe('US');
      expect(geo.region).toBe('CA');
      expect(geo.city).toBe('San Francisco');
    });

    it('enforces country allowlists and denylists', () => {
      expect(isGeoAllowed('US', { allowedCountries: ['US', 'CA'] })).toBe(true);
      expect(isGeoAllowed('FR', { allowedCountries: ['US', 'CA'] })).toBe(false);

      expect(isGeoAllowed('KP', { deniedCountries: ['KP', 'IR'] })).toBe(false);
      expect(isGeoAllowed('DE', { deniedCountries: ['KP', 'IR'] })).toBe(true);
    });
  });

  describe('verifyEdgeRequest', () => {
    it('returns unauthenticated when no token present', async () => {
      const req = new Request('https://edge.example.com/api/user');
      const session = await verifyEdgeRequest(req, {
        endpoint: 'https://api.test.serafort.com',
        client: mockClient,
      });

      expect(session.isAuthenticated).toBe(false);
      expect(session.user).toBeNull();
    });

    it('returns authenticated user when valid bearer token present', async () => {
      const req = new Request('https://edge.example.com/api/user', {
        headers: { Authorization: 'Bearer valid_edge_token' },
      });
      const session = await verifyEdgeRequest(req, {
        endpoint: 'https://api.test.serafort.com',
        client: mockClient,
      });

      expect(session.isAuthenticated).toBe(true);
      expect(session.user?.userId).toBe('usr_edge_999');
    });
  });

  describe('createEdgeMiddleware', () => {
    it('allows public routes to bypass edge authentication', async () => {
      const middleware = createEdgeMiddleware(
        {
          endpoint: 'https://api.test.serafort.com',
          publicRoutes: ['/public/*'],
          client: mockClient,
        }
      );

      const req = new Request('https://edge.example.com/public/assets/logo.png');
      const res = await middleware(req);

      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('blocks request if geographic location is denied', async () => {
      const middleware = createEdgeMiddleware(
        {
          endpoint: 'https://api.test.serafort.com',
          geoRestrictions: { deniedCountries: ['XX'] },
          client: mockClient,
        }
      );

      const req = new Request('https://edge.example.com/api/data', {
        headers: {
          'x-vercel-ip-country': 'XX',
          Authorization: 'Bearer valid_edge_token',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain('Access denied from country: XX');
    });

    it('redirects unauthenticated users if loginUrl is set', async () => {
      const middleware = createEdgeMiddleware(
        {
          endpoint: 'https://api.test.serafort.com',
          loginUrl: 'https://auth.example.com/login',
          client: mockClient,
        }
      );

      const req = new Request('https://edge.example.com/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://auth.example.com/login?returnUrl=%2Fdashboard');
    });

    it('enforces RBAC and enriches headers for valid authenticated requests', async () => {
      const middleware = createEdgeMiddleware(
        {
          endpoint: 'https://api.test.serafort.com',
          client: mockClient,
        },
        {
          tenantId: 'tenant_vercel',
          roles: ['developer'],
          permissions: ['edge:invoke', 'org:admin'],
        }
      );

      const req = new Request('https://edge.example.com/api/invoke', {
        headers: {
          Authorization: 'Bearer valid_edge_token',
          'x-vercel-ip-country': 'US',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(res.headers.get('x-serafort-user-id')).toBe('usr_edge_999');
      expect(res.headers.get('x-serafort-tenant-id')).toBe('tenant_vercel');
      expect(res.headers.get('x-serafort-roles')).toBe('admin,developer');
      expect(res.headers.get('x-serafort-geo-country')).toBe('US');
    });
  });
});
