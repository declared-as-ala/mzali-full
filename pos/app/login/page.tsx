'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Zap,
  Store,
  QrCode,
  Lock,
  X
} from 'lucide-react';
import { getTerminalCode } from '@/lib/device';

export default function LoginPage() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getTerminalCode()) router.replace('/pairing');
  }, [router]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Erreur de connexion');
      const from = new URLSearchParams(window.location.search).get('from');
      const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F4F6F9] text-slate-900 lg:grid lg:grid-cols-12 selection:bg-blue-600 selection:text-white">
      {/* ── LEFT HERO PANEL (Clean Light Blue Brand Experience) ─────────────────────────────── */}
      <section className="relative hidden lg:col-span-7 lg:flex lg:flex-col lg:justify-between p-12 xl:p-16 overflow-hidden border-r border-slate-200 bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-950 text-white">
        {/* Glow ambient meshes */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-[45rem] w-[45rem] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[50rem] w-[50rem] rounded-full bg-indigo-500/20 blur-[140px]" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white p-[1px] shadow-lg">
            <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-blue-600 font-black text-2xl tracking-tighter text-white">
              M
            </div>
          </div>
          <div>
            <p className="text-base font-black tracking-widest text-white">
              MZALI POS
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
              Terminal de Caisse Pro
            </p>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-xl my-auto py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-blue-200 mb-6 backdrop-blur-md">
            <Sparkles size={14} className="text-blue-300" />
            Caisse Enregistreuse & Encaissement Rapide
          </div>

          <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl leading-[1.08]">
            Vendez Simplement, <br />
            <span className="text-blue-200">
              Encaissez à Toute Vitesse.
            </span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-blue-100/80 max-w-lg">
            Connectez-vous à votre session de caisse autorisée pour traiter les paniers, scanner les produits et imprimer les tickets en un instant.
          </p>

          {/* Feature Highlights */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <Zap size={20} className="text-blue-300 mb-2" />
              <p className="text-sm font-bold text-white">Encaissement Express</p>
              <p className="text-xs text-blue-200/70 mt-0.5">Espèces en comptant</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <QrCode size={20} className="text-indigo-300 mb-2" />
              <p className="text-sm font-bold text-white">Fidélité par QR</p>
              <p className="text-xs text-blue-200/70 mt-0.5">Scan carte client instantané</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
              <Store size={20} className="text-sky-300 mb-2" />
              <p className="text-sm font-bold text-white">Session Vente</p>
              <p className="text-xs text-blue-200/70 mt-0.5">Rapprochement de caisse</p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-blue-200/70">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Terminal Appairé · Prêt pour la Vente</span>
          </div>
          <span>Mzali POS © {new Date().getFullYear()}</span>
        </div>
      </section>

      {/* ── RIGHT POS LOGIN CARD PANEL (Light Executive Theme) ───────────────────────────────────── */}
      <section className="relative lg:col-span-5 flex min-h-screen items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="relative z-10 w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 lg:hidden flex justify-center">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 font-black text-xl text-white shadow-md">
                M
              </div>
              <div>
                <p className="text-base font-black tracking-widest text-slate-900">MZALI POS</p>
                <p className="text-xs font-bold text-blue-600">Terminal de Caisse</p>
              </div>
            </div>
          </div>

          {/* Login Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-10">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-100 mb-3">
                <LockKeyhole size={14} /> Session Caissier / Vendeur
              </div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Connexion Caisse
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Saisissez votre e-mail professionnel pour démarrer le service.
              </p>
            </div>

            <form onSubmit={submit} noValidate className="space-y-5">
              <div>
                <label htmlFor={emailId} className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2.5">
                  Email du caissier
                </label>
                <div className="group relative flex items-center">
                  <Mail className="pointer-events-none absolute left-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" size={20} />
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={busy}
                    placeholder="prenom@entreprise.com"
                    className={`h-15 w-full rounded-2xl border bg-slate-50 pl-12 pr-11 text-base font-semibold text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 ${
                      error ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {email && !busy && (
                    <button
                      type="button"
                      onClick={() => setEmail('')}
                      className="absolute right-3.5 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                      aria-label="Effacer"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor={passwordId} className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2.5">
                  Mot de passe
                </label>
                <div className="group relative flex items-center">
                  <LockKeyhole className="pointer-events-none absolute left-4 text-slate-400 group-focus-within:text-blue-600 transition-colors duration-200" size={20} />
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    placeholder="••••••••••••"
                    className={`h-15 w-full rounded-2xl border bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-50 ${
                      error ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={busy}
                    className="absolute right-2.5 grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                  className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700"
                >
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="group relative flex h-15 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-blue-600 font-bold text-base text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy ? (
                  <div className="flex items-center gap-2">
                    <LoaderCircle size={18} className="animate-spin" />
                    <span>Ouverture de Session…</span>
                  </div>
                ) : (
                  <>
                    <span>Accéder à la Caisse</span>
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-[11px] font-semibold text-slate-500">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Session sécurisée · Terminal Appairé & Vérifié</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
