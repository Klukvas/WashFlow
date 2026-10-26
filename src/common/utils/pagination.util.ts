import { PaginationDto } from './pagination.dto';

export function buildPaginationArgs<const T extends string>(
  dto: PaginationDto,
  allowedSortFields: readonly T[],
) {
  const skip = (dto.page - 1) * dto.limit;
  const take = dto.limit;

  const sortField =
    dto.sortBy && allowedSortFields.some((field) => field === dto.sortBy)
      ? (dto.sortBy as T)
      : undefined;

  const orderBy = sortField
    ? ({ [sortField]: dto.sortOrder || 'asc' } as Partial<
        Record<T, 'asc' | 'desc'>
      >)
    : { createdAt: 'desc' as const };

  return { skip, take, orderBy };
}

export function buildPaginationMeta(total: number, dto: PaginationDto) {
  return {
    total,
    page: dto.page,
    limit: dto.limit,
    totalPages: Math.ceil(total / dto.limit),
  };
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  dto: PaginationDto,
) {
  return {
    items,
    ...buildPaginationMeta(total, dto),
  };
}
