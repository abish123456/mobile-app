'use client';

import { ListOrdered, CreditCard, Banknote } from 'lucide-react';
import StatCard from './StatCard';

export default function ReportStats({ stats, isLoading }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        title="Total Non-Delivered (Previous Day)"
        value={stats.prevTotalOrdersCount || 0}
        icon={ListOrdered}
        variant="indigo"
        footerLabel="Category"
        footerValue="All Orders"
        isLoading={isLoading}
      />

      <StatCard
        title="Online Paid Non-Delivered (Previous Day)"
        value={stats.prevPaidOrdersCount || 0}
        icon={CreditCard}
        variant="blue"
        footerLabel="Category"
        footerValue="Online Paid"
        isLoading={isLoading}
      />

      <StatCard
        title="COD Non-Delivered (Previous Day)"
        value={stats.prevCodOrdersCount || 0}
        icon={Banknote}
        variant="purple"
        footerLabel="Category"
        footerValue="COD"
        isLoading={isLoading}
      />
    </div>
  );
}
