export {
  authenticate,
  hasScope,
  withAuth,
  successResponse,
  errorResponse,
  paginatedResponse,
} from './middleware';

export {
  generateApiKey,
  hashApiKey,
  verifyApiKeyHash,
  extractApiKey,
} from './api-keys';

export type {
  AuthContext,
  ApiErrorCode,
  ApiV1Error,
  ApiV1Success,
  CursorPaginationMeta,
  PaginatedResponse,
} from './types';
