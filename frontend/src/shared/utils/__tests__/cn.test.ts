import { describe, it, expect } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const condition = false;
    expect(cn('base', condition && 'hidden', 'visible')).toBe('base visible');
  });

  it('merges tailwind conflicting classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('handles empty string', () => {
    expect(cn('')).toBe('');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('resolves tailwind conflicting text colors', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps non-conflicting tailwind classes', () => {
    expect(cn('p-2', 'text-sm', 'font-bold')).toBe('p-2 text-sm font-bold');
  });

  it('handles object syntax for conditional classes', () => {
    expect(cn({ 'bg-red-500': true, 'text-white': true, hidden: false })).toBe(
      'bg-red-500 text-white',
    );
  });
});
