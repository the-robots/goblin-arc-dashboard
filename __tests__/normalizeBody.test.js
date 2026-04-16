const { normalizeBody } = require('../lib/normalizeBody');

describe('normalizeBody', () => {
  it('returns { items: [] } for null input', () => {
    const result = normalizeBody(null);
    expect(result).toEqual({ items: [] });
  });

  it('returns { items: [] } for undefined input', () => {
    const result = normalizeBody(undefined);
    expect(result).toEqual({ items: [] });
  });

  it('returns { items: [] } for a non-object input', () => {
    expect(normalizeBody(42)).toEqual({ items: [] });
    expect(normalizeBody('string')).toEqual({ items: [] });
    expect(normalizeBody(true)).toEqual({ items: [] });
  });

  it('handles direct object with items array (Case 2)', () => {
    const input = { items: [{ metadata: { name: 'pod-1' } }] };
    const result = normalizeBody(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].metadata.name).toBe('pod-1');
  });

  it('handles resp.body as object (Case 1)', () => {
    const input = { body: { items: [{ metadata: { name: 'pod-2' } }] } };
    const result = normalizeBody(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].metadata.name).toBe('pod-2');
  });

  it('handles resp.body as JSON string (Case 3)', () => {
    const input = { body: JSON.stringify({ items: [{ metadata: { name: 'pod-3' } }] }) };
    const result = normalizeBody(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].metadata.name).toBe('pod-3');
  });

  it('handles resp.body as invalid JSON string', () => {
    const input = { body: 'not valid json' };
    const result = normalizeBody(input);
    expect(result).toEqual({ items: [] });
  });

  it('handles resp.body as null', () => {
    const input = { body: null };
    const result = normalizeBody(input);
    expect(result).toEqual({ items: [] });
  });

  it('handles body with non-array items property', () => {
    const input = { body: { items: 'not-an-array' } };
    const result = normalizeBody(input);
    expect(result).toEqual({ items: [] });
  });

  it('handles empty items array', () => {
    const input = { items: [] };
    const result = normalizeBody(input);
    expect(result).toEqual({ items: [] });
  });

  it('handles object with no items and no body', () => {
    const input = { something: 'else' };
    const result = normalizeBody(input);
    expect(result).toEqual({ items: [] });
  });
});
