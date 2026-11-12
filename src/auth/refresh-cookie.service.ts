import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'trek_refresh';

// Only auth routes need it, so the browser sends it nowhere else.
const COOKIE_PATH = '/api/auth';

/**
 * The refresh token as an httpOnly cookie, for browsers: JavaScript can't
 * read it, so an XSS bug can't steal it. Login, refresh and change-password
 * set it (alongside the token in the body, for other clients); refresh and
 * logout fall back to it when the body has no token.
 *
 * SameSite is lax (or strict), so the frontend must be on the same site as
 * the API (app.example.com + api.example.com, or localhost in development):
 * browsers then never send it with cross-site requests, which rules out
 * CSRF on refresh and logout.
 */
@Injectable()
export class RefreshCookieService {
  constructor(private config: ConfigService) {}

  set(res: Response, token: string, expires: Date) {
    res.cookie(REFRESH_COOKIE, token, { ...this.options(), expires });
  }

  clear(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.options());
  }

  read(req: Request): string | undefined {
    for (const pair of (req.headers.cookie ?? '').split(';')) {
      const [name, ...value] = pair.trim().split('=');
      if (name !== REFRESH_COOKIE) continue;
      try {
        return decodeURIComponent(value.join('=')) || undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private options(): CookieOptions {
    const secure = this.config.get<string>('REFRESH_COOKIE_SECURE');
    return {
      httpOnly: true,
      sameSite:
        this.config.get<string>('REFRESH_COOKIE_SAMESITE') === 'strict'
          ? 'strict'
          : 'lax',
      // HTTPS-only in production unless set explicitly; plain HTTP works
      // in development.
      secure:
        secure !== undefined
          ? secure === 'true'
          : this.config.get<string>('NODE_ENV') === 'production',
      path: COOKIE_PATH,
    };
  }
}
