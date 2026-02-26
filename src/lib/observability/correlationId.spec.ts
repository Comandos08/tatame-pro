import { describe, it, expect, beforeEach } from 'vitest';
import { getCorrelationId, resetCorrelationId } from './correlationId';

describe('correlationId', () => {
  beforeEach(() => {
    resetCorrelationId();
  });

  it('generates an ID on first call', () => {
    const id = getCorrelationId();
    expect(id).toBeTruthy();
    expect(id.startsWith('fe-')).toBe(true);
  });

  it('returns the same ID on subsequent calls', () => {
    const first = getCorrelationId();
    const second = getCorrelationId();
    expect(first).toBe(second);
  });

  it('generates new ID after reset', () => {
    const first = getCorrelationId();
    resetCorrelationId();
    const second = getCorrelationId();
    expect(first).not.toBe(second);
  });
});
