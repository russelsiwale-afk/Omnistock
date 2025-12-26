
import React, { useState } from 'react';
import { Product } from '../types';

interface InventoryTableProps {
  products: Product[];
  onAddStock: (productId: string) => void;
  onRecordSale: (productId: string) => void;
  onDeleteProduct?: (productId: string) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ products, onAddStock, onRecordSale, onDeleteProduct }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      (p.sku && p.sku.toLowerCase().includes(query)) ||
      p.supplier.toLowerCase().includes(query) ||
      p.datePurchased.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
    );
  });

  const lowStockItems = products.filter(p => (p.quantityPurchased - p.quantitySold) < 10);

  if (products.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-20 text-center animate-fadeIn">
        <div className="text-6xl mb-6">📦</div>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Warehouse Clear</h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-2 font-medium">Your digital warehouse is currently empty. Use the Inflow tab to register incoming assets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-5 flex items-center justify-between animate-fadeIn backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-500/20">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-600 uppercase tracking-widest">Inventory Shortage</h4>
              <p className="text-xs text-amber-700/80 font-bold">Critical attention required for {lowStockItems.length} SKUs currently below optimal threshold.</p>
            </div>
          </div>
          <button 
            onClick={() => setSearchQuery('')} 
            className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 hover:bg-amber-500/10 px-4 py-2 rounded-xl transition-all"
          >
            Show All Items
          </button>
        </div>
      )}

      {/* Prominent Search Bar */}
      <div className="relative group max-w-4xl mx-auto w-full">
        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
          <span className="text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-300">🔍</span>
        </div>
        <input
          type="text"
          placeholder="Lookup SKU, Item Name, or Category..."
          className="block w-full pl-14 pr-8 py-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-[2.5rem] focus:ring-12 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all duration-300 outline-none text-slate-700 dark:text-slate-200 font-bold shadow-2xl shadow-slate-200/40 dark:shadow-black/20 hover:shadow-emerald-500/10 placeholder-slate-400"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
                <th className="px-8 py-5">Product Identity</th>
                <th className="px-8 py-5">Stock Health</th>
                <th className="px-8 py-5">Acquisition</th>
                <th className="px-8 py-5">Value</th>
                <th className="px-8 py-5 text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredProducts.map((product) => {
                const remaining = product.quantityPurchased - product.quantitySold;
                const isLowStock = remaining < 10;
                const isCritical = remaining < 3;
                
                return (
                  <tr key={product.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-700/10 transition-colors group ${isLowStock ? 'bg-amber-500/[0.02]' : ''}`}>
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-5">
                        <div className="relative flex-shrink-0">
                          <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-slate-100 dark:border-slate-700" 
                          />
                          {isLowStock && (
                            <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] text-white shadow-lg ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`}>
                              !
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-black text-slate-800 dark:text-slate-100 leading-tight tracking-tight">{product.name}</div>
                          <div className="flex gap-2 mt-1.5">
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-lg uppercase tracking-widest border border-emerald-500/10">SKU: {product.sku || '---'}</span>
                            <span className="text-[9px] font-black text-slate-400 bg-slate-500/5 px-2 py-0.5 rounded-lg uppercase tracking-widest border border-slate-500/10">{product.category}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <span>Progress</span>
                          <span className={isCritical ? 'text-red-500' : isLowStock ? 'text-amber-500' : 'text-emerald-500'}>{remaining} units</span>
                        </div>
                        <div className="w-32 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                           <div 
                             className={`h-full transition-all duration-1000 ${isCritical ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}
                             style={{ width: `${Math.min(100, (remaining / product.quantityPurchased) * 100)}%` }}
                           ></div>
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold">{product.quantitySold} units dispatched</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[11px] space-y-1 font-bold">
                        <div className="text-slate-400 text-[9px] uppercase tracking-widest mb-1">Purchased On</div>
                        <div className="text-slate-700 dark:text-slate-300">{product.datePurchased}</div>
                        <div className="text-emerald-600 truncate max-w-[120px]">{product.supplier}</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Market Price</div>
                      <div className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tighter">K{product.price.toLocaleString()}</div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => onAddStock(product.id)}
                          className="w-10 h-10 bg-emerald-500/10 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center shadow-sm"
                          title="Restock"
                        >
                          ➕
                        </button>
                        <button 
                          onClick={() => onRecordSale(product.id)}
                          className="w-10 h-10 bg-slate-900 text-white rounded-xl hover:bg-emerald-600 transition-all flex items-center justify-center shadow-lg"
                          title="Record Sale"
                        >
                          💰
                        </button>
                        {onDeleteProduct && (
                          <button 
                            onClick={() => onDeleteProduct(product.id)}
                            className="w-10 h-10 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                            title="Delete Product"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-24 text-center">
                    <div className="text-4xl mb-4 opacity-20">🔎</div>
                    <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">No matching assets in database</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryTable;
