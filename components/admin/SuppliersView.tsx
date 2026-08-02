'use client';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Clock, FileText, History, Package, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';

type Supplier = {
  id: string;
  code: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  billingAddress: { line1: string | null; city: string | null } | null;
  notes: string | null;
  status: string;
  totalProducts: number;
  totalPurchaseOrders: number;
  lastPurchaseOrderAt: string | null;
};

type SupplierProduct = {
  id: string;
  supplierId: string;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  purchasePriceMinor: number;
  suggestedSellingPriceMinor: number | null;
  notes: string | null;
  active: boolean;
  priceHistory: { priceMinor: number; at: string }[];
};

function formatMinor(minor: number | null): string {
  if (minor == null) return '—';
  return `${(minor / 1000).toFixed(3)} DT`;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Actif', INACTIVE: 'Inactif', BLOCKED: 'Bloqué' };

export default function SuppliersView() {
  const toast = useToast();
  const confirmModal = useConfirm();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/suppliers', { cache: 'no-store' });
      setSuppliers(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function deleteOne(s: Supplier) {
    const ok = await confirmModal({
      title: `Supprimer le fournisseur « ${s.companyName} » ?`,
      message: 'Son catalogue de produits sera supprimé. Les bons de commande déjà générés restent conservés.',
      confirmText: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(s.id);
    try {
      const res = await fetch(`/api/admin/suppliers/${s.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Suppression impossible');
      toast.success(`Fournisseur « ${s.companyName} » supprimé`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Fournisseurs</h1>
          <p className="text-ink-700">Coordonnées et catalogue de produits par fournisseur.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <a href="/admin/purchase-orders" className="btn-ghost inline-flex items-center gap-2">
            <FileText size={14} /> Bons de commande
          </a>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Nouveau fournisseur
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Entreprise</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-center">Produits</th>
              <th className="px-4 py-3 text-center">Bons de commande</th>
              <th className="px-4 py-3">Dernier bon</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => {
              const deleting = deletingId === s.id;
              return (
                <tr key={s.id} className="border-t border-ink-200 transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-ink-900">
                    <span className="inline-flex items-center gap-2"><Building2 size={14} className="text-ink-500" /> {s.companyName}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{s.contactName ?? s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-bold text-ink-900">{s.totalProducts}</td>
                  <td className="px-4 py-3 text-center font-bold text-ink-900">{s.totalPurchaseOrders}</td>
                  <td className="px-4 py-3 text-xs text-ink-700">
                    {s.lastPurchaseOrderAt ? new Date(s.lastPurchaseOrderAt).toLocaleDateString('fr-TN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${s.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-700'}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetailId(s.id)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button>
                      <button
                        onClick={() => deleteOne(s)}
                        disabled={deleting}
                        className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                        title="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!suppliers.length && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-700">Aucun fournisseur.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <CreateSupplierDrawer onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {detailId && <SupplierDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />}
    </div>
  );
}

function CreateSupplierDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!companyName.trim()) { toast.error("Nom de l'entreprise requis"); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
          email: email.trim() || undefined,
          billingAddress: address.trim() ? { line1: address.trim() } : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Fournisseur créé');
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-ink-900">Nouveau fournisseur</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-bold">Entreprise
            <input className="input mt-1" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Contact
            <input className="input mt-1" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">Téléphone
              <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block text-sm font-bold">WhatsApp
              <input className="input mt-1" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm font-bold">Email
            <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Adresse
            <input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Notes
            <textarea className="input mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <button disabled={busy} onClick={submit} className="btn-primary mt-5 w-full disabled:opacity-40">
          {busy ? 'Création…' : 'Créer'}
        </button>
      </div>
    </div>
  );
}

function SupplierDetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [adding, setAdding] = useState(false);
  const [historyFor, setHistoryFor] = useState<SupplierProduct | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/admin/suppliers/${id}`, { cache: 'no-store' }),
        fetch(`/api/admin/supplier-products?supplierId=${id}`, { cache: 'no-store' }),
      ]);
      if (sRes.ok) setSupplier(await sRes.json());
      if (pRes.ok) setProducts(await pRes.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  const visible = useMemo(() => products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active' && !p.active) return false;
    if (statusFilter === 'inactive' && p.active) return false;
    return true;
  }), [products, search, statusFilter]);

  async function deleteProduct(p: SupplierProduct) {
    const res = await fetch(`/api/admin/supplier-products/${p.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Suppression impossible'); return; }
    toast.success('Produit supprimé du catalogue');
    load();
    onChanged();
  }

  if (!supplier) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{supplier.companyName}</h2>
            <p className="text-sm text-ink-700">{supplier.contactName ?? '—'} · {supplier.phone ?? '—'}{supplier.whatsapp ? ` · WhatsApp ${supplier.whatsapp}` : ''}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-ink-100 p-3 text-center">
            <p className="text-2xl font-black text-ink-900">{supplier.totalProducts}</p>
            <p className="text-[11px] font-bold uppercase text-ink-600">Produits</p>
          </div>
          <div className="rounded-xl bg-ink-100 p-3 text-center">
            <p className="text-2xl font-black text-ink-900">{supplier.totalPurchaseOrders}</p>
            <p className="text-[11px] font-bold uppercase text-ink-600">Bons de commande</p>
          </div>
          <div className="rounded-xl bg-ink-100 p-3 text-center">
            <p className="text-sm font-black text-ink-900 mt-1.5">{supplier.lastPurchaseOrderAt ? new Date(supplier.lastPurchaseOrderAt).toLocaleDateString('fr-TN') : '—'}</p>
            <p className="text-[11px] font-bold uppercase text-ink-600">Dernier bon</p>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wide text-ink-700">Catalogue produits</h3>
          <button onClick={() => setAdding(true)} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Plus size={13} /> Ajouter un produit
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input py-1.5 pl-8 text-xs" placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto py-1.5 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-ink-500">Chargement…</p>
          ) : !visible.length ? (
            <p className="text-sm text-ink-500">Aucun produit dans le catalogue.</p>
          ) : (
            visible.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${p.active ? 'bg-ink-100' : 'bg-ink-100 opacity-60'}`}>
                <Package size={14} className="shrink-0 text-ink-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900">{p.name}</p>
                  <p className="truncate text-[11px] text-ink-500">{[p.category, p.brand, p.size, p.color].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <span className="font-black text-brand-700">{formatMinor(p.purchasePriceMinor)}</span>
                {p.priceHistory.length > 1 && (
                  <button onClick={() => setHistoryFor(p)} title="Historique des prix" className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-200">
                    <History size={14} />
                  </button>
                )}
                <button onClick={() => deleteProduct(p)} title="Supprimer" className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {adding && (
          <AddSupplierProductForm
            supplierId={id}
            onDone={() => { setAdding(false); load(); onChanged(); }}
            onCancel={() => setAdding(false)}
          />
        )}
        {historyFor && <PriceHistoryModal product={historyFor} onClose={() => setHistoryFor(null)} />}
      </div>
    </div>
  );
}

type StoreProduct = { id: string; name: string; price: number; image: string };

function AddSupplierProductForm({ supplierId, onDone, onCancel }: { supplierId: string; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'catalog' | 'manual'>('catalog');
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [loadingStore, setLoadingStore] = useState(true);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [suggestedSellingPrice, setSuggestedSellingPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/products-picker')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: StoreProduct[]) => setStoreProducts(Array.isArray(rows) ? rows : []))
      .catch(() => setStoreProducts([]))
      .finally(() => setLoadingStore(false));
  }, []);

  const visibleStoreProducts = storeProducts.filter((p) => !storeSearch || p.name.toLowerCase().includes(storeSearch.toLowerCase()));

  function pickFromStore(p: StoreProduct) {
    setName(p.name);
    setSuggestedSellingPrice(String(p.price));
    setMode('manual');
    toast.success(`« ${p.name} » sélectionné — complétez le prix d'achat`);
  }

  async function submit() {
    if (!name.trim() || !purchasePrice) { toast.error('Nom et prix d\'achat requis'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          name: name.trim(),
          category: category.trim() || undefined,
          brand: brand.trim() || undefined,
          size: size.trim() || undefined,
          color: color.trim() || undefined,
          purchasePrice: Number(purchasePrice),
          suggestedSellingPrice: suggestedSellingPrice ? Number(suggestedSellingPrice) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Produit ajouté au catalogue');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-ink-200 bg-ink-100/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-black text-ink-900">Nouveau produit fournisseur</h4>
        <button onClick={onCancel} className="text-ink-500 hover:text-ink-900"><X size={16} /></button>
      </div>

      <div className="mb-3 flex gap-1.5 rounded-xl bg-ink-200/60 p-1">
        <button
          onClick={() => setMode('catalog')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${mode === 'catalog' ? 'bg-white text-brand-600 shadow-sm' : 'text-ink-600'}`}
        >
          Depuis mon catalogue
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${mode === 'manual' ? 'bg-white text-brand-600 shadow-sm' : 'text-ink-600'}`}
        >
          Saisie manuelle
        </button>
      </div>

      {mode === 'catalog' ? (
        <div>
          <div className="relative mb-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input py-1.5 pl-8 text-xs" placeholder="Rechercher un produit de ma boutique…" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-ink-200 bg-white p-1.5">
            {loadingStore ? (
              <p className="p-3 text-center text-xs text-ink-500">Chargement du catalogue…</p>
            ) : !visibleStoreProducts.length ? (
              <p className="p-3 text-center text-xs text-ink-500">Aucun produit ne correspond.</p>
            ) : (
              visibleStoreProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickFromStore(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink-100 transition"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center"><Package size={13} className="text-ink-400" /></div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-900">{p.name}</span>
                  <span className="shrink-0 text-[11px] font-mono text-ink-500">{p.price.toFixed(3)} DT</span>
                </button>
              ))
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-500">Choisissez un produit pour préremplir le nom, puis complétez le prix d&apos;achat fournisseur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input className="input py-1.5 text-xs col-span-2" placeholder="Nom du produit" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input py-1.5 text-xs" placeholder="Catégorie" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className="input py-1.5 text-xs" placeholder="Marque" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <input className="input py-1.5 text-xs" placeholder="Taille" value={size} onChange={(e) => setSize(e.target.value)} />
          <input className="input py-1.5 text-xs" placeholder="Couleur" value={color} onChange={(e) => setColor(e.target.value)} />
          <input className="input py-1.5 text-xs" type="number" min={0} step={0.001} placeholder="Prix d'achat (DT)" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <input className="input py-1.5 text-xs" type="number" min={0} step={0.001} placeholder="Prix de vente suggéré (DT)" value={suggestedSellingPrice} onChange={(e) => setSuggestedSellingPrice(e.target.value)} />
          <textarea className="input py-1.5 text-xs col-span-2" rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button disabled={busy || !name.trim() || !purchasePrice} onClick={submit} className="btn-primary col-span-2 py-1.5 text-xs disabled:opacity-40">
            {busy ? 'Ajout…' : 'Ajouter au catalogue'}
          </button>
        </div>
      )}
    </div>
  );
}

function PriceHistoryModal({ product, onClose }: { product: SupplierProduct; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-black text-ink-900"><Clock size={15} /> Historique — {product.name}</h4>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900"><X size={16} /></button>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {[...product.priceHistory].reverse().map((h, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-ink-100 px-3 py-2 text-xs">
              <span className="font-bold text-ink-700">{new Date(h.at).toLocaleDateString('fr-TN')}</span>
              <span className="font-black text-brand-700">{formatMinor(h.priceMinor)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
