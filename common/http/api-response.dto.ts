import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from './api-error';

export class PaginationMetaDto {
  /** 1-based page number. */
  page: number;
  /** Number of items skipped before this page. */
  skip: number;
  /** Page size. */
  limit: number;
  /** Total number of matching items across all pages. */
  total: number;
  /** Total number of pages; 0 when nothing matches. */
  totalPages: number;
}

export class ApiErrorDto {
  /** Machine-readable error code; branch on this rather than `message`. */
  @ApiProperty({ enum: Object.values(ErrorCode), enumName: 'ErrorCode' })
  code: ErrorCode;
  /** Human-readable explanation. */
  message: string;
  /**
   * Extra context. For VALIDATION_FAILED: `[{ field, errors: string[] }]`.
   */
  @ApiProperty({ required: false })
  details?: unknown;
}

export class ErrorResponseDto {
  /** HTTP status code, repeated for convenience. */
  statusCode: number;
  error: ApiErrorDto;
}
