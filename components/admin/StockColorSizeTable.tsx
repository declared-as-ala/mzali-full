'use client';
import { stockCombinationKey } from '@/lib/product-stock-options';

type Cell = { size: string; color: string; quantity: number };
export default function StockColorSizeTable({ cells, label, disabled, onChange }: { cells: Cell[]; label: string; disabled?: boolean; onChange?: (size: string, color: string, quantity: number) => void }) {
  const normalize = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('fr');
  const sizes = [...new Map(cells.map(c => [normalize(c.size), c.size])).values()];
  const colors = [...new Map(cells.map(c => [normalize(c.color), c.color])).values()];
  const byCombination = new Map(cells.map(c => [stockCombinationKey(c.size, c.color), c]));
  const total = (entries: Cell[]) => entries.reduce((sum, cell) => sum + cell.quantity, 0);
  return <div className="overflow-x-auto rounded-xl border border-blue-100"><table className="w-full text-center text-sm"><caption className="bg-blue-50 p-3 text-left font-bold text-blue-900">{label}</caption><thead className="bg-slate-50"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-50 p-3 text-left">Couleur / Taille</th>{sizes.map(size => <th scope="col" className="min-w-24 p-3 uppercase" key={normalize(size)}>{size || 'Standard'}</th>)}<th scope="col" className="bg-blue-50 p-3 text-blue-900">Total</th></tr></thead><tbody>{colors.map(color => <tr className="border-t" key={normalize(color)}><th scope="row" className="sticky left-0 bg-white p-3 text-left font-bold">{color || 'Standard'}</th>{sizes.map(size => {
    const cell = byCombination.get(stockCombinationKey(size, color));
    return <td className="border-l p-2" key={normalize(size)}>{!cell ? <span className="text-slate-300" aria-label="Combinaison inexistante">—</span> : onChange ? <input aria-label={`${label} ${color} ${size}`} className="input w-24 text-center font-bold" type="number" min={0} step={1} value={cell.quantity} disabled={disabled} onFocus={e => e.target.select()} onChange={e => onChange(cell.size, cell.color, Number(e.target.value))} /> : <span className={`font-bold ${cell.quantity === 0 ? 'text-slate-400' : 'text-emerald-700'}`}>{cell.quantity}</span>}</td>;
  })}<td className="bg-blue-50 p-3 font-black text-blue-900">{total(cells.filter(c => normalize(c.color) === normalize(color)))}</td></tr>)}</tbody><tfoot className="border-t bg-blue-50 font-black text-blue-900"><tr><th scope="row" className="sticky left-0 bg-blue-50 p-3 text-left">Total</th>{sizes.map(size => <td className="p-3" key={normalize(size)}>{total(cells.filter(c => normalize(c.size) === normalize(size)))}</td>)}<td className="p-3" aria-label="Total général">{total(cells)}</td></tr></tfoot></table></div>;
}
