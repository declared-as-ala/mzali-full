'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, Clock, LogOut, Search, Star, Wallet, Wifi, WifiOff, X, UserCheck } from 'lucide-react';
import { getTerminalCode, posFetch } from '@/lib/device';
import { canOpenDrawer, completeSaleHardware, openManualDrawer, scheduleCustomerDisplayPayment } from '@/lib/hardware';
import { usePosEvents } from '@/hooks/usePosEvents';
import CategoryRail from './CategoryRail';
import NavBar from './NavBar';
import { DUPLICATE_CART_KEY } from './RecentSalesPanel';
import ProductGrid from './ProductGrid';
import QuickPickRail from './QuickPickRail';
import Cart from './Cart';
import PaymentModal from './PaymentModal';
import TicketPreview from './TicketPreview';
import type { CartLine, LoyaltyAccount, LoyaltyCardLookupResult, LoyaltyLookupResult, PosCatalogItem, PosCatalogResponse, PosSale, PosSalePaymentInput, RedeemPreviewResult } from '@/types/pos';

export default function Till({ cashierName, role }: { cashierName: string; role: string }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PosCatalogResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [lookupNotFound, setLookupNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemPreview, setRedeemPreview] = useState<RedeemPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [managerEmployeeId, setManagerEmployeeId] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardLooking, setCardLooking] = useState(false);
  const [cardUnassigned, setCardUnassigned] = useState(false);
  const [cardAssigning, setCardAssigning] = useState(false);
  const [recentlySoldIds, setRecentlySoldIds] = useState<string[]>([]);
  const [editingSale, setEditingSale] = useState<{ id: string; saleNumber: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<PosSale | null>(null);
  const [hardwareWarning, setHardwareWarning] = useState<string | null>(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [manualDrawerBusy, setManualDrawerBusy] = useState(false);
  const [drawerFeedback, setDrawerFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const paymentRequestInFlightRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { session: unknown }) => { if (!data.session) router.replace('/sessions/open'); })
      .catch(() => {});
  }, [router]);

  async function loadCatalog() {
    try {
      const res = await posFetch('/api/catalog', { cache: 'no-store' });
      if (res.status === 400) { router.replace('/pairing'); return; }
      if (!res.ok) throw new Error();
      const data: PosCatalogResponse = await res.json();
      setCatalog(data);
      setLoadError(null);
    } catch {
      setLoadError('Impossible de charger le catalogue.');
    }
  }
  useEffect(() => { loadCatalog(); }, []);

  // Loads a sale edit request from History / Dashboard and populates cart
  useEffect(() => {
    if (!catalog) return;
    const rawEdit = localStorage.getItem('pos_edit_sale');
    if (rawEdit) {
      localStorage.removeItem('pos_edit_sale');
      try {
        const data = JSON.parse(rawEdit);
        const byVariant = new Map(catalog.items.map((i) => [i.variantId, i]));
        const nextCart: CartLine[] = [];
        for (const line of data.lines) {
          const item = byVariant.get(line.variantId);
          if (!item) continue;
          nextCart.push({
            variantId: item.variantId,
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            imageUrl: item.imageUrl,
            unitPriceMinor: item.priceMinor,
            qty: line.qty,
            boutiqueAvailable: item.boutiqueAvailable,
          });
        }
        if (nextCart.length) {
          setCart(nextCart);
          setEditingSale({ id: data.id, saleNumber: data.saleNumber });
        }
      } catch { /* ignore */ }
      return;
    }

    const raw = localStorage.getItem(DUPLICATE_CART_KEY);
    if (!raw) return;
    localStorage.removeItem(DUPLICATE_CART_KEY);
    try {
      const lines: { variantId: string; qty: number }[] = JSON.parse(raw);
      const byVariant = new Map(catalog.items.map((i) => [i.variantId, i]));
      const nextCart: CartLine[] = [];
      for (const line of lines) {
        const item = byVariant.get(line.variantId);
        if (!item) continue;
        nextCart.push({
          variantId: item.variantId,
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          imageUrl: item.imageUrl,
          unitPriceMinor: item.priceMinor,
          qty: Math.min(line.qty, Math.max(1, item.boutiqueAvailable)),
          boutiqueAvailable: item.boutiqueAvailable,
        });
      }
      if (nextCart.length) setCart(nextCart);
    } catch { /* malformed payload — ignore */ }
  }, [catalog]);

  usePosEvents((event) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      const field = event.locationId === 'BOUTIQUE' ? 'boutiqueAvailable' : event.locationId === 'DEPOT' ? 'depotAvailable' : null;
      if (!field) return prev;
      let changed = false;
      const items = prev.items.map((item) => {
        if (item.variantId !== event.variantId || item[field] === event.quantityAvailable) return item;
        changed = true;
        return { ...item, [field]: event.quantityAvailable };
      });
      return changed ? { ...prev, items } : prev;
    });
  });

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        setOnline(res.ok);
      } catch {
        setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  const filteredItems = useMemo(() => {
    if (!catalog) return [];
    let items = catalog.items;
    if (activeCategory) items = items.filter((i) => i.categoryIds.includes(activeCategory));
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
    return items;
  }, [catalog, activeCategory, query]);

  const favoriteItems = useMemo(() => catalog?.items.filter((i) => i.favorite) ?? [], [catalog]);
  const recentlySoldItems = useMemo(() => {
    if (!catalog) return [];
    const byId = new Map(catalog.items.map((i) => [i.productId, i]));
    return recentlySoldIds.map((id) => byId.get(id)).filter((i): i is PosCatalogItem => Boolean(i));
  }, [catalog, recentlySoldIds]);

  function addToCart(item: PosCatalogItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) {
        if (existing.qty >= item.boutiqueAvailable) return prev;
        return prev.map((l) => (l.variantId === item.variantId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          variantId: item.variantId,
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          imageUrl: item.imageUrl,
          unitPriceMinor: item.priceMinor,
          qty: 1,
          boutiqueAvailable: item.boutiqueAvailable,
        },
      ];
    });
  }

  // Fire-and-forget — a missed log entry is not worth blocking or
  // interrupting the cashier's flow over. See pos-lost-sales.service.ts.
  function logUnavailableAttempt(item: PosCatalogItem) {
    posFetch('/api/lost-sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId: item.variantId }),
    }).catch(() => {});
  }

  function changeQty(variantId: string, qty: number) {
    if (qty <= 0) { setCart((prev) => prev.filter((l) => l.variantId !== variantId)); return; }
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(qty, l.boutiqueAvailable) } : l)));
  }
  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  const subtotalMinor = cart.reduce((sum, l) => sum + l.unitPriceMinor * l.qty, 0);
  const loyaltyDiscountMinor = redeemPreview?.valid ? redeemPreview.discountMinor : 0;
  const totalMinor = Math.max(0, subtotalMinor - loyaltyDiscountMinor);
  const redeemPointsValue = redeemPreview?.valid ? Number(redeemInput) : 0;

  function resetCustomer() {
    setCustomerPhone('');
    setCustomerId(null);
    setCustomerName(null);
    setLoyaltyAccount(null);
    setLookupNotFound(false);
    setRedeemInput('');
    setRedeemPreview(null);
    setManagerEmployeeId('');
    setManagerPassword('');
    setCardNumber('');
    setCardUnassigned(false);
  }

  async function lookupCard() {
    if (!cardNumber.trim()) return;
    setCardLooking(true);
    setCardUnassigned(false);
    setRedeemPreview(null);
    try {
      const res = await posFetch(`/api/loyalty/cards/lookup?cardNumber=${encodeURIComponent(cardNumber.trim())}`, { cache: 'no-store' });
      const data: LoyaltyCardLookupResult | { error: string } = await res.json();
      if (!res.ok || 'error' in data || !data.found) {
        setCustomerId(null);
        setCustomerName(null);
        setLoyaltyAccount(null);
        setLookupNotFound(true);
        return;
      }
      if (data.account) {
        setCustomerId(data.account.customerId);
        setCustomerName(data.card?.customerName ?? data.account.customerName);
        setLoyaltyAccount(data.account);
        setLookupNotFound(false);
      } else {
        setCardUnassigned(true);
      }
    } catch {
      setLookupNotFound(true);
    } finally {
      setCardLooking(false);
    }
  }

  async function assignCard(targetCardNumber: string, targetPhone: string, firstName?: string, lastName?: string): Promise<boolean> {
    const cNum = targetCardNumber.trim() || cardNumber.trim();
    const cPhone = targetPhone.trim();
    if (!cNum || !cPhone) return false;
    setCardAssigning(true);
    try {
      const assignRes = await posFetch('/api/loyalty/cards/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber: cNum, phone: cPhone, firstName: firstName?.trim() || undefined, lastName: lastName?.trim() || undefined }),
      });
      if (!assignRes.ok) return false;
      setCardUnassigned(false);
      setCustomerPhone(cPhone);
      const lookupRes = await posFetch(`/api/loyalty/lookup/${encodeURIComponent(cPhone)}`, { cache: 'no-store' });
      const data: LoyaltyLookupResult | { error: string } = await lookupRes.json();
      if (lookupRes.ok && !('error' in data)) {
        setCustomerId(data.customerId);
        setCustomerName(data.customerName);
        setLoyaltyAccount(data.account);
        setLookupNotFound(!data.customerId);
      }
      setCardNumber('');
      return true;
    } catch {
      return false;
    } finally {
      setCardAssigning(false);
    }
  }

  async function lookupCustomer() {
    if (!customerPhone.trim()) return;
    setLooking(true);
    setRedeemPreview(null);
    try {
      const res = await posFetch(`/api/loyalty/lookup/${encodeURIComponent(customerPhone.trim())}`, { cache: 'no-store' });
      const data: LoyaltyLookupResult | { error: string } = await res.json();
      if (!res.ok || 'error' in data) {
        setCustomerId(null);
        setCustomerName(null);
        setLoyaltyAccount(null);
        setLookupNotFound(true);
        return;
      }
      setCustomerId(data.customerId);
      setCustomerName(data.customerName);
      setLoyaltyAccount(data.account);
      setLookupNotFound(!data.customerId);
    } catch {
      setLookupNotFound(true);
    } finally {
      setLooking(false);
    }
  }

  async function createLoyaltyAccount(firstName: string) {
    setCreatingAccount(true);
    try {
      const res = await posFetch('/api/loyalty/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: customerPhone.trim(), firstName: firstName.trim() || undefined }),
      });
      const data: LoyaltyAccount = await res.json();
      if (!res.ok) return;
      setCustomerId(data.customerId);
      setLoyaltyAccount(data);
      setLookupNotFound(false);
    } finally {
      setCreatingAccount(false);
    }
  }

  async function previewRedeem() {
    if (!loyaltyAccount || !redeemInput) return;
    setPreviewing(true);
    try {
      const res = await posFetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: loyaltyAccount.id,
          points: Number(redeemInput),
          saleSubtotalMinor: subtotalMinor,
          managerApproval: managerEmployeeId && managerPassword ? { employeeId: managerEmployeeId, password: managerPassword } : undefined,
        }),
      });
      const data: RedeemPreviewResult = await res.json();
      setRedeemPreview(data);
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmPayment(method: PosSalePaymentInput['method'], cashReceivedMinor: number | null) {
    if (paymentRequestInFlightRef.current) return;
    paymentRequestInFlightRef.current = true;
    setPaying(true);
    setSaveError(null);
    setHardwareWarning(null);
    setAutoPrintReceipt(false);
    try {
      const wasEditing = Boolean(editingSale);
      let res: Response;
      if (editingSale) {
        res = await posFetch(`/api/sales/${editingSale.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lines: cart.map((l) => ({ variantId: l.variantId, qty: l.qty })),
            payments: [{ method, amountMinor: totalMinor }],
            reason: 'Modification de vente en Caisse',
          }),
        });
      } else {
        res = await posFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKeyRef.current },
          body: JSON.stringify({
            lines: cart.map((l) => ({ variantId: l.variantId, qty: l.qty })),
            payments: [{ method, amountMinor: totalMinor }],
            cashTenderedMinor: method === 'CASH' ? cashReceivedMinor : null,
            customerId: customerId ?? undefined,
            redeemPoints: redeemPointsValue > 0 ? redeemPointsValue : undefined,
            managerApproval: redeemPreview?.requiresManagerApproval && managerEmployeeId && managerPassword
              ? { employeeId: managerEmployeeId, password: managerPassword }
              : undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur de paiement');
      const sale: PosSale = data.after || data;
      if (!wasEditing) {
        const hardware = await completeSaleHardware(sale);
        setHardwareWarning(hardware.warning);
        setAutoPrintReceipt(hardware.autoPrintReceipt);
      }
      setCompletedSale(sale);
      setEditingSale(null);
      setRecentlySoldIds((prev) => {
        const ids = [...new Set([...cart.map((l) => l.productId), ...prev])];
        return ids.slice(0, 10);
      });
      setCart([]);
      resetCustomer();
      idempotencyKeyRef.current = crypto.randomUUID();
      loadCatalog();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setPaying(false);
      paymentRequestInFlightRef.current = false;
    }
  }

  async function handleManualDrawer() {
    if (manualDrawerBusy) return;
    setManualDrawerBusy(true);
    setDrawerFeedback(null);
    try {
      await openManualDrawer('manual');
      setHardwareWarning(null);
      setDrawerFeedback({ tone: 'success', message: 'Tiroir ouvert par USB.' });
    } catch (error) {
      setDrawerFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Impossible d’ouvrir le tiroir-caisse.' });
    } finally {
      setManualDrawerBusy(false);
    }
  }

  const [paymentOpen, setPaymentOpen] = useState(false);

  // Keyboard shortcuts: "/" jumps to search from anywhere (unless already
  // typing somewhere), Escape backs out of whatever's open — payment modal
  // first, then an active search query.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (paymentOpen) { setPaymentOpen(false); return; }
        if (query) setQuery('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paymentOpen, query]);

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.replace('/login');
  }

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F4F6F9] p-6 text-center text-slate-900">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <p className="mb-4 font-bold text-rose-600">{loadError}</p>
          <button onClick={loadCatalog} className="btn-primary">Réessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#F4F6F9] text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Top Light Header */}
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-2.5 shadow-sm pr-36 sm:pr-44">
        <div className="flex items-center gap-3.5 shrink-0">
          <NavBar />
          <div className="flex items-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-xs font-black text-blue-700">
            <UserCheck size={14} />
            <span>Caissier: {cashierName}</span>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
            online ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? 'Terminal En ligne' : 'Hors ligne'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {canOpenDrawer(role) && (
            <button
              type="button"
              disabled={manualDrawerBusy}
              onClick={handleManualDrawer}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-black text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-wait disabled:opacity-60"
            >
              <Banknote size={16} /> {manualDrawerBusy ? 'Ouverture…' : 'Ouvrir le tiroir'}
            </button>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition shadow-2xs"
          >
            <ArrowLeft size={14} />
            <span>Tableau de bord</span>
          </button>
          <button
            onClick={() => router.push('/sessions/close')}
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition shadow-sm"
          >
            <Wallet size={14} className="text-amber-600" /> Fermer la caisse
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </header>

      {drawerFeedback && (
        <div
          role="status"
          className={`flex flex-none items-center justify-between px-6 py-2 text-xs font-bold ${drawerFeedback.tone === 'success' ? 'border-b border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-b border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          <span>{drawerFeedback.message}</span>
          <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5" onClick={() => setDrawerFeedback(null)} aria-label="Fermer le message"><X size={14} /></button>
        </div>
      )}

      {/* Editing Sale Mode Banner */}
      {editingSale && (
        <div className="flex flex-none items-center justify-between border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs font-black text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-200 border border-amber-300 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
              ✏️ ÉDITION DE VENTE
            </span>
            <span>Modification de la vente #{editingSale.saleNumber} — Ajoutez ou retirez des produits, puis cliquez sur Encaisser pour valider.</span>
          </div>
          <button
            onClick={() => { setEditingSale(null); setCart([]); }}
            className="rounded-lg bg-amber-200/80 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-300 transition"
          >
            Annuler l&apos;édition
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* Search bar */}
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-16 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm"
              placeholder="Rechercher un produit par nom, SKU ou code-barres..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Effacer">
                <X size={18} />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">/</kbd>
            )}
          </div>

          {!query && !activeCategory && (
            <div className="space-y-3">
              <QuickPickRail title="Favoris Vente" icon={<Star size={13} className="text-amber-500" />} items={favoriteItems} onSelect={addToCart} />
              <QuickPickRail title="Récemment Vendus" icon={<Clock size={13} className="text-blue-600" />} items={recentlySoldItems} onSelect={addToCart} />
            </div>
          )}

          {catalog && (
            <CategoryRail categories={catalog.categories} active={activeCategory} onChange={setActiveCategory} />
          )}

          {!catalog ? (
            <div className="grid flex-1 place-items-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            </div>
          ) : (
            <ProductGrid items={filteredItems} onSelect={addToCart} onUnavailableAttempt={logUnavailableAttempt} />
          )}
        </main>

        <Cart
          lines={cart}
          onQtyChange={changeQty}
          onRemove={removeLine}
          onPay={() => setPaymentOpen(true)}
          catalog={catalog}
          onAddSuggestion={addToCart}
          customerPanelProps={{
            phone: customerPhone,
            onPhoneChange: setCustomerPhone,
            onLookup: lookupCustomer,
            looking,
            customerId,
            customerName,
            account: loyaltyAccount,
            notFound: lookupNotFound,
            onCreateAccount: createLoyaltyAccount,
            creating: creatingAccount,
            redeemInput,
            onRedeemInputChange: setRedeemInput,
            onPreviewRedeem: previewRedeem,
            previewing,
            preview: redeemPreview,
            managerEmployeeId,
            managerPassword,
            onManagerChange: (employeeId, password) => { setManagerEmployeeId(employeeId); setManagerPassword(password); },
            cardNumber,
            onCardNumberChange: setCardNumber,
            onCardLookup: lookupCard,
            cardLooking,
            cardUnassigned,
            onAssignCard: assignCard,
            cardAssigning,
          }}
        />
      </div>

      {paymentOpen && !completedSale && (
        <PaymentModal
          totalMinor={totalMinor}
          busy={paying}
          error={saveError}
          onClose={() => setPaymentOpen(false)}
          onConfirm={confirmPayment}
          onDisplayChange={scheduleCustomerDisplayPayment}
        />
      )}

      {completedSale && (
        <TicketPreview
          sale={completedSale}
          autoPrint={autoPrintReceipt}
          hardwareWarning={hardwareWarning}
          canOpenDrawer={canOpenDrawer(role)}
          onOpenDrawer={handleManualDrawer}
          drawerBusy={manualDrawerBusy}
          onClose={() => { setCompletedSale(null); setPaymentOpen(false); }}
          onNewSale={() => { setCompletedSale(null); setPaymentOpen(false); }}
        />
      )}
    </div>
  );
}
