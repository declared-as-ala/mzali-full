import { cookies } from 'next/headers';
import { LANG_COOKIE, normalizeLang, type Lang } from '@/lib/i18n';

export async function getCurrentLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return normalizeLang(cookieStore.get(LANG_COOKIE)?.value);
}
