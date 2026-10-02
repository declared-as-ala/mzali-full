import { escapeRegex, orderSearchCondition } from './order-search';

const clauses = (q: string) => (orderSearchCondition(q).$or as Record<string, { $regex?: string }>[]) ?? [];
const fields = (q: string) => clauses(q).map((c) => Object.keys(c)[0]);
const regexOf = (q: string, field: string) => clauses(q).find((c) => field in c)?.[field]?.$regex;

describe('orderSearchCondition', () => {
  it('a numeric search never touches the customer name', () => {
    expect(fields('234')).not.toContain('customer.firstName');
    expect(fields('22334455')).not.toContain('customer.firstName');
  });

  it('short numbers (first keystrokes) match the order number exactly and phones by PREFIX (tight index ranges)', () => {
    expect(clauses('234')).toContainEqual({ orderNumber: 234 });
    expect(regexOf('234', 'customer.phone')).toBe('^234');
    expect(regexOf('2345', 'carrier.navex.tracking')).toBe('^2345');
  });

  it('from 5 digits on, phone and tracking numbers match by contains', () => {
    expect(regexOf('22334', 'customer.phone')).toBe('22334');
    expect(regexOf('22334455', 'customer.phone')).toBe('22334455');
    expect(clauses('22334455')).toContainEqual({ orderNumber: 22334455 });
  });

  it('a text search looks at the name (and tracking prefixes) but not the order number or phone', () => {
    expect(fields('ahmed')).toContain('customer.firstName');
    expect(fields('ahmed')).not.toContain('orderNumber');
    expect(fields('ahmed')).not.toContain('customer.phone');
  });

  it('a tracking-code style search (letters + digits) does not scan names', () => {
    expect(fields('NX123')).not.toContain('customer.firstName');
    expect(regexOf('NX123', 'carrier.navex.tracking')).toBe('NX123');
  });

  it('escapes regex characters instead of breaking the query', () => {
    expect(escapeRegex('a(b)+c')).toBe('a\\(b\\)\\+c');
    expect(regexOf('ahmed(', 'customer.firstName')).toBe('ahmed\\(');
  });

  it('an empty or blank search adds no condition', () => {
    expect(orderSearchCondition('')).toEqual({});
    expect(orderSearchCondition('   ')).toEqual({});
  });
});
