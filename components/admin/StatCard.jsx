'use client';

import { Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const colorVariants = {
  blue: { 
    bg: 'bg-blue-600', 
    iconBg: 'bg-blue-600',
    shadow: 'shadow-blue-600/20',
    text: 'text-blue-600'
  },
  green: { 
    bg: 'bg-emerald-500', 
    iconBg: 'bg-emerald-500',
    shadow: 'shadow-emerald-500/20',
    text: 'text-emerald-500'
  },
  red: { 
    bg: 'bg-rose-500', 
    iconBg: 'bg-rose-500',
    shadow: 'shadow-rose-500/20',
    text: 'text-rose-500'
  },
  orange: { 
    bg: 'bg-orange-500', 
    iconBg: 'bg-orange-500',
    shadow: 'shadow-orange-500/20',
    text: 'text-orange-500'
  },
  purple: { 
    bg: 'bg-violet-600', 
    iconBg: 'bg-violet-600',
    shadow: 'shadow-violet-600/20',
    text: 'text-violet-600'
  },
  indigo: { 
    bg: 'bg-indigo-600', 
    iconBg: 'bg-indigo-600',
    shadow: 'shadow-indigo-600/20',
    text: 'text-indigo-600'
  }
};

export default function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  variant = 'blue', 
  footerLabel, 
  footerValue, 
  trendValue, 
  trendType = 'up',
  isLoading = false 
}) {
  const colors = colorVariants[variant] || colorVariants.blue;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-50 flex flex-col h-full hover:shadow-[0_12px_45px_rgba(0,0,0,0.06)] transition-all duration-300">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-9 h-9 ${colors.iconBg} rounded-[12px] flex items-center justify-center text-white shadow-lg ${colors.shadow} shrink-0`}>
          {Icon && <Icon className="w-4.5 h-4.5" />}
        </div>
        <div className="flex flex-col gap-0.5 pr-6 relative w-full">
          <span className="text-slate-500 font-bold text-[11px] leading-tight tracking-tight uppercase">
            {title}
          </span>
          <div className="text-lg font-black text-[#1e293b] tracking-tighter">
            {isLoading ? <div className="h-7 w-14 bg-slate-100 animate-pulse rounded" /> : value}
          </div>
          <button className="absolute top-0 right-0 text-slate-300 hover:text-slate-400 transition-colors">
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-0 flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {footerLabel}
          </span>
          {isLoading ? (
            <div className="h-5 w-16 bg-slate-50 animate-pulse rounded" />
          ) : (
            <span className={`font-black text-sm ${colors.text} tracking-tight`}>
              {footerValue}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
