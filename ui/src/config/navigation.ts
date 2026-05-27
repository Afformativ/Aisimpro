export const HIDDEN_NAV_PATHS_IN_PROD = new Set([
  '/',
  '/dashboard',
  '/parties',
  '/facilities',
  '/batches',
]);

export const DEFAULT_AUTHENTICATED_ROUTE = import.meta.env.PROD ? '/traceability' : '/';
