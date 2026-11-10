import { AccountTokenPurpose, Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { hashSecret, newSecret } from 'common/helpers/secrets';
import { queueEmail } from '../email/email-outbox';
import { ActionCode, verifyEmailEmail } from '../email/templates';

type Db = PrismaService | Prisma.TransactionClient;

export const TOKEN_TTL_MS: Record<AccountTokenPurpose, number> = {
  EMAIL_VERIFICATION: 48 * 60 * 60_000,
  PASSWORD_RESET: 60 * 60_000,
};

// At most one code email per purpose per minute, so the endpoints can't be
// used to flood someone's inbox.
export const RESEND_COOLDOWN_MS = 60_000;

const APP_PATHS: Record<AccountTokenPurpose, string> = {
  EMAIL_VERIFICATION: 'verify-email',
  PASSWORD_RESET: 'reset-password',
};

/**
 * A fresh single-use code: the secret for the email, and the row fields to
 * store (only its hash). `appUrl` (APP_URL) turns it into a link to the app.
 */
export const newAccountToken = (
  purpose: AccountTokenPurpose,
  email: string,
  appUrl?: string,
) => {
  const code = newSecret();
  const action: ActionCode = appUrl
    ? {
        code,
        link: `${appUrl.replace(/\/+$/, '')}/${APP_PATHS[purpose]}?token=${code}`,
      }
    : { code };
  return {
    action,
    data: {
      purpose,
      email,
      tokenHash: hashSecret(code),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
    },
  };
};

/** Issues a verification code for the user's current address and emails it. */
export const queueVerification = async (
  db: Db,
  user: { id: string; email: string; firstName: string },
  appUrl?: string,
) => {
  const { action, data } = newAccountToken(
    AccountTokenPurpose.EMAIL_VERIFICATION,
    user.email,
    appUrl,
  );
  await db.accountToken.create({ data: { userId: user.id, ...data } });
  await queueEmail(
    db,
    user.id,
    user.email,
    verifyEmailEmail(user.firstName, action),
  );
};
