import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

// Gates admin-only routes to a wallet allowlist. Runs AFTER authMiddleware, so
// req.user is already populated from a verified JWT — here we only check that
// the authenticated wallet is one we trust.
//
// Configured via ADMIN_WALLETS (comma-separated Stellar addresses). Fail-closed:
// if the env var is missing or empty, nobody is admin, and we log a warning so a
// misconfigured deploy can't silently expose everyone's data.
const parseAdminWallets = (): string[] =>
  (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

export const adminAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const admins = parseAdminWallets();

  if (admins.length === 0) {
    console.warn('ADMIN_WALLETS is not set — denying all admin access (fail-closed).');
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!req.user || !admins.includes(req.user.walletAddress)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};
