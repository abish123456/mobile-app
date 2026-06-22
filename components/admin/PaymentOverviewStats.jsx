'use client';

import { CreditCard, Banknote, Wallet, Receipt } from 'lucide-react';
import StatCard from './StatCard';

export default function PaymentOverviewStats({ stats, isLoading }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // 1. Online Paid Orders (Based on Ordered Date)
  const onlinePaidCount = stats.paidOrdersCount || 0;
  const onlinePaidAmount = stats.paidOrdersAmount || 0;

  // 2. COD Collected
  const codCollectedCount = stats.deliveryDateCodCollectedCount || 0;
  const codCollectedAmount = stats.deliveryDateCodCollected || 0;

  // 3. Total Payment Received = Online Paid + COD Collected
  const totalPaymentReceivedCount = onlinePaidCount + codCollectedCount;
  const totalPaymentReceivedAmount = onlinePaidAmount + codCollectedAmount;

  // 4. COD Expected
  const codExpectedCount = stats.deliveryDateCodCount || 0;
  const codExpectedAmount = stats.deliveryDateCodAmount || 0;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-6">
      <StatCard
        title="Online Paid Orders"
        value={onlinePaidCount}
        icon={CreditCard}
        variant="blue"
        footerLabel="Total Amount"
        footerValue={formatCurrency(onlinePaidAmount)}
        isLoading={isLoading}
      />

      <StatCard
        title="COD Collected"
        value={codCollectedCount}
        icon={Banknote}
        variant="green"
        footerLabel="Total Amount"
        footerValue={formatCurrency(codCollectedAmount)}
        isLoading={isLoading}
      />

      <StatCard
        title="Total Payment Received"
        value={totalPaymentReceivedCount}
        icon={Wallet}
        variant="purple"
        footerLabel="Total Amount"
        footerValue={formatCurrency(totalPaymentReceivedAmount)}
        isLoading={isLoading}
      />

      <StatCard
        title="COD Expected"
        value={codExpectedCount}
        icon={Receipt}
        variant="orange"
        footerLabel="Total Amount"
        footerValue={formatCurrency(codExpectedAmount)}
        isLoading={isLoading}
      />
    </div>
  );
}
