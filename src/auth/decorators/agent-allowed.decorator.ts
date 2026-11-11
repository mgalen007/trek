import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const AGENT_ALLOWED = 'agentAllowed';

/**
 * Lets agent tokens (the AI agent acting for a user) call this route.
 * Agent tokens are refused everywhere else, so new routes stay closed to the
 * agent until someone decides otherwise. Never use on routes that book,
 * cancel, pay or change the account.
 *
 * Also marks the operation `x-agent-allowed: true` in the OpenAPI spec, so
 * the agent's tools can be generated from exactly these operations.
 */
export const AgentAllowed = () =>
  applyDecorators(
    SetMetadata(AGENT_ALLOWED, true),
    ApiExtension('x-agent-allowed', true),
  );
