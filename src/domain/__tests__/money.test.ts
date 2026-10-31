import { formatBRL, parseBRL, splitAmount, centsToInput } from '../money';

describe('money', () => {
  it('formata em reais', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(8000)).toBe('R$ 80,00');
    expect(formatBRL(-550)).toBe('-R$ 5,50');
  });

  it('interpreta valores digitados no padrão brasileiro', () => {
    expect(parseBRL('80')).toBe(8000);
    expect(parseBRL('80,5')).toBe(8050);
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('R$ 1.234,56')).toBe(123456);
    expect(parseBRL('1.234')).toBe(123400);
    expect(parseBRL('12.5')).toBe(1250);
    expect(parseBRL('338,')).toBe(33800);
    expect(parseBRL('338,1')).toBe(33810);
    expect(parseBRL('338,19')).toBe(33819);
    expect(parseBRL('1.338,19')).toBe(133819);
    expect(parseBRL(',')).toBeNull();
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('')).toBeNull();
  });

  it('converte de volta para o campo', () => {
    expect(centsToInput(123456)).toBe('1.234,56');
  });

  it('divide parcelas sem perder centavos', () => {
    expect(splitAmount(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitAmount(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(splitAmount(999, 1)).toEqual([999]);
    expect(() => splitAmount(100, 0)).toThrow();
  });
});
