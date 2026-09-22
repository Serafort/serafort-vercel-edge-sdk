import type { GeoLocation, GeoRestrictions } from './types.js';

/**
 * Extracts Vercel edge geolocation metadata from request headers.
 */
export function extractVercelGeo(request: Request): GeoLocation {
  return {
    country: request.headers.get('x-vercel-ip-country'),
    region: request.headers.get('x-vercel-ip-country-region'),
    city: request.headers.get('x-vercel-ip-city'),
    latitude: request.headers.get('x-vercel-ip-latitude'),
    longitude: request.headers.get('x-vercel-ip-longitude'),
  };
}

/**
 * Verifies if the request's origin country satisfies configured geolocation restrictions.
 */
export function isGeoAllowed(
  country: string | null,
  restrictions: GeoRestrictions = {}
): boolean {
  if (!country) return true;
  const upper = country.toUpperCase();

  if (restrictions.deniedCountries && restrictions.deniedCountries.length > 0) {
    const denied = restrictions.deniedCountries.map((c) => c.toUpperCase());
    if (denied.includes(upper)) {
      return false;
    }
  }

  if (restrictions.allowedCountries && restrictions.allowedCountries.length > 0) {
    const allowed = restrictions.allowedCountries.map((c) => c.toUpperCase());
    return allowed.includes(upper);
  }

  return true;
}
