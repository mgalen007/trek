export class AuthTokensEntity {
  /** Short-lived JWT to send as `Authorization: Bearer <accessToken>`. */
  accessToken: string;

  /** Always `Bearer`. */
  tokenType: 'Bearer';

  /** Seconds until the access token expires. Refresh shortly before. */
  expiresIn: number;

  /**
   * Long-lived token for `POST /auth/refresh`. Single use: every refresh
   * returns a new one, which replaces this one.
   */
  refreshToken: string;

  /** When the refresh token expires if it isn't used. */
  refreshTokenExpiresAt: Date;
}
