// Provider callbacks need an isolated budget. They are authenticated by the provider
// signature path, while public traffic is not allowed to exhaust their callback quota.
export const GENERAL_RATE_LIMIT = 300;
export const PROVIDER_CALLBACK_RATE_LIMIT = 600;

export function isProviderCallbackPath(path) {
  return path === '/webhook' || path.startsWith('/webhook/') || path === '/ecpay/period/callback' || path === '/api/webhook/generic' || path.startsWith('/api/webhook/generic/');
}
