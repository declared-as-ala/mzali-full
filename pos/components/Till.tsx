'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, LogOut, Search, Star, Wallet, Wifi, WifiOff, X, UserCheck } from 'lucide-react';
import { getTerminalCode, posFetch } from '@/lib/device';
import { canOpenDrawer, completeSaleHardware, DEFAULT_PRINTER_SETTINGS, getBridgeStatus, openManualDrawer, printReceiptOnBridge, reportPrintStatus } from '@/lib/hardware';
import { usePosEvents } from '@/hooks/usePosEvents';
import CategoryRail from './CategoryRail';
import NavBar from './NavBar';
import { DUPLICATE_CART_KEY } from './RecentSalesPanel';
import ProductGrid from './ProductGrid';
import ProductOfferModal from './ProductOfferModal';
import QuickPickRail from './QuickPickRail';
import Cart from './Cart';
import TicketPreview from './TicketPreview';
import type { CartLine, LoyaltyAccount, LoyaltyCardLookupResult, LoyaltyLookupResult, PosCatalogItem, PosCatalogResponse, PosPrinterSettings, PosSale, PosSalePaymentInput, PosSaleQuote, RedeemPreviewResult } from '@/types/pos';

const ACTIVE_SALE_DRAFT_KEY = 'mzali_pos_active_sale_draft';

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
  const [editingSale, setEditingSale] = useState<{ id: string; saleNumber: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<PosSale | null>(null);
  const [hardwareWarning, setHardwareWarning] = useState<string | null>(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [manualDrawerBusy, setManualDrawerBusy] = useState(false);
  const [drawerFeedback, setDrawerFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [printerSettings, setPrinterSettings] = useState<PosPrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [saleFeedback, setSaleFeedback] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);
  const [printFailure, setPrintFailure] = useState<{ sale: PosSale; message: string } | null>(null);
  const [retryingPrint, setRetryingPrint] = useState(false);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const paymentRequestInFlightRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [draftReady, setDraftReady] = useState(false);

  // Authentication and the business cashier session are separate. Keep the
  // current sale durable across a genuine auth failure/login round-trip.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_SALE_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (Array.isArray(draft.cart)) setCart(draft.cart);
        if (typeof draft.customerPhone === 'string') setCustomerPhone(draft.customerPhone);
        if (typeof draft.customerId === 'string' || draft.customerId === null) setCustomerId(draft.customerId);
        if (typeof draft.customerName === 'string' || draft.customerName === null) setCustomerName(draft.customerName);
        if (draft.loyaltyAccount) setLoyaltyAccount(draft.loyaltyAccount);
        if (typeof draft.redeemInput === 'string') setRedeemInput(draft.redeemInput);
        if (draft.redeemPreview) setRedeemPreview(draft.redeemPreview);
        if (draft.editingSale) setEditingSale(draft.editingSale);
        if (typeof draft.idempotencyKey === 'string') idempotencyKeyRef.current = draft.idempotencyKey;
      }
    } catch { /* malformed or unavailable storage */ }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      localStorage.setItem(ACTIVE_SALE_DRAFT_KEY, JSON.stringify({
        cart, customerPhone, customerId, customerName, loyaltyAccount,
        redeemInput, redeemPreview, editingSale,
        idempotencyKey: idempotencyKeyRef.current,
      }));
    } catch { /* storage is best effort */ }
  }, [cart, customerPhone, customerId, customerName, loyaltyAccount, redeemInput, redeemPreview, editingSale, draftReady]);

  useEffect(() => {
    posFetch('/api/printer/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<PosPrinterSettings> | null) => { if (data) setPrinterSettings({ ...DEFAULT_PRINTER_SETTINGS, ...data }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!saleFeedback) return;
    const id = setTimeout(() => setSaleFeedback(null), 3000);
    return () => clearTimeout(id);
  }, [saleFeedback]);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { session: unknown }) => { if (!data.session) router.replace('/sessions/open'); })
      .catch(() => {});
  }, [router]);

  async function loadCatalog() {
    try {
      const res = await posFetch('/api/catalog', { cache: 'no-store' });
      if (res.status === 401) { router.replace('/login'); return; }
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
            bundleGroupId: item.productId,
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
          bundleGroupId: item.productId,
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

  function addToCart(item: PosCatalogItem, qty = 1) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) {
        if (existing.qty >= item.boutiqueAvailable) return prev;
        return prev.map((l) => (l.variantId === item.variantId ? { ...l, qty: Math.min(l.qty + qty, l.boutiqueAvailable) } : l));
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
          qty: Math.min(qty, Math.max(1, item.boutiqueAvailable)),
          boutiqueAvailable: item.boutiqueAvailable,
          // Every cart line for this product shares this id, so the server
          // groups them and automatically applies the best quantity offer
          // as qty changes — see resolveSaleLines() on the backend.
          bundleGroupId: item.productId,
        },
      ];
    });
  }

  // Supermarket-style scanning: every click just adds one unit (or bumps
  // the existing line's qty by one) straight into the cart — no popup, no
  // manual step. The best available quantity offer is always detected and
  // applied automatically as qty crosses a threshold (see fetchQuote()/
  // product-pricing.ts on the backend) — the cashier never has to ask for
  // it. The offer picker only ever opens when the cashier explicitly asks
  // to adjust an existing cart line (see openLineEditor below), never on
  // the first add.
  function handleProductSelect(item: PosCatalogItem) {
    addToCart(item);
  }

  const [offerModalItem, setOfferModalItem] = useState<PosCatalogItem | null>(null);
  function openLineEditor(variantId: string) {
    const item = catalog?.items.find((i) => i.variantId === variantId);
    if (item) setOfferModalItem(item);
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

  const naiveSubtotalMinor = cart.reduce((sum, l) => sum + l.unitPriceMinor * l.qty, 0);

  // Live, authoritative pricing preview — recalculated on every cart edit so
  // offers apply/drop the moment qty crosses a threshold. Never priced
  // client-side (see product-pricing.ts): this is the exact same logic the
  // server uses to record the sale.
  const [quote, setQuote] = useState<PosSaleQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteRequestIdRef = useRef(0);

  async function fetchQuote(lines: CartLine[]): Promise<PosSaleQuote | null> {
    if (!lines.length) return { lines: [], subtotalMinor: 0 };
    try {
      const res = await posFetch('/api/sales/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, bundleGroupId: l.bundleGroupId })) }),
      });
      if (!res.ok) return null;
      return (await res.json()) as PosSaleQuote;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!cart.length) { setQuote(null); setQuoting(false); return; }
    const requestId = ++quoteRequestIdRef.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      fetchQuote(cart).then((result) => {
        if (quoteRequestIdRef.current !== requestId) return; // superseded by a newer cart edit
        setQuote(result);
        setQuoting(false);
      });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  // Fall back to the naive qty*unitPrice sum only while the authoritative
  // quote hasn't landed yet (first render, mid-debounce) — never trusted
  // for the actual payment amount, only for the number shown on screen.
  const subtotalMinor = quote?.subtotalMinor ?? naiveSubtotalMinor;
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
      // Re-quote right before submitting — the background quote may be
      // stale (mid-debounce, a rapid last-second qty edit). Payments must
      // sum to EXACTLY the server's total, so the amount charged always
      // comes from a fresh authoritative price, never the on-screen value.
      const freshQuote = await fetchQuote(cart);
      if (!freshQuote) throw new Error('Impossible de calculer le prix — vérifiez la connexion.');
      const finalTotalMinor = Math.max(0, freshQuote.subtotalMinor - loyaltyDiscountMinor);
      const lines = cart.map((l) => ({ variantId: l.variantId, qty: l.qty, bundleGroupId: l.bundleGroupId }));

      const wasEditing = Boolean(editingSale);
      let res: Response;
      if (editingSale) {
        res = await posFetch(`/api/sales/${editingSale.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lines,
            payments: [{ method, amountMinor: finalTotalMinor }],
            reason: 'Modification de vente en Caisse',
          }),
        });
      } else {
        res = await posFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKeyRef.current },
          body: JSON.stringify({
            lines,
            payments: [{ method, amountMinor: finalTotalMinor }],
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
        const hardware = await completeSaleHardware(sale, printerSettings.autoOpenDrawer);
        setHardwareWarning(hardware.warning);

        // Silent, no on-screen ticket/print dialog — the whole point of the
        // bridge. A printer failure never touches the sale itself (it's
        // already saved): 'failed' just means "please retry printing",
        // surfaced as its own dismissible banner with a retry action, not
        // the old full-screen ticket preview.
        if (printerSettings.autoPrint) {
          try {
            await printReceiptOnBridge(sale, printerSettings);
            await reportPrintStatus(sale.id, 'printed');
            setSaleFeedback({ tone: 'success', message: `Vente #${sale.saleNumber} enregistrée — ticket imprimé.` });
          } catch (printError) {
            await reportPrintStatus(sale.id, 'failed');
            setPrintFailure({ sale, message: printError instanceof Error ? printError.message : "Échec de l'impression." });
          }
        } else {
          setSaleFeedback({ tone: 'warning', message: `Vente #${sale.saleNumber} enregistrée — impression automatique désactivée.` });
        }
      }
      setEditingSale(null);
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

  async function retryPrint() {
    if (!printFailure || retryingPrint) return;
    setRetryingPrint(true);
    try {
      await printReceiptOnBridge(printFailure.sale, printerSettings);
      await reportPrintStatus(printFailure.sale.id, 'printed');
      setSaleFeedback({ tone: 'success', message: `Ticket #${printFailure.sale.saleNumber} imprimé.` });
      setPrintFailure(null);
    } catch (error) {
      setPrintFailure({ sale: printFailure.sale, message: error instanceof Error ? error.message : "Échec de l'impression." });
    } finally {
      setRetryingPrint(false);
    }
  }

  /** Explicit fallback only — never triggered automatically. Reuses the
   *  existing on-screen ticket + window.print(), the same manual path
   *  already used before the bridge existed. */
  function printFailureManually() {
    if (!printFailure) return;
    setCompletedSale(printFailure.sale);
    setAutoPrintReceipt(true);
    setPrintFailure(null);
  }

  // Keyboard shortcuts: "/" jumps to search from anywhere (unless already
  // typing somewhere), Escape clears an active search query.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (query) setQuery('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query]);

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

      {/* Checkout failed — no payment modal to surface this in anymore
          (cash is one-click), so it needs its own banner. */}
      {saveError && (
        <div role="alert" className="flex flex-none items-center justify-between border-b border-rose-200 bg-rose-50 px-6 py-2 text-xs font-bold text-rose-800">
          <span>{saveError}</span>
          <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5" onClick={() => setSaveError(null)} aria-label="Fermer le message"><X size={14} /></button>
        </div>
      )}

      {/* Brief, self-dismissing confirmation after a silently-printed sale —
          no ticket modal, the cashier is meant to already be moving on to
          the next customer. */}
      {saleFeedback && (
        <div
          role="status"
          className={`flex flex-none items-center justify-between px-6 py-2 text-xs font-bold ${saleFeedback.tone === 'success' ? 'border-b border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-b border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          <span>{saleFeedback.message}</span>
          <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5" onClick={() => setSaleFeedback(null)} aria-label="Fermer le message"><X size={14} /></button>
        </div>
      )}

      {/* The sale is already saved and stays saved either way — a printer
          failure only ever means "please retry printing", never "redo the
          sale". Three ways out: retry the same bridge print, print the old
          way as an explicit fallback, or go handle it later from history. */}
      {printFailure && (
        <div role="alert" className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-6 py-2.5 text-xs font-bold text-rose-800">
          <span>Vente #{printFailure.sale.saleNumber} enregistrée, impression échouée. {printFailure.message}</span>
          <div className="flex flex-none items-center gap-1.5">
            <button
              type="button"
              disabled={retryingPrint}
              onClick={() => void retryPrint()}
              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
            >
              {retryingPrint ? 'Nouvel essai…' : 'Réessayer l’impression'}
            </button>
            <button
              type="button"
              onClick={printFailureManually}
              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 font-black text-rose-800 transition hover:bg-rose-100"
            >
              Imprimer via le navigateur
            </button>
            <button
              type="button"
              onClick={() => router.push('/history')}
              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 font-black text-rose-800 transition hover:bg-rose-100"
            >
              Imprimer depuis l’historique
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5" onClick={() => setPrintFailure(null)} aria-label="Fermer le message"><X size={14} /></button>
          </div>
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
              <QuickPickRail title="Favoris Vente" icon={<Star size={13} className="text-amber-500" />} items={favoriteItems} onSelect={handleProductSelect} />
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
            <ProductGrid items={filteredItems} onSelect={handleProductSelect} onUnavailableAttempt={logUnavailableAttempt} />
          )}
        </main>

        <Cart
          lines={cart}
          quote={quote}
          quoting={quoting}
          onQtyChange={changeQty}
          onRemove={removeLine}
          onEditLine={openLineEditor}
          onPay={() => confirmPayment('CASH', totalMinor)}
          paying={paying}
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

      {offerModalItem && (
        <ProductOfferModal
          item={offerModalItem}
          initialQty={cart.find((l) => l.variantId === offerModalItem.variantId)?.qty}
          onClose={() => setOfferModalItem(null)}
          onAdd={(qty) => { changeQty(offerModalItem.variantId, qty); setOfferModalItem(null); }}
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
          onClose={() => setCompletedSale(null)}
          onNewSale={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
}
