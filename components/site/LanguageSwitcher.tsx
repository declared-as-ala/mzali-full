'use client';

import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { languageOptions, type Lang } from '@/lib/i18n';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();

  function changeLanguage(nextLang: Lang) {
    if (nextLang === lang) return;
    setLang(nextLang);
    router.refresh();
  }

  return (
    <div
      dir="ltr"
      className="inline-flex min-h-9 sm:min-h-11 items-center gap-0.5 sm:gap-1 rounded-xl border border-ink-200 bg-white p-0.5 sm:p-1 shadow-sm shrink-0"
      aria-label={t.language.switcherLabel}
    >
      <Languages size={15} className="hidden sm:block ml-1.5 text-ink-500" aria-hidden />
      {languageOptions.map((option) => {
        const active = option.code === lang;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => changeLanguage(option.code)}
            aria-pressed={active}
            title={option.label}
            className={`grid min-h-7 min-w-7 sm:min-h-8 sm:min-w-9 cursor-pointer place-items-center rounded-lg px-1.5 sm:px-2 text-[11px] sm:text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-brand-200 ${
              active
                ? 'bg-brand-500 text-white shadow-soft'
                : 'text-ink-700 hover:bg-ink-100'
            }`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
