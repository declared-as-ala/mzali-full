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
      className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-sm"
      aria-label={t.language.switcherLabel}
    >
      <Languages size={16} className="ml-2 text-ink-500" aria-hidden />
      {languageOptions.map((option) => {
        const active = option.code === lang;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => changeLanguage(option.code)}
            aria-pressed={active}
            title={option.label}
            className={`grid min-h-8 min-w-9 cursor-pointer place-items-center rounded-lg px-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-brand-200 ${
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
