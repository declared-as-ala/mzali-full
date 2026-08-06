'use client';

import { useEffect } from 'react';
import { installSessionFetch, refreshSession, sessionExpiredEventName } from '@/lib/session-client';

type DraftField = { key: string; value: string; checked?: boolean };
type DraftSnapshot = { path: string; fields: DraftField[]; savedAt: number };
const DRAFT_KEY = 'mzali_unsaved_form_draft';

function fieldKey(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number): string {
  return field.dataset.draftKey || field.name || field.id || `${field.tagName}:${field.getAttribute('type') ?? ''}:${index}`;
}

function saveDraft(): void {
  const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'))
    .filter((field) => !['password', 'hidden'].includes(field.getAttribute('type') ?? ''))
    .map((field, index) => ({
      key: fieldKey(field, index),
      value: field.value,
      ...(field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type) ? { checked: field.checked } : {}),
    }));
  const snapshot: DraftSnapshot = { path: `${location.pathname}${location.search}`, fields, savedAt: Date.now() };
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot)); } catch { /* best effort */ }
}

function restoreDraft(): void {
  let snapshot: DraftSnapshot | null = null;
  try { snapshot = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as DraftSnapshot | null; } catch { /* ignore */ }
  if (!snapshot || snapshot.path !== `${location.pathname}${location.search}` || Date.now() - snapshot.savedAt > 24 * 60 * 60 * 1000) return;

  const apply = () => {
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
    const byKey = new Map(snapshot!.fields.map((field) => [field.key, field]));
    let restored = 0;
    fields.forEach((field, index) => {
      const saved = byKey.get(fieldKey(field, index));
      if (!saved) return;
      const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, saved.value);
      if (field instanceof HTMLInputElement && saved.checked !== undefined) field.checked = saved.checked;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      restored += 1;
    });
    if (restored === snapshot!.fields.length) sessionStorage.removeItem(DRAFT_KEY);
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 30_000);
}

export default function SessionBoundary({ loginPath, proactiveSeconds }: { loginPath: string; proactiveSeconds: number }) {
  installSessionFetch();

  useEffect(() => {
    restoreDraft();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const keepAlive = async () => {
      if (document.visibilityState === 'visible') await refreshSession();
      if (!stopped) timer = setTimeout(keepAlive, Math.max(15, proactiveSeconds) * 1000);
    };
    timer = setTimeout(keepAlive, Math.max(15, proactiveSeconds) * 1000);

    const expired = () => {
      saveDraft();
      const from = `${location.pathname}${location.search}`;
      location.assign(`${loginPath}?from=${encodeURIComponent(from)}&sessionExpired=1`);
    };
    window.addEventListener(sessionExpiredEventName(), expired);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(sessionExpiredEventName(), expired);
    };
  }, [loginPath, proactiveSeconds]);

  return null;
}
