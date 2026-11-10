import { createHash, randomBytes } from 'crypto';

/** 256 random bits, URL-safe: refresh tokens and emailed account codes. */
export const newSecret = () => randomBytes(32).toString('base64url');

// The secrets are random, not chosen by people, so a fast hash is enough to
// make a leaked table useless; bcrypt would only slow every lookup down.
export const hashSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');
