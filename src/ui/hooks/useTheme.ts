import { useEffect, useState } from 'react';
import { db } from '../../db/database';
import type { Settings } from '../../domain/types';
import { DARK_VARIANT } from '../../domain/defaults';

const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function resolveTheme(pref: Settings['theme'] | undefined): 'claro' | 'escuro' {
  if (pref === 'claro' || pref === 'escuro') return pref;
  return media()?.matches ? 'escuro' : 'claro';
}

/** Aplica o tema no <html> e acompanha a preferência do sistema. */
export function useApplyTheme(pref: Settings['theme'] | undefined) {
  const [resolved, setResolved] = useState(() => resolveTheme(pref));
  useEffect(() => {
    const apply = () => {
      const r = resolveTheme(pref);
      setResolved(r);
      document.documentElement.dataset.theme = r === 'escuro' ? 'dark' : 'light';
    };
    apply();
    const m = media();
    m?.addEventListener?.('change', apply);
    return () => m?.removeEventListener?.('change', apply);
  }, [pref]);
  return resolved;
}

export async function setThemePref(theme: Settings['theme']) {
  const cur = await db.settings.get('app');
  await db.settings.put({ ...(cur ?? { id: 'app' }), id: 'app', theme });
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Cor de série adaptada ao tema (mesmo matiz, passo ajustado para o fundo escuro). */
export function useSeriesColor() {
  const dark = useIsDark();
  return (hex?: string) => {
    const h = (hex ?? '#7a7a74').toLowerCase();
    return dark ? (DARK_VARIANT[h] ?? h) : h;
  };
}

export function useChartTheme() {
  const dark = useIsDark();
  return {
    dark,
    income: dark ? '#3987e5' : '#2a78d6',
    expense: dark ? '#d95926' : '#eb6834',
    accent: dark ? '#199e70' : '#1baf7a',
    grid: dark ? '#2c2e2c' : '#e3e5e0',
    axis: dark ? '#8f8e87' : '#7d7c77',
    surface: dark ? '#1a1a19' : '#ffffff',
  };
}
