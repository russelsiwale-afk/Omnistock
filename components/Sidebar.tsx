
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, theme }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'inventory', label: 'Current Inventory', icon: '📦' },
    { id: 'entries', label: 'Inventory Entries', icon: '✍️' },
    { id: 'sales-entry', label: 'Record Sales', icon: '💰' },
    { id: 'history', label: 'Financial Ledger', icon: '📜' },
    { id: 'accounts', label: 'Accounts', icon: '🧾' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const bgColor = theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-emerald-900 border-emerald-800';

  return (
    <div className={`w-64 ${bgColor} text-white min-h-screen p-6 hidden md:block fixed left-0 top-0 z-50 shadow-2xl border-r flex flex-col`}>
      <div className="mb-10">
        <h1 className="text-xl font-black tracking-tighter text-emerald-400">APEXEL ENTERPRISE</h1>
        <p className="text-[10px] text-emerald-200/60 font-bold uppercase tracking-[0.3em]">Accounting Suite</p>
      </div>
      
      <nav className="space-y-1 flex-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center space-x-3 ${
              activeTab === item.id 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' 
                : 'hover:bg-white/10 text-emerald-100/70 font-medium'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-sm font-bold tracking-tight">{item.label}</span>
          </button>
        ))}
      </nav>
      
      {/* Separated Logout Area */}
      <div className="pt-10 mt-10 border-t border-white/10 space-y-4">
        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:text-white hover:bg-red-500 transition-all font-black text-xs uppercase tracking-widest"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>

        <div className="p-4 bg-black/20 rounded-xl border border-white/5">
          <p className="text-[9px] text-emerald-400/50 mb-1 font-black uppercase tracking-widest text-center">Identity Verified</p>
          <div className="flex items-center justify-center space-x-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] text-emerald-50 font-black tracking-wider text-center">RUSSELL SIWALE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
