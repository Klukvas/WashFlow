import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { PaginationDto } from './pagination.dto';

function toDto(plain: Record<string, unknown>): PaginationDto {
  return plainToInstance(PaginationDto, plain);
}

describe('PaginationDto', () => {
  describe('defaults', () => {
    it('defaults page to 1', () => {
      const dto = new PaginationDto();
      expect(dto.page).toBe(1);
    });

    it('defaults limit to 20', () => {
      const dto = new PaginationDto();
      expect(dto.limit).toBe(20);
    });

    it('defaults sortOrder to asc', () => {
      const dto = new PaginationDto();
      expect(dto.sortOrder).toBe('asc');
    });

    it('leaves sortBy undefined by default', () => {
      const dto = new PaginationDto();
      expect(dto.sortBy).toBeUndefined();
    });

    it('leaves includeDeleted undefined by default', () => {
      const dto = new PaginationDto();
      expect(dto.includeDeleted).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('passes with default values', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes with valid page and limit', async () => {
      const dto = toDto({ page: 2, limit: 50 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails when page is 0', async () => {
      const dto = toDto({ page: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('page');
    });

    it('fails when page is negative', async () => {
      const dto = toDto({ page: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when limit exceeds 100', async () => {
      const dto = toDto({ limit: 101 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });

    it('fails when limit is 0', async () => {
      const dto = toDto({ limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('passes with sortOrder asc', async () => {
      const dto = toDto({ sortOrder: 'asc' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes with sortOrder desc', async () => {
      const dto = toDto({ sortOrder: 'desc' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails with invalid sortOrder', async () => {
      const dto = toDto({ sortOrder: 'invalid' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('includeDeleted transform', () => {
    it('transforms string "true" to boolean true', () => {
      const dto = toDto({ includeDeleted: 'true' });
      expect(dto.includeDeleted).toBe(true);
    });

    it('transforms boolean true to true', () => {
      const dto = toDto({ includeDeleted: true });
      expect(dto.includeDeleted).toBe(true);
    });

    it('transforms string "false" to false', () => {
      const dto = toDto({ includeDeleted: 'false' });
      expect(dto.includeDeleted).toBe(false);
    });
  });

  describe('includeDeleted through the global ValidationPipe', () => {
    // Mirrors main.ts: implicit conversion used to turn "false" into true.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const parse = (query: Record<string, unknown>) =>
      pipe.transform(query, {
        type: 'query',
        metatype: PaginationDto,
      }) as Promise<PaginationDto>;

    it.each([
      ['false', false],
      ['true', true],
    ])('parses "%s" as %s', async (raw, expected) => {
      expect((await parse({ includeDeleted: raw })).includeDeleted).toBe(
        expected,
      );
    });

    it('leaves an absent flag undefined', async () => {
      expect((await parse({})).includeDeleted).toBeUndefined();
    });

    it('treats any other value as false', async () => {
      await expect(parse({ includeDeleted: 'yes' })).resolves.toMatchObject({
        includeDeleted: false,
      });
    });
  });
});
