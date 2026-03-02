export interface ApiResponse<T> {
  data: T;
  meta: {
    timestamp: string;
  };
}

/**
 * Unwrapped paginated result used by hooks and page components.
 */
export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * The actual shape returned by the backend for paginated endpoints:
 * { data: T[], meta: { timestamp, total, page, limit, totalPages } }
 */
export interface PaginatedApiResponse<T> {
  data: T[];
  meta: {
    timestamp: string;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface TimeSlot {
  start: string;
  end: string;
  workPostId: string;
  workPostName: string;
  available: boolean;
}
