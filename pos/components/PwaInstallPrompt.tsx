'use client';

import { useEffect, useState } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'mzali_pos_install_dismissed';

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      if (localStorage.getItem(DISMISSED_KEY) !== '1') setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (!installPrompt) return null;

  async function install() {
    if (!installPrompt) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setInstallPrompt(null);
  }

  return (
    <aside className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-blue-200 bg-white p-2 shadow-2xl shadow-slate-900/20" role="status">
      <button
        type="button"
        onClick={install}
        disabled={installing}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[.98] disabled:cursor-wait disabled:opacity-70"
      >
        {installing ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
        {installing ? 'Installation…' : 'Installer Mzali POS'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        disabled={installing}
        className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-wait disabled:opacity-50"
        aria-label="Masquer la proposition d'installation"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
