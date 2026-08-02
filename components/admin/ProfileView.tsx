'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  UserCircle, Lock, RotateCcw, ShieldCheck, Eye, EyeOff, Check, AlertCircle,
  KeyRound, ImageIcon, Phone, Plus, Trash2, Instagram, Facebook, Music2, Globe,
  LogOut, Sparkles, Building2, ShieldAlert, BadgeCheck, Save
} from 'lucide-react';
import ImageUploader from '@/components/admin/ImageUploader';
import { useConfirm } from '@/components/admin/ConfirmModal';

type Props = {
  username: string;
  hasCustomPassword: boolean;
  passwordUpdatedAt: string | null;
  envFallbackEnabled: boolean;
  mustChangePassword: boolean;
};

type SiteInfo = {
  photoUrl: string;
  phones: string[];
  whatsapp: string;
  instagram: string;
  tiktok: string;
  facebook: string;
};

export default function ProfileView({
  username,
  hasCustomPassword,
  passwordUpdatedAt,
  envFallbackEnabled,
  mustChangePassword,
}: Props) {
  const router = useRouter();
  const confirmModal = useConfirm();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Site info state ─────────────────────────────────────────────────────────
  const [siteInfo, setSiteInfo] = useState<SiteInfo>({
    photoUrl: '',
    phones: [''],
    whatsapp: '',
    instagram: '',
    tiktok: '',
    facebook: '',
  });
  const [siteStatus, setSiteStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/site-settings')
      .then((r) => r.json())
      .then((d: SiteInfo) =>
        setSiteInfo({
          photoUrl: d.photoUrl ?? '',
          phones: d.phones?.length ? d.phones : [''],
          whatsapp: d.whatsapp ?? '',
          instagram: d.instagram ?? '',
          tiktok: d.tiktok ?? '',
          facebook: d.facebook ?? '',
        })
      )
      .catch(() => {});
  }, []);

  async function saveSiteInfo(e: React.FormEvent) {
    e.preventDefault();
    setSiteStatus(null);
    const phones = siteInfo.phones.map((p) => p.trim()).filter(Boolean);
    if (!phones.length) {
      setSiteStatus({ kind: 'err', msg: 'Au moins un numéro de téléphone est requis.' });
      return;
    }
    setSiteBusy(true);
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...siteInfo, phones }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur lors de la sauvegarde.');
      setSiteStatus({ kind: 'ok', msg: 'Informations de la boutique mises à jour avec succès.' });
      startTransition(() => router.refresh());
    } catch (err) {
      setSiteStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSiteBusy(false);
    }
  }

  function addPhone() {
    setSiteInfo((s) => ({ ...s, phones: [...s.phones, ''] }));
  }

  function removePhone(i: number) {
    setSiteInfo((s) => ({ ...s, phones: s.phones.filter((_, idx) => idx !== i) }));
  }

  function updatePhone(i: number, val: string) {
    setSiteInfo((s) => {
      const phones = [...s.phones];
      phones[i] = val;
      return { ...s, phones };
    });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!next || next !== confirm) {
      setStatus({ kind: 'err', msg: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    if (next.length < 6) {
      setStatus({ kind: 'err', msg: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur lors de la modification.');
      setStatus({ kind: 'ok', msg: 'Mot de passe modifié avec succès.' });
      setCurrent('');
      setNext('');
      setConfirm('');
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await confirmModal({
      title: 'Réinitialiser le mot de passe ?',
      message: 'Le mot de passe par défaut (.env ADMIN_PASSWORD) sera de nouveau actif pour ce compte.',
      confirmText: 'Réinitialiser',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/profile', { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur de réinitialisation');
      setStatus({ kind: 'ok', msg: 'Mot de passe réinitialisé au mot de passe par défaut.' });
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    const ok = await confirmModal({
      title: 'Se déconnecter ?',
      message: 'Vous devrez saisir vos identifiants pour vous reconnecter.',
      confirmText: 'Déconnexion',
      tone: 'info',
    });
    if (!ok) return;
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/admin-login');
  }

  return (
    <div className={`p-6 sm:p-8 max-w-7xl mx-auto space-y-8 ${pending ? 'opacity-75 transition-opacity' : ''}`}>
      {/* ── Top Cover Banner & Header ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Cover Gradient Mesh */}
        <div className="h-32 sm:h-40 w-full bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:2rem_2rem]" />
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -right-20 -bottom-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        </div>

        {/* Profile Card Header Info */}
        <div className="px-6 sm:px-8 pb-6 pt-0 relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-12 sm:-mt-14">
          <div className="flex items-end gap-4">
            <div className="relative grid h-24 w-24 sm:h-28 sm:w-28 place-items-center rounded-3xl bg-white p-1 shadow-xl">
              {siteInfo.photoUrl ? (
                <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-slate-100">
                  <Image src={siteInfo.photoUrl} alt="Logo" fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="grid h-full w-full place-items-center rounded-[20px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-3xl">
                  {username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow-md ring-4 ring-white" title="Compte Actif">
                <BadgeCheck size={16} />
              </div>
            </div>

            <div className="pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{username}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-black text-blue-700">
                  <ShieldCheck size={13} /> Administrateur
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
                Gestion des accès, sécurité du compte & coordonnées boutique
              </p>
            </div>
          </div>

          <button
            onClick={logoutAll}
            className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 transition shadow-sm"
          >
            <LogOut size={15} /> Déconnexion
          </button>
        </div>
      </div>

      {mustChangePassword && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={20} />
          <div>
            <p className="text-sm font-extrabold text-amber-900">Mot de passe temporaire détecté</p>
            <p className="text-xs font-semibold text-amber-800 mt-0.5">
              Veuillez personnaliser votre mot de passe ci-dessous pour sécuriser l'accès à la console.
            </p>
          </div>
        </div>
      )}

      {/* ── Main Grid Layout ─────────────────────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Store Information (7 cols) */}
        <section className="lg:col-span-7 space-y-6">
          <form onSubmit={saveSiteInfo} className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="rounded-2xl bg-blue-50 p-2.5 text-blue-600 border border-blue-100">
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Identité & Coordonnées Boutique</h2>
                  <p className="text-xs font-semibold text-slate-500">Logo et liens affichés sur le site web et les factures</p>
                </div>
              </div>
            </div>

            {/* Logo Image Upload */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <ImageIcon size={14} className="text-blue-600" /> Logo / Image de Marque
              </label>
              <div className="flex items-center gap-4">
                {siteInfo.photoUrl && (
                  <div className="relative h-20 w-20 flex-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    <Image src={siteInfo.photoUrl} alt="Logo" fill className="object-cover" unoptimized />
                  </div>
                )}
                <ImageUploader
                  onUploaded={(img) => setSiteInfo((s) => ({ ...s, photoUrl: img.url }))}
                  className="flex h-20 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 transition hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <ImageIcon size={18} className="text-blue-600" />
                    {siteInfo.photoUrl ? 'Remplacer le logo' : 'Téléverser un logo (PNG/SVG)'}
                  </span>
                </ImageUploader>
              </div>
            </div>

            {/* Phone Numbers List */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <Phone size={14} className="text-blue-600" /> Numéros de Téléphone Service Client
              </label>
              <div className="space-y-2.5">
                {siteInfo.phones.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        value={p}
                        onChange={(e) => updatePhone(i, e.target.value)}
                        placeholder="Ex: 22 479 443"
                      />
                    </div>
                    {siteInfo.phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePhone(i)}
                        className="grid h-9 w-9 place-items-center rounded-xl text-rose-500 hover:bg-rose-50 transition shrink-0"
                        title="Supprimer ce numéro"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPhone}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <Plus size={14} className="text-blue-600" /> Ajouter un autre numéro
                </button>
              </div>
            </div>

            {/* Social Links Grid */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Phone size={14} className="text-emerald-600" /> WhatsApp
                </label>
                <input
                  type="tel"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  value={siteInfo.whatsapp}
                  onChange={(e) => setSiteInfo((s) => ({ ...s, whatsapp: e.target.value }))}
                  placeholder="Ex: 22479443"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Instagram size={14} className="text-pink-600" /> Instagram URL
                </label>
                <input
                  type="url"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  value={siteInfo.instagram}
                  onChange={(e) => setSiteInfo((s) => ({ ...s, instagram: e.target.value }))}
                  placeholder="https://instagram.com/ma_boutique"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Music2 size={14} className="text-slate-900" /> TikTok URL
                </label>
                <input
                  type="url"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-200"
                  value={siteInfo.tiktok}
                  onChange={(e) => setSiteInfo((s) => ({ ...s, tiktok: e.target.value }))}
                  placeholder="https://tiktok.com/@ma_boutique"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Facebook size={14} className="text-blue-600" /> Facebook Page
                </label>
                <input
                  type="url"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  value={siteInfo.facebook}
                  onChange={(e) => setSiteInfo((s) => ({ ...s, facebook: e.target.value }))}
                  placeholder="https://facebook.com/ma_boutique"
                />
              </div>
            </div>

            {siteStatus && (
              <div className={`flex items-center gap-2 rounded-2xl p-3.5 text-xs font-bold border ${
                siteStatus.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {siteStatus.kind === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}
                <span>{siteStatus.msg}</span>
              </div>
            )}

            <button
              disabled={siteBusy}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-blue-600 px-6 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-98 disabled:opacity-50 transition cursor-pointer"
            >
              <Save size={16} />
              <span>{siteBusy ? 'Enregistrement…' : 'Enregistrer les coordonnées'}</span>
            </button>
          </form>
        </section>

        {/* Right Column: Security & Password (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          {/* Account Status Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Statut de la Session</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <span className="text-xs font-bold text-slate-700">Identifiant Connecté</span>
                <span className="text-xs font-black text-slate-900">{username}</span>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <span className="text-xs font-bold text-slate-700">Mot de passe</span>
                {hasCustomPassword ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700 border border-emerald-200">
                    <Check size={12} /> Personnalisé
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-700 border border-amber-200">
                    <AlertCircle size={12} /> Par défaut (.env)
                  </span>
                )}
              </div>

              {passwordUpdatedAt && (
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-xs font-semibold text-slate-600">
                  <span>Dernière modification</span>
                  <span className="font-bold text-slate-900">{new Date(passwordUpdatedAt).toLocaleDateString('fr-FR')}</span>
                </div>
              )}

              {envFallbackEnabled && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 space-y-1">
                  <p className="flex items-center gap-1.5 font-bold text-blue-900">
                    <ShieldCheck size={15} className="text-blue-600" /> Mot de Passe de Secours Actif
                  </p>
                  <p className="text-[11px] text-blue-800/80 leading-relaxed">
                    Si besoin, la clé définie dans <code className="rounded bg-blue-100 px-1 font-mono">.env.local</code> peut servir de secours.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Change Password Form */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600 border border-indigo-100">
                <Lock size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">Modifier le Mot de Passe</h2>
                <p className="text-xs font-semibold text-slate-500">Minimum 6 caractères</p>
              </div>
            </div>

            <form onSubmit={changePassword} className="space-y-4">
              <PasswordField
                label="Mot de passe actuel"
                value={current}
                onChange={setCurrent}
                show={showCurrent}
                onToggleShow={() => setShowCurrent(!showCurrent)}
                autoComplete="current-password"
              />

              <PasswordField
                label="Nouveau mot de passe"
                value={next}
                onChange={setNext}
                show={showNext}
                onToggleShow={() => setShowNext(!showNext)}
                autoComplete="new-password"
              />

              <PasswordField
                label="Confirmer le nouveau mot de passe"
                value={confirm}
                onChange={setConfirm}
                show={showNext}
                onToggleShow={() => setShowNext(!showNext)}
                autoComplete="new-password"
              />

              {status && (
                <div className={`flex items-center gap-2 rounded-2xl p-3.5 text-xs font-bold border ${
                  status.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {status.kind === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}
                  <span>{status.msg}</span>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  disabled={busy || !current || !next || !confirm}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 font-bold text-xs text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-98 disabled:opacity-40 transition cursor-pointer"
                >
                  <KeyRound size={16} />
                  <span>{busy ? 'Mise à jour…' : 'Valider le mot de passe'}</span>
                </button>

                {envFallbackEnabled && hasCustomPassword && (
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40 transition"
                  >
                    <RotateCcw size={15} />
                    <span>Réinitialiser au mot de passe .env</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">{label}</label>
      <div className="relative flex items-center">
        <input
          type={show ? 'text' : 'password'}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-11 text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-100"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          className="absolute right-2 grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          aria-label={show ? 'Masquer' : 'Afficher'}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
