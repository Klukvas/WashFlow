import { PaginationDto } from './pagination.dto';

export function buildPaginationArgs(dto: PaginationDto) {
  const skip = (dto.page - 1) * dto.limit;
  const take = dto.limit;
  const orderBy = dto.sortBy
    ? { [dto.sortBy]: dto.sortOrder || 'asc' }
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
