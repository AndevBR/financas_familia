import { isValidISODate, addMonths, addMonthKey, formatDateBR, formatMonth, makeDate, monthEnd, monthRange, diffDays } from '../dates';

describe('dates', () => {
  it('ajusta o dia ao fim do mês', () => {
    expect(makeDate(2026, 2, 31)).toBe('2026-02-28');
    expect(makeDate(2028, 2, 31)).toBe('2028-02-29');
    expect(makeDate(2026, 13, 1)).toBe('2027-01-01');
    expect(makeDate(2026, 0, 1)).toBe('2025-12-01');
  });

  it('soma meses preservando o dia preferido', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonthKey('2026-12', 1)).toBe('2027-01');
    expect(addMonthKey('2026-01', -1)).toBe('2025-12');
  });

  it('formata no padrão brasileiro', () => {
    expect(formatDateBR('2026-10-31')).toBe('31/10/2026');
    expect(formatMonth('2026-03')).toBe('março de 2026');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
  });

  it('lista meses e diferença de dias', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(3);
  });

  it('reconhece datas incompletas enquanto a pessoa digita', () => {
    expect(isValidISODate('2026-11-05')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate('0002-11-05')).toBe(false); // ano ainda sendo digitado
    expect(isValidISODate('0202-11-05')).toBe(false);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
  });
});
