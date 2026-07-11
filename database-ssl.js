export function databaseSsl(env = process.env) {
  const needsTls = env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production' || String(env.DATABASE_URL || '').includes('sslmode=require');
  if (!needsTls) return false;
  let ca = env.DATABASE_CA || undefined;
  if (ca && !ca.startsWith('-----BEGIN')) {
    ca = Buffer.from(ca, 'base64').toString('utf8');
  }
  return { rejectUnauthorized: true, ca };
}
