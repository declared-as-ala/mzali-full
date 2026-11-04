'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Package,
  Plus,
  Edit,
  ExternalLink,
  RefreshCw,
  Store,
  Globe,
  X,
  Check,
  Tag,
  Boxes,
} from 'lucide-react';
import NavBar from './NavBar';
import { posFetch } from '@/lib/device';
import { formatMinor, toMinor } from '@/lib/money';

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  sku?: string | null;
  price: number;
  regularPrice: number;
  salePrice: number | null;
  stockQuantity: number | null;
  status: 'published' | 'draft' | 'private';
  posOnly: boolean;
  images?: { url: string }[];
};

export default function PosProductsView({
  cashierName,
}: {
  cashierName: string;
  role?: string;
}) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'posOnly' | 'webOnly'>('posOnly');

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editName, setEditName] = useState('');
  const [editPosOnly, setEditPosOnly] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('10');
  const [newSku, setNewSku] = useState('');
  const [newPosOnly, setNewPosOnly] = useState(true);
  const [createSaving, setCreateSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await posFetch('/api/products?perPage=200', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des produits');
      }
      setProducts(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (filterType === 'posOnly') {
      list = list.filter((p) => p.posOnly === true);
    } else if (filterType === 'webOnly') {
      list = list.filter((p) => !p.posOnly);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [products, filterType, search]);

  const openEdit = (product: ProductRow) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditPrice(String(product.price));
    setEditStock(product.stockQuantity != null ? String(product.stockQuantity) : '');
    setEditPosOnly(Boolean(product.posOnly));
  };

  const handleTogglePosOnly = async (product: ProductRow) => {
    const updatedPosOnly = !product.posOnly;
    try {
      // Optimistic update
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, posOnly: updatedPosOnly } : p)),
      );
      const res = await posFetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posOnly: updatedPosOnly }),
      });
      if (!res.ok) {
        // Revert on failure
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, posOnly: !updatedPosOnly } : p)),
        );
      }
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, posOnly: !updatedPosOnly } : p)),
      );
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    setSaving(true);
    try {
      const priceNum = parseFloat(editPrice);
      const stockNum = editStock.trim() === '' ? null : parseInt(editStock, 10);

      const updateData: Record<string, unknown> = {
        name: editName.trim() || editingProduct.name,
        posOnly: editPosOnly,
      };

      if (!isNaN(priceNum) && priceNum >= 0) {
        updateData.regularPrice = priceNum;
      }
      if (stockNum !== null && !isNaN(stockNum)) {
        updateData.stockQuantity = stockNum;
        updateData.manageStock = true;
      }

      const res = await posFetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erreur lors de la modification');
      }

      const updated = await res.json();
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: updated.name ?? editName,
                price: updated.price ?? priceNum,
                regularPrice: updated.regularPrice ?? priceNum,
                stockQuantity: updated.stockQuantity ?? stockNum,
                posOnly: editPosOnly,
              }
            : p,
        ),
      );
      setEditingProduct(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!newName.trim() || !newPrice.trim()) {
      alert('Veuillez renseigner le nom et le prix du produit.');
      return;
    }
    setCreateSaving(true);
    try {
      const priceNum = parseFloat(newPrice);
      const stockNum = newStock.trim() === '' ? null : parseInt(newStock, 10);

      const res = await posFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          regularPrice: priceNum,
          stockQuantity: stockNum,
          manageStock: stockNum !== null,
          sku: newSku.trim() || undefined,
          status: 'published',
          posOnly: newPosOnly,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erreur lors de la création');
      }

      await fetchProducts();
      setIsCreating(false);
      setNewName('');
      setNewPrice('');
      setNewStock('10');
      setNewSku('');
      setNewPosOnly(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreateSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#F4F6F9] text-slate-900 select-none overflow-hidden">
      {/* Top Header */}
      <header className="flex flex-none items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6 py-2 shadow-xs">
        <div className="flex items-center gap-3">
          <NavBar />
          <span className="hidden text-slate-300 sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-2">
            <Package size={16} className="text-blue-600" />
            <h1 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Gestion des Produits
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://admin.ahmedmzaliboutique.tn/admin/produits"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            title="Ouvrir le panneau d'administration complet"
          >
            <ExternalLink size={13} />
            <span className="hidden md:inline">Admin complet</span>
          </a>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-blue-700 transition shadow-xs"
          >
            <Plus size={14} />
            <span>Nouveau produit POS</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex min-h-0 flex-1 flex-col p-3 sm:p-5 gap-3 overflow-hidden">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="flex flex-1 items-center gap-2 min-w-[220px]">
            <Search size={16} className="text-slate-400 ml-1" />
            <input
              type="text"
              placeholder="Rechercher par nom, SKU ou code-barres..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Effacer recherche"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <button
              onClick={() => setFilterType('posOnly')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black transition ${
                filterType === 'posOnly'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Store size={12} />
              <span>POS Uniquement ({products.filter((p) => p.posOnly).length})</span>
            </button>
            <button
              onClick={() => setFilterType('webOnly')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black transition ${
                filterType === 'webOnly'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Globe size={12} />
              <span>Site Web ({products.filter((p) => !p.posOnly).length})</span>
            </button>
            <button
              onClick={() => setFilterType('all')}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black transition ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Boxes size={12} />
              <span>Tous ({products.length})</span>
            </button>
            <button
              onClick={fetchProducts}
              disabled={loading}
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition"
              title="Rafraîchir"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Products Table */}
        <div className="flex-1 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Produit</th>
                  <th className="py-2.5 px-3">Prix</th>
                  <th className="py-2.5 px-3">Stock Dispo</th>
                  <th className="py-2.5 px-3">Canal de Vente</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {filteredProducts.map((p) => {
                  const img = p.images?.[0]?.url;
                  return (
                    <tr key={p.id} className="hover:bg-blue-50/40 transition">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 flex-none rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <Package size={16} className="text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 truncate max-w-[240px] sm:max-w-xs">
                              {p.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              SKU: {p.sku || p.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-black text-blue-700 tabular-nums">
                          {formatMinor(toMinor(p.price))}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-black ${
                            (p.stockQuantity ?? 0) > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {p.stockQuantity != null ? `${p.stockQuantity} en stock` : 'Non suivi'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => handleTogglePosOnly(p)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black cursor-pointer transition ${
                            p.posOnly
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                          }`}
                          title="Cliquer pour basculer entre POS uniquement et Site Web"
                        >
                          {p.posOnly ? <Store size={12} /> : <Globe size={12} />}
                          <span>{p.posOnly ? 'POS Uniquement' : 'Site Web'}</span>
                        </button>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                        >
                          <Edit size={12} />
                          <span>Modifier</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Package size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="font-bold">Aucun produit trouvé</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {search ? 'Essayez un autre mot-clé' : 'Créez un nouveau produit pour démarrer'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                <Edit size={16} className="text-blue-600" /> Modifier le produit
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1 text-slate-600">Nom du produit</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-600">Prix (DT)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-600">Quantité en stock</label>
                  <input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    placeholder="Illimité"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <p className="font-black text-slate-900">Vendre uniquement au POS (Caisse)</p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      N&apos;apparaît pas sur le site web
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editPosOnly}
                    onChange={(e) => setEditPosOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                <Plus size={16} className="text-blue-600" /> Nouveau produit POS
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1 text-slate-600">Nom de l&apos;article *</label>
                <input
                  type="text"
                  placeholder="ex: Jean Slim Noir, T-Shirt Caisse..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-600">Prix unitaire (DT) *</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="35.000"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-600">Stock initial</label>
                  <input
                    type="number"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    placeholder="10"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-slate-600">SKU / Code interne (optionnel)</label>
                <input
                  type="text"
                  placeholder="POS-001"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <p className="font-black text-amber-950">Vente POS uniquement</p>
                    <p className="text-[11px] font-semibold text-amber-800">
                      Coché = vendu en magasin, masqué sur le site
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={newPosOnly}
                    onChange={(e) => setNewPosOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateProduct}
                disabled={createSaving || !newName.trim() || !newPrice.trim()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createSaving ? 'Création…' : 'Créer l’article'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

