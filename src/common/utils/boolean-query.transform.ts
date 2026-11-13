import { Transform } from 'class-transformer';

/**
 * Parses a boolean query-string flag ("true" / "false").
 *
 * The global ValidationPipe enables implicit conversion, which runs before
 * `@Transform` and turns the string "false" into `true`. Reading the raw value
 * from `obj` keeps "false" false.
 */
export function BooleanQuery(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw: unknown = (obj as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === true || raw === 'true';
  });
}
