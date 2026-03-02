import { PaginationDto } from './pagination.dto';

const ALLOWED_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'status',
  'scheduledStart',
  'scheduledEnd',
  'totalPrice',
  'price',
  'sortOrder',
  'durationMin',
  'licensePlate',
  'make',
  'model',
]);

export function buildPaginationArgs(dto: PaginationDto) {
  const skip = (dto.page - 1) * dto.limit;
  const take = dto.limit;

  const sortField =
    dto.sortBy && ALLOWED_SORT_FIELDS.has(dto.sortBy) ? dto.sortBy : undefined;

  const orderBy = sortField
    ? { [sortField]: dto.sortOrder || 'asc' }
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
