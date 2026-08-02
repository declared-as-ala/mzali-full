'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, History, ShoppingCart, Sparkles, Store, UserCheck, Zap } from 'lucide-react';
import NavBar from './NavBar';

export default function Dashboard({ cashierName }: { cashierName: string; canEdit?: boolean }) {
  const router = useRouter();

  return (
    <div className="flex h-screen flex-col bg-[#F4F6F9] text-slate-900 select-none">
      {/* Top Navigation Header */}
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
        <div className="flex items-center gap-3.5">
          <NavBar />
          <span className="hidden text-slate-300 sm:inline">|</span>
          <h1 className="hidden text-xs font-black uppercase tracking-wider text-slate-700 sm:flex items-center gap-1.5">
            <Store size={14} className="text-blue-600" /> Point de Vente (POS)
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-700 font-extrabold">
            <UserCheck size={13} /> Caissier: {cashierName}
          </span>
        </div>
      </header>

      {/* Main Launcher Section with 3 Action Buttons */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-4 py-1.5 text-xs font-black text-blue-700 uppercase tracking-widest mb-2 shadow-2xs">
              <Zap size={14} className="text-amber-500" /> Menu Principal Point de Vente
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl mb-1">
              Tableau de Bord
            </h2>
            <p className="text-xs font-bold text-slate-500">Choisissez une section ci-dessous pour démarrer votre activité</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Button 1: Caisse (Ventes) */}
            <div
              onClick={() => router.push('/till')}
              className="group relative overflow-hidden rounded-3xl bg-slate-900 border border-blue-500/30 p-8 text-white shadow-2xl shadow-slate-900/20 hover:border-blue-500/80 hover:shadow-blue-500/20 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer"
            >
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-blue-600/20 blur-2xl pointer-events-none group-hover:bg-blue-600/35 transition-all" />
              
              <div className="flex items-center justify-between mb-6">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/20 border border-blue-500/30 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-blue-300">
                  <ShoppingCart size={15} /> 1. CAISSE
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md group-hover:bg-blue-500 group-hover:scale-110 transition-all">
                  <ArrowRight size={18} />
                </span>
              </div>

              <h3 className="text-2xl font-black text-white mb-2.5 tracking-tight">Accéder à la Caisse</h3>
              <p className="text-xs font-semibold text-slate-300 mb-8 leading-relaxed">
                Enregistrer des nouvelles ventes, scanner les articles et encaisser les paiements client.
              </p>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-black">
                <span className="text-slate-400">Terminal de Vente</span>
                <span className="text-blue-400 font-black group-hover:text-blue-300">Ouvrir la caisse →</span>
              </div>
            </div>

            {/* Button 2: Commandes (Historique) */}
            <div
              onClick={() => router.push('/history')}
              className="group relative overflow-hidden rounded-3xl bg-slate-900 border border-indigo-500/30 p-8 text-white shadow-2xl shadow-slate-900/20 hover:border-indigo-500/80 hover:shadow-indigo-500/20 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer"
            >
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-indigo-600/20 blur-2xl pointer-events-none group-hover:bg-indigo-600/35 transition-all" />

              <div className="flex items-center justify-between mb-6">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-indigo-300">
                  <History size={15} /> 2. COMMANDES
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-md group-hover:bg-indigo-500 group-hover:scale-110 transition-all">
                  <ArrowRight size={18} />
                </span>
              </div>

              <h3 className="text-2xl font-black text-white mb-2.5 tracking-tight">Historique Commandes</h3>
              <p className="text-xs font-semibold text-slate-300 mb-8 leading-relaxed">
                Consulter l'historique complet des tickets, modifier, réimprimer ou annuler une vente.
              </p>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-black">
                <span className="text-slate-400">Historique des Ventes</span>
                <span className="text-indigo-400 font-black group-hover:text-indigo-300">Voir les commandes →</span>
              </div>
            </div>

            {/* Button 3: Rapports */}
            <div
              onClick={() => router.push('/history')}
              className="group relative overflow-hidden rounded-3xl bg-slate-900 border border-emerald-500/30 p-8 text-white shadow-2xl shadow-slate-900/20 hover:border-emerald-500/80 hover:shadow-emerald-500/20 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer"
            >
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-emerald-600/20 blur-2xl pointer-events-none group-hover:bg-emerald-600/35 transition-all" />

              <div className="flex items-center justify-between mb-6">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-300">
                  <BarChart3 size={15} /> 3. RAPPORTS
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-md group-hover:bg-emerald-500 group-hover:rotate-12 transition-all">
                  <Sparkles size={18} />
                </span>
              </div>

              <h3 className="text-2xl font-black text-white mb-2.5 tracking-tight">Rapports & Activité</h3>
              <p className="text-xs font-semibold text-slate-300 mb-8 leading-relaxed">
                Consulter les bilans de caisse, les synthèses des tickets et le suivi des règlements.
              </p>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-black">
                <span className="text-slate-400">Rapports de Caisse</span>
                <span className="text-emerald-400 font-black group-hover:text-emerald-300">Consulter les rapports →</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
