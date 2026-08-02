'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Edit,
  ExternalLink,
  FolderTree,
  Layers3,
  LoaderCircle,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { Category } from '@/types';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';

type OccupancyFilter = 'all' | 'active' | 'empty';

export default function CategoriesView({ initial }: { initial: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirmModal = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [occupancy, setOccupancy] = useState<OccupancyFilter>('all');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const categoryById = useMemo(
    () => new Map(initial.map((category) => [category.id, category])),
    [initial],
  );

  const totals = useMemo(() => ({
    categories: initial.length,
    roots: initial.filter((category) => !category.parentId).length,
    empty: initial.filter((category) => category.productCount === 0).length,
    productLinks: initial.reduce((sum, category) => sum + category.productCount, 0),
  }), [initial]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr');
    return initial.filter((category) => {
      if (occupancy === 'active' && category.productCount === 0) return false;
      if (occupancy === 'empty' && category.productCount > 0) return false;
      if (!normalizedQuery) return true;
      const parentName = category.parentId ? categoryById.get(category.parentId)?.name ?? '' : '';
      return [category.name, category.slug, category.description ?? '', parentName]
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(normalizedQuery);
    });
  }, [categoryById, initial, occupancy, query]);

  const parentOptions = useMemo(() => {
    if (!editing) return initial;
    const excludedIds = new Set<string>([editing.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of initial) {
        if (category.parentId && excludedIds.has(category.parentId) && !excludedIds.has(category.id)) {
          excludedIds.add(category.id);
          changed = true;
        }
      }
    }
    return initial.filter((category) => !excludedIds.has(category.id));
  }, [editing, initial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, saving]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function openCreate() {
    setEditing(null);
    setName('');
    setSlug('');
    setParentId('');
    setDescription('');
    setFormError('');
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setParentId(category.parentId ?? '');
    setDescription(category.description ?? '');
    setFormError('');
    setOpen(true);
  }

  function closeDialog() {
    if (!saving) setOpen(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setFormError('Le nom de la catégorie est obligatoire.');
      nameRef.current?.focus();
      return;
    }

    setSaving(true);
    setFormError('');
    const body = {
      name: normalizedName,
      slug: slug.trim() || undefined,
      parentId: parentId || null,
      description: description.trim(),
    };
    const url = editing ? `/api/admin/categories/${editing.id}` : '/api/admin/categories';
    const method = editing ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(payload.error || 'Enregistrement impossible');
      setOpen(false);
      toast.success(editing ? `« ${normalizedName} » mise à jour` : `« ${normalizedName} » créée`);
      startTransition(() => router.refresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enregistrement impossible';
      setFormError(`${message}. Vérifiez les informations puis réessayez.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    const ok = await confirmModal({
      title: `Supprimer la catégorie « ${category.name} » ?`,
      message: 'Cette action est irréversible et retirera cette catégorie du catalogue.',
      confirmText: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(category.id);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(payload.error || 'Suppression impossible');
      toast.success(`« ${category.name} » supprimée`);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur de suppression');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            <FolderTree size={15} aria-hidden="true" />
            Organisation du catalogue
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink-950 sm:text-4xl">Catégories</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700 sm:text-base">
            Structurez la navigation de la boutique et gardez une vue claire sur la répartition des produits.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-primary inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-5 shadow-[0_14px_30px_-16px_rgba(16,29,160,0.65)]"
        >
          <Plus size={18} aria-hidden="true" /> Ajouter une catégorie
        </button>
      </header>

      <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs des catégories">
        <MetricCard icon={Tag} label="Catégories" value={totals.categories} tone="brand" />
        <MetricCard icon={Layers3} label="Catégories principales" value={totals.roots} tone="sky" />
        <MetricCard icon={Package} label="Associations produits" value={totals.productLinks} tone="emerald" />
        <MetricCard icon={AlertCircle} label="Catégories vides" value={totals.empty} tone={totals.empty ? 'amber' : 'emerald'} />
      </section>

      <section className="card overflow-hidden" aria-label="Liste des catégories">
        <div className="flex flex-col gap-4 border-b border-ink-200 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-lg">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input min-h-12 pl-11 pr-12"
              placeholder="Rechercher par nom, slug ou description…"
              aria-label="Rechercher une catégorie"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-xl text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Effacer la recherche"
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          <select
            value={occupancy}
            onChange={(event) => setOccupancy(event.target.value as OccupancyFilter)}
            className="input min-h-12 w-full cursor-pointer lg:w-56"
            aria-label="Filtrer les catégories"
          >
            <option value="all">Toutes les catégories</option>
            <option value="active">Avec des produits</option>
            <option value="empty">Catégories vides</option>
          </select>
          {(query || occupancy !== 'all') && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOccupancy('all'); }}
              className="btn-ghost min-h-12 cursor-pointer"
            >
              Réinitialiser
            </button>
          )}
          <p className="text-sm font-semibold tabular-nums text-ink-700 lg:ml-auto" aria-live="polite">
            {filtered.length} résultat{filtered.length === 1 ? '' : 's'}
          </p>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Catégorie</th>
                  <th className="px-5 py-3.5">Slug</th>
                  <th className="px-5 py-3.5">Catégorie Parente</th>
                  <th className="px-5 py-3.5">Produits</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((category) => {
                  const parent = category.parentId ? categoryById.get(category.parentId) : null;
                  const deleting = deletingId === category.id;
                  return (
                    <tr key={category.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-bold text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-black uppercase text-blue-700 border border-blue-100">
                            {category.name.charAt(0) || <Tag size={16} />}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 text-sm">{category.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        /{category.slug}
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-700">
                        {parent ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                            <Layers3 size={13} className="text-slate-500" /> {parent.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-semibold">— Principale</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${
                          category.productCount > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {category.productCount} produit{category.productCount === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600 max-w-xs truncate">
                        {category.description || <span className="italic text-slate-400">Aucune description</span>}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`/categorie/${category.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                            title="Voir dans la boutique"
                          >
                            <ExternalLink size={16} />
                          </a>
                          <button
                            type="button"
                            onClick={() => openEdit(category)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                            title="Modifier"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void remove(category)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-rose-500 hover:bg-rose-50 transition disabled:opacity-40"
                            title="Supprimer"
                          >
                            {deleting ? (
                              <LoaderCircle size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-ink-100 text-ink-500">
              <FolderTree size={26} aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-lg font-black text-ink-950">
              {initial.length === 0 ? 'Votre catalogue n’a pas encore de catégories' : 'Aucune catégorie trouvée'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-700">
              {initial.length === 0
                ? 'Créez une première catégorie pour organiser les produits et simplifier la navigation en boutique.'
                : 'Essayez une autre recherche ou réinitialisez les filtres.'}
            </p>
            {initial.length === 0 && (
              <button type="button" onClick={openCreate} className="btn-primary mt-5 inline-flex min-h-12 cursor-pointer items-center gap-2">
                <Plus size={17} aria-hidden="true" /> Créer une catégorie
              </button>
            )}
          </div>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-dialog-title"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                  {editing ? 'Modification' : 'Nouvelle catégorie'}
                </p>
                <h2 id="category-dialog-title" className="mt-2 text-2xl font-black tracking-tight text-ink-950">
                  {editing ? editing.name : 'Ajouter une catégorie'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Fermer"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={save} noValidate aria-busy={saving}>
              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <label htmlFor="category-name" className="text-sm font-bold text-ink-900">Nom <span className="text-red-600">*</span></label>
                  <input
                    ref={nameRef}
                    id="category-name"
                    className={`input mt-2 min-h-12 ${formError && !name.trim() ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                    value={name}
                    onChange={(event) => { setName(event.target.value); if (formError) setFormError(''); }}
                    placeholder="Ex. Nouveautés"
                    autoComplete="off"
                    aria-invalid={Boolean(formError && !name.trim())}
                    aria-describedby="category-name-help category-form-error"
                  />
                  <p id="category-name-help" className="mt-2 text-xs leading-5 text-ink-500">Visible dans la navigation et sur la page de catégorie.</p>
                </div>

                <div>
                  <label htmlFor="category-slug" className="text-sm font-bold text-ink-900">Slug</label>
                  <input
                    id="category-slug"
                    className="input mt-2 min-h-12 font-mono"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="Généré automatiquement"
                    autoComplete="off"
                    aria-describedby="category-slug-help"
                  />
                  <p id="category-slug-help" className="mt-2 text-xs leading-5 text-ink-500">Laissez vide pour le générer depuis le nom.</p>
                </div>

                <div>
                  <label htmlFor="category-parent" className="text-sm font-bold text-ink-900">Catégorie parente</label>
                  <select
                    id="category-parent"
                    className="input mt-2 min-h-12 cursor-pointer"
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                  >
                    <option value="">Aucune — catégorie principale</option>
                    {parentOptions.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="category-description" className="text-sm font-bold text-ink-900">Description</label>
                    <span className="text-xs tabular-nums text-ink-500">{description.length}/500</span>
                  </div>
                  <textarea
                    id="category-description"
                    className="input mt-2 min-h-28 resize-y py-3"
                    rows={4}
                    maxLength={500}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Décrivez brièvement cette collection…"
                  />
                </div>

                <div id="category-form-error" className="min-h-0" aria-live="polite">
                  {formError && (
                    <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> {formError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-ink-200 bg-ink-100/60 p-5 sm:flex-row sm:justify-end sm:p-6">
                <button type="button" onClick={closeDialog} disabled={saving} className="btn-ghost min-h-12 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
                  Annuler
                </button>
                <button type="submit" disabled={saving || !name.trim()} className="btn-primary inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-45">
                  {saving && <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer la catégorie'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Tag;
  label: string;
  value: number;
  tone: 'brand' | 'sky' | 'emerald' | 'amber';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 ring-brand-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  };

  return (
    <div className="card flex min-h-28 items-center gap-4 p-5">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${tones[tone]}`}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div>
        <p className="text-3xl font-black tabular-nums text-ink-950">{value.toLocaleString('fr-TN')}</p>
        <p className="mt-1 text-sm font-semibold text-ink-700">{label}</p>
      </div>
    </div>
  );
}
