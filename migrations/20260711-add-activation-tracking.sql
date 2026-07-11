BEGIN;

ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS obs_connected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS first_donation_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS provider_configured_at TIMESTAMP WITH TIME ZONE;

-- Preserve a useful first-configuration approximation for existing workspaces. New
-- configurations are recorded exactly by markWorkspaceProviderConfigured().
UPDATE workspace_settings settings
SET provider_configured_at = providers.created_at
FROM payment_providers providers
WHERE settings.workspace_id = providers.workspace_id
  AND providers.provider_name = 'ecpay'
  AND settings.provider_configured_at IS NULL
  AND NULLIF(providers.merchant_id, '') IS NOT NULL
  AND NULLIF(providers.hash_key, '') IS NOT NULL
  AND NULLIF(providers.hash_iv, '') IS NOT NULL;

COMMIT;
