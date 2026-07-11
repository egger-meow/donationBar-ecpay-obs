export function isMultiUserSandboxData(data) {
  return Boolean(data && typeof data === 'object'
    && Array.isArray(data.users)
    && Array.isArray(data.subscriptions)
    && Array.isArray(data.workspaces)
    && Array.isArray(data.workspaceSettings)
    && Array.isArray(data.paymentProviders)
    && Array.isArray(data.donations));
}

export function isLegacySingleUserSandboxData(data) {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data)
    && ('goal' in data || 'total' in data || 'overlaySettings' in data || 'ecpay' in data || Array.isArray(data.donations)));
}

export function assertLegacySingleUserSandboxData(data) {
  if (isMultiUserSandboxData(data)) {
    throw new Error('db.json already uses the multi-user sandbox schema; refusing to rewrite it. Start the app normally or restore a pre-migration backup before retrying.');
  }
  if (!isLegacySingleUserSandboxData(data)) {
    throw new Error('db.json is not a recognized legacy single-user schema; refusing to rewrite unknown data. Restore a known backup or inspect the file before retrying.');
  }
}
