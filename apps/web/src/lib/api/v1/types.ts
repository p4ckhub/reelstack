import type { User } from '@reelstack/database';
import type { ApiScope } from '@reelstack/types';

/** Authenticated context available in API v1 handlers */
export interface AuthContext {
  user: User;
  /** null for session auth, set for API key auth */
  apiKeyId: string | null;
  scopes: ApiScope[];
}

/** Standard API v1 error codes */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'STORAGE_ERROR'
  | 'QUEUE_ERROR'
  | 'RENDER_ERROR'
  | 'TTS_ERROR'
  | 'TRANSCRIPTION_ERROR';

export interface ApiV1Error {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface ApiV1Success<T = unknown> {
  data: T;
}

export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}
