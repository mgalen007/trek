export class AgentTokenEntity {
  /**
   * JWT for the user's AI agent, sent as `Authorization: Bearer <token>`.
   * Accepted only by operations marked `x-agent-allowed` in this spec
   * (searching, reading, drafting); anything else answers 403
   * AGENT_NOT_ALLOWED.
   */
  accessToken: string;

  /** Always `Bearer`. */
  tokenType: 'Bearer';

  /** Seconds until it expires. There's no refresh token: request a new one. */
  expiresIn: number;
}
