'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LANG_COOKIE,
  getDictionary,
  getDirection,
  normalizeLang,
  type Lang,
} from '@/lib/i18n';

type LanguageContextValue = {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: ReturnType<typeof getDictionary>;
  setLang: (lang: Lang) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(normalizeLang(initialLang));

  const setLang = useCallback((nextLang: Lang) => {
    const normalized = normalizeLang(nextLang);
    document.cookie = `${LANG_COOKIE}=${normalized}; path=/; max-age=31536000; samesite=lax`;
    setLangState(normalized);
  }, []);

  useEffect(() => {
    const dir = getDirection(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.body.classList.toggle('rtl', lang === 'ar');
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      dir: getDirection(lang),
      t: getDictionary(lang),
      setLang,
    }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return value;
}
