
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import InventoryTable from './components/InventoryTable';
import { INITIAL_PRODUCTS, INITIAL_SHOP_INFO } from './constants';
import { Product, ShopInfo, Transaction, ThemeMode } from './types';
import { getAIInventoryAnalysis } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface TransactionGroup {
  label: string;
  transactions: Transaction[];
  total: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const App: React.FC = () => {
  // --- CORE STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('apexel_logged') === 'true');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('apexel_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('apexel_transactions');
    return saved ? JSON.parse(saved) : [];
  });
  const [shopInfo, setShopInfo] = useState<ShopInfo>(() => {
    const saved = localStorage.getItem('apexel_shop');
    return saved ? JSON.parse(saved) : INITIAL_SHOP_INFO;
  });
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('apexel_theme') as ThemeMode) || 'light');
  const [password, setPassword] = useState(() => localStorage.getItem('apexel_pass') || 'apexel_admin');
  
  // UI State
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [ledgerGroupBy, setLedgerGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('apexel_logged', isLoggedIn.toString());
    localStorage.setItem('apexel_products', JSON.stringify(products));
    localStorage.setItem('apexel_transactions', JSON.stringify(transactions));
    localStorage.setItem('apexel_shop', JSON.stringify(shopInfo));
    localStorage.setItem('apexel_theme', theme);
    localStorage.setItem('apexel_pass', password);
  }, [isLoggedIn, products, transactions, shopInfo, theme, password]);

  // --- TOAST SYSTEM ---
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // --- ACCOUNTING LOGIC ---
  const totalSalesValue = useMemo(() => 
    transactions.filter(t => t.type === 'SALE').reduce((acc, t) => acc + (t.priceAtTime * t.quantity), 0), 
  [transactions]);

  const inventoryAssetValue = useMemo(() => 
    products.reduce((acc, p) => acc + (p.price * (p.quantityPurchased - p.quantitySold)), 0), 
  [products]);

  const totalEquity = useMemo(() => totalSalesValue + inventoryAssetValue, [totalSalesValue, inventoryAssetValue]);
  
  const lowStockCount = useMemo(() => 
    products.filter(p => (p.quantityPurchased - p.quantitySold) < 10).length, 
  [products]);

  const vatAmount = useMemo(() => totalSalesValue * 0.16, [totalSalesValue]); // 16% VAT Zambia

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);
  }, [products]);

  // --- HANDLERS ---
  const handleAddStock = (id: string) => {
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, quantityPurchased: p.quantityPurchased + 1 } : p
    ));
    addToast('Stock level incremented', 'success');
  };

  const handleDeleteProduct = (id: string) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    if (confirm(`Delete ${prod.name}? This will remove it from inventory but keep historical ledger entries.`)) {
      setProducts(prev => prev.filter(p => p.id !== id));
      addToast(`${prod.name} removed from inventory`, 'info');
    }
  };

  const recordSaleTransaction = (productId: string, quantity: number, customer: string = 'Walk-in Customer') => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const remaining = product.quantityPurchased - product.quantitySold;
    if (remaining < quantity) {
      addToast(`Insufficient stock for ${product.name}.`, 'error');
      return;
    }

    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return { ...p, quantitySold: p.quantitySold + quantity };
      }
      return p;
    }));

    const newTx: Transaction = {
      id: Date.now().toString(),
      productId: product.id,
      productName: product.name,
      type: 'SALE',
      quantity: quantity,
      priceAtTime: product.price,
      date: new Date().toISOString().split('T')[0],
      entity: customer
    };
    setTransactions(prev => [newTx, ...prev]);
    addToast(`Sale recorded: ${quantity}x ${product.name}`, 'success');
  };

  const handleDeleteTransaction = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    if (confirm(`Reverse transaction for ${tx.productName}? This restores ${tx.quantity} unit(s) and updates all ledgers.`)) {
      setProducts(prevProducts => prevProducts.map(p => {
        if (p.id === tx.productId) {
          if (tx.type === 'SALE') return { ...p, quantitySold: Math.max(0, p.quantitySold - tx.quantity) };
          return { ...p, quantityPurchased: Math.max(0, p.quantityPurchased - tx.quantity) };
        }
        return p;
      }));
      setTransactions(prev => prev.filter(t => t.id !== txId));
      addToast('Transaction reversed successfully', 'info');
    }
  };

  const handleBulkDelete = () => {
    if (selectedTxIds.size === 0) return;
    if (confirm(`Bulk reverse ${selectedTxIds.size} records? Inventory balance will be automatically adjusted.`)) {
      const txsToDelete = transactions.filter(t => selectedTxIds.has(t.id));
      setProducts(prevProducts => {
        const updated = [...prevProducts];
        txsToDelete.forEach(tx => {
          const idx = updated.findIndex(p => p.id === tx.productId);
          if (idx !== -1) {
            const p = updated[idx];
            if (tx.type === 'SALE') updated[idx] = { ...p, quantitySold: Math.max(0, p.quantitySold - tx.quantity) };
            else updated[idx] = { ...p, quantityPurchased: Math.max(0, p.quantityPurchased - tx.quantity) };
          }
        });
        return updated;
      });
      setTransactions(prev => prev.filter(t => !selectedTxIds.has(t.id)));
      setSelectedTxIds(new Set());
      addToast('Bulk reversal complete', 'success');
    }
  };

  const handleFetchAIAnalysis = async () => {
    setIsGeneratingAnalysis(true);
    setAiAnalysis(null);
    try {
      const result = await getAIInventoryAnalysis(products, shopInfo);
      setAiAnalysis(result || "No analysis available.");
      setActiveTab('accounts');
      addToast('AI Audit Complete', 'success');
    } catch (error) {
      setAiAnalysis("Analysis failed. Please try again.");
      addToast('AI analysis failed', 'error');
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const addNewProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newProd: Product = {
      id: Date.now().toString(),
      sku: formData.get('sku') as string,
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      quantityPurchased: parseInt(formData.get('quantity') as string),
      quantitySold: 0,
      price: parseFloat(formData.get('price') as string),
      supplier: formData.get('supplier') as string,
      datePurchased: formData.get('datePurchased') as string,
      dateShelved: formData.get('dateShelved') as string,
      imageUrl: `https://picsum.photos/seed/${Math.random()}/400/300`
    };
    setProducts([...products, newProd]);
    setActiveTab('inventory');
    e.currentTarget.reset();
    addToast(`${newProd.name} added to stock`, 'success');
  };

  // --- LEDGER GROUPING ---
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, TransactionGroup> = {};
    transactions.forEach(tx => {
      const d = new Date(tx.date);
      let key = '', label = '';
      if (ledgerGroupBy === 'year') { key = `${d.getFullYear()}`; label = key; }
      else if (ledgerGroupBy === 'month') { 
        key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else if (ledgerGroupBy === 'week') {
        const start = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${week}`; label = `Week ${week}, ${d.getFullYear()}`;
      } else { key = tx.date; label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
      
      if (!groups[key]) groups[key] = { label, transactions: [], total: 0 };
      groups[key].transactions.push(tx);
      if (tx.type === 'SALE') groups[key].total += (tx.priceAtTime * tx.quantity);
    });
    return groups;
  }, [transactions, ledgerGroupBy]);

  // --- RENDER HELPERS ---
  const isDark = theme === 'dark';
  const cardClass = `p-8 rounded-[2.5rem] border shadow-sm transition-all duration-300 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`;
  const subTextClass = isDark ? 'text-slate-400' : 'text-slate-500';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8 animate-fadeIn">
            <header className="flex flex-col md:flex-row justify-between md:items-end gap-4">
              <div>
                <h2 className="text-4xl font-black tracking-tight">Executive Summary</h2>
                <p className={subTextClass}>Business status for {shopInfo.name}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab('sales-entry')} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 transition-all">Quick Sale</button>
                <button onClick={handleFetchAIAnalysis} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-lg transition-all flex items-center gap-2">
                  <span>🧠</span> {isGeneratingAnalysis ? 'Audit...' : 'Run AI Audit'}
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Revenue', val: `K${totalSalesValue.toLocaleString()}`, color: 'text-emerald-500', icon: '💰' },
                { label: 'Asset Value', val: `K${inventoryAssetValue.toLocaleString()}`, color: 'text-blue-500', icon: '📦' },
                { label: 'Net Profit', val: `K${(totalSalesValue * 0.3).toLocaleString()}`, color: 'text-amber-500', icon: '📈' },
                { label: 'Stock Alerts', val: lowStockCount, color: lowStockCount > 0 ? 'text-red-500' : 'text-slate-400', icon: '⚠️' }
              ].map((stat, i) => (
                <div key={i} className={cardClass + " !p-6 flex flex-col justify-between"}>
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">{stat.label}</span>
                    <span className="text-xl">{stat.icon}</span>
                  </div>
                  <div className={`text-2xl font-black mt-4 ${stat.color}`}>{stat.val}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className={cardClass + " lg:col-span-2 overflow-hidden"}>
                <h3 className="text-lg font-bold mb-8 flex items-center gap-2"><span>📊</span> Asset Distribution</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={products.slice(0, 10).map(p => ({ name: p.name, stock: p.quantityPurchased - p.quantitySold, sold: p.quantitySold }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <Tooltip contentStyle={{borderRadius: '16px', border: 'none', background: isDark ? '#0f172a' : 'white'}} />
                      <Bar dataKey="stock" fill="#10b981" radius={[6, 6, 0, 0]} name="Available" />
                      <Bar dataKey="sold" fill="#334155" radius={[6, 6, 0, 0]} name="Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className={cardClass}>
                <h3 className="text-lg font-bold mb-6">Top Performers</h3>
                <div className="space-y-4">
                  {topProducts.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 rounded-2xl bg-slate-500/5 border border-slate-500/10 hover:bg-slate-500/10 transition-colors">
                      <div className="flex items-center gap-3">
                         <img src={p.imageUrl} className="w-8 h-8 rounded-lg object-cover" />
                         <div>
                            <p className="text-xs font-black truncate max-w-[120px]">{p.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{p.quantitySold} Sold</p>
                         </div>
                      </div>
                      <span className="text-xs font-black text-emerald-600">K{p.price * p.quantitySold}</span>
                    </div>
                  ))}
                  {products.length === 0 && <p className="text-center py-10 text-slate-400 text-xs italic">No data available.</p>}
                </div>
              </div>
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="space-y-6 animate-fadeIn pb-20">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-4xl font-black tracking-tight">Financial Ledger</h2>
                {selectedTxIds.size > 0 && (
                  <button onClick={handleBulkDelete} className="bg-red-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-red-900/30">Bulk Reverse ({selectedTxIds.size})</button>
                )}
              </div>
              <div className="flex bg-slate-200/50 dark:bg-slate-700/50 p-1 rounded-2xl">
                {(['day', 'week', 'month', 'year'] as const).map(mode => (
                  <button key={mode} onClick={() => setLedgerGroupBy(mode)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerGroupBy === mode ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>
                    {mode}ly
                  </button>
                ))}
              </div>
            </header>
            <div className="space-y-10">
              {/* Fix: Explicitly type the parameters of the map callback to [string, TransactionGroup] to prevent 'unknown' type errors */}
              {Object.entries(groupedTransactions).sort(([a],[b])=>b.localeCompare(a)).map(([key, group]: [string, TransactionGroup]) => (
                <div key={key} className="space-y-4">
                  <div className="flex justify-between items-center px-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={group.transactions.every(t=>selectedTxIds.has(t.id))} onChange={()=>{
                        const all = group.transactions.every(t=>selectedTxIds.has(t.id));
                        setSelectedTxIds(prev => {
                          const next = new Set(prev);
                          group.transactions.forEach(t => all ? next.delete(t.id) : next.add(t.id));
                          return next;
                        });
                      }} className="w-4 h-4 rounded text-emerald-600" />
                      <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest">{group.label}</h3>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">TOTAL: K{group.total.toLocaleString()}</span>
                  </div>
                  <div className={cardClass + " !p-0 overflow-hidden"}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-500/5 border-b border-slate-700/10 text-[10px] uppercase font-black text-slate-400 tracking-widest">
                          <tr>
                            <th className="px-6 py-4 w-10"></th>
                            <th className="px-6 py-4">Transaction Details</th>
                            <th className="px-6 py-4">Amount</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-500/10">
                          {group.transactions.map(tx => (
                            <tr key={tx.id} className={`hover:bg-slate-500/5 transition-colors group ${selectedTxIds.has(tx.id) ? 'bg-emerald-500/5' : ''}`}>
                              <td className="px-6 py-4">
                                <input type="checkbox" checked={selectedTxIds.has(tx.id)} onChange={() => {
                                  setSelectedTxIds(prev => { const n = new Set(prev); if(n.has(tx.id)) n.delete(tx.id); else n.add(tx.id); return n; });
                                }} className="w-4 h-4 rounded text-emerald-600" />
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-bold">{tx.productName}</div>
                                <div className="text-[9px] font-black uppercase text-slate-400">{tx.type} • {tx.entity}</div>
                              </td>
                              <td className="px-6 py-4 font-black text-emerald-600">K{(tx.priceAtTime * tx.quantity).toLocaleString()}</td>
                              <td className="px-6 py-4 text-right">
                                <button onClick={() => handleDeleteTransaction(tx.id)} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <div className="py-20 text-center text-slate-400 font-bold opacity-30">LEDGER EMPTY</div>}
            </div>
          </div>
        );
      case 'accounts':
        return (
          <div className="space-y-8 animate-fadeIn pb-20">
            <header className="flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-black tracking-tight">Accounting Audit</h2>
                <p className={subTextClass}>Finalized financial positions for {shopInfo.name}</p>
              </div>
              <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest">Export P&L</button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className={cardClass}>
                <h3 className="text-xl font-black mb-6 flex justify-between">Balance Sheet <span className="text-[10px] text-slate-400">Position</span></h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between border-b border-slate-700/10 pb-2"><span>Accounts Receivable (Sales)</span><span className="font-black text-emerald-600">K{totalSalesValue.toLocaleString()}</span></div>
                  <div className="flex justify-between border-b border-slate-700/10 pb-2"><span>Current Inventory Value</span><span className="font-black text-blue-500">K{inventoryAssetValue.toLocaleString()}</span></div>
                  <div className="flex justify-between border-b border-slate-700/10 pb-2"><span>Estimated VAT Liability (16%)</span><span className="font-black text-red-500">-K{vatAmount.toLocaleString()}</span></div>
                  <div className="flex justify-between pt-4 text-2xl font-black"><span>NET EQUITY</span><span>K{(totalEquity - vatAmount).toLocaleString()}</span></div>
                </div>
              </div>
              <div className={cardClass}>
                <h3 className="text-xl font-black mb-6 flex justify-between">Profit & Loss <span className="text-[10px] text-slate-400">Activity</span></h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between border-b border-slate-700/10 pb-2"><span>Gross Sales Revenue</span><span className="font-black text-emerald-600">K{totalSalesValue.toLocaleString()}</span></div>
                  <div className="flex justify-between border-b border-slate-700/10 pb-2"><span>Cost of Goods (Est 70%)</span><span className="font-black text-red-400">-K{(totalSalesValue * 0.7).toLocaleString()}</span></div>
                  <div className="flex justify-between pt-4 text-2xl font-black text-emerald-500"><span>OPERATING PROFIT</span><span>K{(totalSalesValue * 0.3).toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            {aiAnalysis && (
              <div className="p-10 bg-slate-900 text-white rounded-[3rem] border-t-8 border-emerald-500 shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl">🧠</div>
                  <h4 className="text-2xl font-black tracking-tight">AI Strategic Audit</h4>
                </div>
                <div className="text-lg leading-relaxed text-slate-300 whitespace-pre-wrap font-medium">{aiAnalysis}</div>
              </div>
            )}
          </div>
        );
      case 'inventory':
        return (
          <div className="space-y-6 animate-fadeIn">
            <header className="flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-black tracking-tight">Stock Inventory</h2>
                <p className={subTextClass}>Physical asset management for {shopInfo.name}</p>
              </div>
              <button onClick={() => setActiveTab('entries')} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-emerald-900/20">Add New Product</button>
            </header>
            <InventoryTable 
              products={products} 
              onAddStock={handleAddStock} 
              onRecordSale={(id)=>recordSaleTransaction(id, 1)} 
              onDeleteProduct={handleDeleteProduct}
            />
          </div>
        );
      case 'entries':
        return (
          <div className="space-y-6 animate-fadeIn pb-20">
            <header>
              <h2 className="text-4xl font-black tracking-tight">Inventory Inflow</h2>
              <p className={subTextClass}>Register new stock batches into the system</p>
            </header>
            <div className={cardClass}>
              <form onSubmit={addNewProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label>
                  <input required name="name" type="text" placeholder="e.g. 50kg Breakfast Meal" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Serial / SKU Code</label>
                  <input required name="sku" type="text" placeholder="APX-001" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost Per Unit (K)</label>
                  <input required name="price" type="number" step="0.01" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Opening Stock Qty</label>
                  <input required name="quantity" type="number" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier Entity</label>
                  <input required name="supplier" type="text" placeholder="Vendor Name" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <input required name="category" type="text" placeholder="e.g. Foodstuff" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                </div>
                <div className="md:col-span-2 pt-6">
                   <button type="submit" className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest hover:bg-emerald-700 shadow-2xl shadow-emerald-900/30 transition-all">Authorize Entry</button>
                </div>
              </form>
            </div>
          </div>
        );
      case 'sales-entry':
        return (
          <div className="space-y-8 animate-fadeIn pb-20">
            <header>
              <h2 className="text-4xl font-black tracking-tight">Point of Sale</h2>
              <p className={subTextClass}>Quick record of cash transactions</p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className={cardClass}>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Cash Register</h3>
                <form onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  recordSaleTransaction(fd.get('productId') as string, parseInt(fd.get('quantity') as string));
                  e.currentTarget.reset();
                }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Item</label>
                    <select required name="productId" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold appearance-none">
                      <option value="">-- Choose Stock Item --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (K{p.price})</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</label>
                      <input required name="quantity" type="number" min="1" defaultValue="1" className="w-full px-6 py-5 rounded-2xl bg-slate-500/5 border-none outline-none font-bold" />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all uppercase tracking-widest text-xs shadow-lg">Post Receipt</button>
                    </div>
                  </div>
                </form>
                <div className="mt-10 p-6 bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-emerald-500">💡</span>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Accounting Tip</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Record every sale immediately to ensure the Balance Sheet accurately reflects Cash-on-Hand versus Inventory Assets.</p>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[3rem] overflow-hidden relative shadow-2xl flex flex-col items-center justify-center min-h-[500px] border-8 border-slate-800">
                {isScanning ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-64 h-64 border-4 border-emerald-500/40 rounded-[3rem] relative animate-pulse">
                           <div className="absolute top-1/2 left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,1)]"></div>
                        </div>
                    </div>
                    <button onClick={() => setIsScanning(false)} className="z-10 absolute bottom-10 bg-white/10 backdrop-blur-xl text-white px-8 py-3 rounded-full text-[10px] font-black tracking-widest uppercase border border-white/20 hover:bg-white/20 transition-all">Deactivate Scanner</button>
                  </>
                ) : (
                  <div className="text-center p-12 z-10 animate-fadeIn">
                    <div className="text-6xl mb-6">📸</div>
                    <h3 className="text-white font-black text-2xl mb-4 tracking-tight">Optical Scanner</h3>
                    <p className="text-slate-500 text-sm mb-10 max-w-xs mx-auto">Instant product recognition via SKU/Barcode matching for high-volume trade sessions.</p>
                    <button onClick={() => setIsScanning(true)} className="bg-emerald-600 text-white px-10 py-5 rounded-3xl font-black hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-900/60 uppercase tracking-widest text-xs">Launch Camera System</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-8 animate-fadeIn pb-20">
             <header>
               <h2 className="text-4xl font-black tracking-tight">Enterprise Controls</h2>
               <p className={subTextClass}>System-wide configurations</p>
             </header>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className={cardClass}>
                 <h3 className="text-lg font-bold mb-8">Business Identity</h3>
                 <div className="space-y-6">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trading Entity Name</label>
                     <input type="text" value={shopInfo.name} onChange={e=>setShopInfo({...shopInfo, name: e.target.value})} className="w-full bg-slate-500/5 p-5 rounded-2xl border-none font-bold" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Manager</label>
                     <input type="text" value={shopInfo.manager} onChange={e=>setShopInfo({...shopInfo, manager: e.target.value})} className="w-full bg-slate-500/5 p-5 rounded-2xl border-none font-bold" />
                   </div>
                   <button onClick={() => addToast('Business profile updated', 'success')} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg">Commit Profile Changes</button>
                 </div>
               </div>
               <div className={cardClass}>
                 <h3 className="text-lg font-bold mb-8">System & Security</h3>
                 <div className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <button onClick={()=>{
                        if(confirm("DANGER: Wiping all records will reset your ledger to zero. Proceed?")) { setProducts([]); setTransactions([]); localStorage.clear(); window.location.reload(); }
                      }} className="bg-red-500/10 text-red-500 p-5 rounded-2xl font-black text-[10px] uppercase border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Purge All Data</button>
                      <button onClick={()=>{
                        const blob = new Blob([JSON.stringify({products, transactions, shopInfo}, null, 2)], {type: 'application/json'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = `${shopInfo.name}_ledger_backup.json`; a.click();
                        addToast('Backup downloaded successfully', 'success');
                      }} className="bg-blue-500/10 text-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all">Download Backup</button>
                   </div>
                   <div className="pt-6 border-t border-slate-700/10">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Appearance Theme</p>
                      <div className="flex gap-4">
                        <button onClick={()=>setTheme('light')} className={`flex-1 p-4 rounded-2xl border-2 font-black text-[10px] uppercase transition-all ${theme==='light' ? 'border-emerald-500 bg-emerald-500/5' : 'border-transparent bg-slate-500/5'}`}>Modern Light</button>
                        <button onClick={()=>setTheme('dark')} className={`flex-1 p-4 rounded-2xl border-2 font-black text-[10px] uppercase transition-all ${theme==='dark' ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent bg-slate-500/5'}`}>Executive Dark</button>
                      </div>
                   </div>
                 </div>
               </div>
             </div>
          </div>
        );
      default: return null;
    }
  };

  const LoginView = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px]"></div>
      <div className="max-w-md w-full z-10 animate-fadeIn">
        <div className="text-center mb-10">
          <div className="text-6xl mb-6">💎</div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">APEXEL POS</h1>
          <p className="text-slate-400 font-bold tracking-[0.3em] text-[10px] uppercase">Financial Integrity Platform</p>
        </div>
        <form onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (fd.get('email') === 'russell@apexel.zm' && fd.get('password') === password) {
            setIsLoggedIn(true);
            setLoginError(null);
            addToast('Access Authorized', 'success');
          } else {
            setLoginError('Invalid Administrator Passkey');
            addToast('Login Failed', 'error');
          }
        }} className="bg-white p-12 rounded-[4rem] shadow-2xl space-y-8 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12"></div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identity</label>
            <input type="email" name="email" required defaultValue="russell@apexel.zm" className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-none outline-none font-bold text-slate-700" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secure Passkey</label>
            <input type="password" name="password" required className="w-full px-6 py-5 rounded-2xl bg-slate-50 border-none outline-none font-bold text-slate-700" />
          </div>
          {loginError && <p className="text-red-500 text-[10px] font-black uppercase text-center animate-pulse">{loginError}</p>}
          <button type="submit" className="w-full py-6 bg-emerald-600 text-white rounded-[2.5rem] font-black text-lg hover:bg-emerald-700 shadow-2xl transition-all uppercase tracking-widest">Enter Dashboard</button>
        </form>
      </div>
    </div>
  );

  if (!isLoggedIn) return <LoginView />;

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => { setIsLoggedIn(false); addToast('Session Terminated', 'info'); }} theme={theme} />
      
      {/* Toast Manager */}
      <div className="fixed top-8 right-8 z-[100] space-y-4">
        {toasts.map(t => (
          <div key={t.id} className={`px-6 py-4 rounded-3xl shadow-2xl border animate-fadeIn flex items-center gap-3 backdrop-blur-xl ${
            t.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 
            t.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
            'bg-slate-800/90 border-slate-700 text-white'
          }`}>
            <span className="text-xl">{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            <p className="font-bold text-sm uppercase tracking-tight">{t.message}</p>
          </div>
        ))}
      </div>

      {/* Mobile Nav Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-t border-slate-700/10 flex justify-around items-center z-50 px-4 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] rounded-t-[2.5rem]">
        {[
          { id: 'dashboard', icon: '📊' },
          { id: 'inventory', icon: '📦' },
          { id: 'sales-entry', icon: '💰' },
          { id: 'history', icon: '📜' },
          { id: 'settings', icon: '⚙️' }
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all ${activeTab === item.id ? 'bg-emerald-600 shadow-xl shadow-emerald-900/40 text-white -translate-y-2' : 'text-slate-400 hover:text-slate-600'}`}>
            {item.icon}
          </button>
        ))}
      </div>

      <main className="flex-1 md:ml-64 p-6 md:p-12 pb-32 md:pb-12">
        <div className="max-w-6xl mx-auto">
          {renderContent()}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #10b98144; border-radius: 10px; }
        input[type="checkbox"] { accent-color: #10b981; }
        @media print {
            .fixed { position: relative !important; width: 100% !important; margin: 0 !important; }
            main { margin-left: 0 !important; padding: 0 !important; }
            button, .md\\:hidden { display: none !important; }
            .md\\:ml-64 { margin-left: 0 !important; }
        }
      `}} />
    </div>
  );
};

export default App;
