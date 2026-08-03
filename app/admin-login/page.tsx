'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminHref, onAdminSubdomain } from '@/lib/admin-nav';
import {
  ArrowRight,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  TriangleAlert,
  X,
  Sparkles,
  Lock,
  Boxes,
  Zap,
  Building2
} from 'lucide-react';

export default function Login() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <LoginForm />
    </Suspense>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-[1px] shadow-lg shadow-blue-500/20">
        <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-slate-950 font-black text-2xl tracking-tighter text-white">
          M
        </div>
      </div>
      <div>
        <p className="text-base font-black tracking-widest text-white">
          MZALI
        </p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
          Executive Platform
        </p>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <main className="grid min-h-screen bg-[#070A11] lg:grid-cols-2" aria-label="Chargement de la connexion">
      <div className="hidden bg-slate-950 lg:block" />
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/60 p-8 animate-pulse">
          <div className="mb-8 h-12 w-36 rounded-2xl bg-slate-800" />
          <div className="mb-3 h-10 w-48 rounded-xl bg-slate-800" />
          <div className="mb-8 h-5 w-64 rounded bg-slate-800" />
          <div className="mb-5 h-14 rounded-xl bg-slate-800" />
          <div className="mb-6 h-14 rounded-xl bg-slate-800" />
          <div className="h-14 rounded-xl bg-blue-600/40" />
        </div>
      </div>
    </main>
  );
}

type LoginToastState = {
  id: number;
  tone: 'success' | 'error';
  title: string;
  message: string;
};

function LoginToast({ toast, onClose }: { toast: LoginToastState | null; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => setVisible(true));
    const timeout = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onClose, 200);
    }, toast.tone === 'error' ? 5000 : 3500);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [toast, onClose]);

  if (!toast) return null;

  const isSuccess = toast.tone === 'success';
  const Icon = isSuccess ? CircleCheck : TriangleAlert;

  return (
    <div
      className={`fixed inset-x-4 top-6 z-50 mx-auto max-w-sm transition duration-300 ease-out sm:right-6 sm:mx-0 ${
        visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'
      }`}
      role="status"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start gap-3.5">
          <div
            className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            <Icon size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-bold text-white">{toast.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              window.setTimeout(onClose, 200);
            }}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const sp = useSearchParams();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<LoginToastState | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  function notify(tone: LoginToastState['tone'], title: string, message: string) {
    setToast({ id: Date.now(), tone, title, message });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      const message = 'Renseignez votre identifiant et votre mot de passe.';
      setErr(message);
      notify('error', 'Informations manquantes', message);
      (normalizedUsername ? passwordRef : usernameRef).current?.focus();
      return;
    }

    setLoading(true);
    setErr('');
    dismissToast();

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, password }),
      });
      const data = await res.json().catch(() => ({} as { role?: 'admin' | 'employee'; redirect?: string }));
      if (!res.ok) {
        const message = 'Vérifiez votre identifiant et votre mot de passe, puis réessayez.';
        setErr(message);
        notify('error', 'Connexion impossible', message);
        setLoading(false);
        usernameRef.current?.focus();
        return;
      }

      const role = data.role as 'admin' | 'employee' | undefined;
      const home = role === 'employee' ? '/employee' : adminHref('/');
      const fromRaw = sp.get('from');
      // On the admin subdomain, a valid `from` is prefix-free (e.g. '/stock');
      // everywhere else it's /admin-prefixed, matching adminLoginHref()'s callers.
      const fromOk = fromRaw && (
        (role === 'admin' && (
          onAdminSubdomain() ? !fromRaw.startsWith('/admin') : (fromRaw === '/admin' || fromRaw.startsWith('/admin/'))
        )) ||
        (role === 'employee' && fromRaw.startsWith('/employee'))
      );
      const target = (fromOk && fromRaw) || data.redirect || home;
      notify('success', 'Connexion réussie', 'Accès autorisé. Préparation du tableau de bord…');
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      window.location.assign(target);
    } catch {
      const message = 'Le serveur est momentanément indisponible. Réessayez dans un instant.';
      setErr(message);
      notify('error', 'Service indisponible', message);
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A11] text-slate-100 lg:grid lg:grid-cols-12 selection:bg-blue-500 selection:text-white">
      <LoginToast toast={toast} onClose={dismissToast} />

      {/* ── LEFT HERO PANEL (Glass & Glows) ─────────────────────────────── */}
      <section className="relative hidden lg:col-span-7 lg:flex lg:flex-col lg:justify-between p-12 xl:p-16 overflow-hidden border-r border-slate-800/80 bg-slate-950">
        {/* Glow ambient meshes */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-[45rem] w-[45rem] rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[50rem] w-[50rem] rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="pointer-events-none absolute left-1/3 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[130px]" />
        
        {/* Subtle background grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem]" />

        {/* Top Branding */}
        <div className="relative z-10">
          <BrandMark />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-xl my-auto py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-blue-400 mb-6 backdrop-blur-md">
            <Sparkles size={14} className="text-blue-400" />
            Plateforme de Gestion Intégrée
          </div>

          <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl leading-[1.08]">
            L&apos;Excellence Commerciale, <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Haute Précision.
            </span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-slate-400 max-w-lg">
            Pilotez votre réseau de vente, vos stocks multi-dépôts et le suivi des commandes en temps réel grâce à une console d&apos;administration haute performance.
          </p>

          {/* Feature Highlights */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl hover:border-slate-700 transition">
              <Zap size={20} className="text-blue-400 mb-2" />
              <p className="text-sm font-bold text-white">POS Temps Réel</p>
              <p className="text-xs text-slate-500 mt-0.5">Ventes & Caisses</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl hover:border-slate-700 transition">
              <Boxes size={20} className="text-indigo-400 mb-2" />
              <p className="text-sm font-bold text-white">Stock Dépôt</p>
              <p className="text-xs text-slate-500 mt-0.5">Inventaire synchro</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl hover:border-slate-700 transition">
              <Lock size={20} className="text-purple-400 mb-2" />
              <p className="text-sm font-bold text-white">Sécurité NestJS</p>
              <p className="text-xs text-slate-500 mt-0.5">Session chiffrée</p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Système Opérationnel · v2.4</span>
          </div>
          <span>Boutique Ahmed Mzali © {new Date().getFullYear()}</span>
        </div>
      </section>

      {/* ── RIGHT LOGIN CARD PANEL ────────────────────────────────────────── */}
      <section className="relative lg:col-span-5 flex min-h-screen items-center justify-center p-6 sm:p-10 lg:p-12">
        {/* Glow ambient */}
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-600/10 blur-[100px]" />

        <div className="relative z-10 w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 lg:hidden flex justify-center">
            <BrandMark />
          </div>

          {/* Login Card */}
          <div className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-8 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:p-10">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 rounded-xl bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-400 border border-blue-500/20 mb-3">
                <ShieldCheck size={14} /> Espace d&apos;Authentification
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Connexion
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-400">
                Saisissez vos identifiants pour accéder à la console.
              </p>
            </div>

            <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-2.5">
                  Identifiant ou Email
                </label>
                <div className="group relative flex items-center">
                  <Mail className="pointer-events-none absolute left-4 text-slate-400 group-focus-within:text-blue-400 transition-colors duration-200" size={20} />
                  <input
                    ref={usernameRef}
                    id="username"
                    type="text"
                    autoFocus
                    autoComplete="username"
                    spellCheck={false}
                    disabled={loading}
                    className={`h-15 w-full rounded-2xl border bg-slate-950/90 pl-12 pr-11 text-base font-semibold text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-blue-500 focus:bg-slate-950 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50 ${
                      err ? 'border-rose-500/60 focus:border-rose-500' : 'border-slate-800 hover:border-slate-700'
                    }`}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (err) setErr('');
                    }}
                    placeholder="admin ou votre email"
                    required
                  />
                  {username && !loading && (
                    <button
                      type="button"
                      onClick={() => { setUsername(''); usernameRef.current?.focus(); }}
                      className="absolute right-3.5 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
                      aria-label="Effacer"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-2.5">
                  Mot de passe
                </label>
                <div className="group relative flex items-center">
                  <KeyRound className="pointer-events-none absolute left-4 text-slate-400 group-focus-within:text-blue-400 transition-colors duration-200" size={20} />
                  <input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    disabled={loading}
                    className={`h-15 w-full rounded-2xl border bg-slate-950/90 pl-12 pr-12 text-base font-semibold text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-blue-500 focus:bg-slate-950 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50 ${
                      err ? 'border-rose-500/60 focus:border-rose-500' : 'border-slate-800 hover:border-slate-700'
                    }`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (err) setErr('');
                    }}
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    className="absolute right-2.5 grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {err && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-300">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="group relative flex h-15 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-bold text-base text-white shadow-xl shadow-blue-500/25 transition duration-200 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-black transition group-hover:from-blue-500 group-hover:to-indigo-500">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Authentification…</span>
                    </div>
                  ) : (
                    <>
                      <span>Se connecter</span>
                      <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </div>
              </button>
            </form>

            <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-800/80 pt-6 text-[11px] font-semibold text-slate-500">
              <Lock size={13} className="text-slate-400" />
              <span>Chiffrement SSL 256 bits · Session sécurisée</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
