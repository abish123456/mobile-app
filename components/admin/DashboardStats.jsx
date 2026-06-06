'use client';

import { Truck, CheckCircle2, XCircle, RefreshCw, CreditCard, Banknote, Package } from 'lucide-react';
import StatCard from './StatCard';

export default function DashboardStats({ stats, isLoading }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalScheduled = stats.todayScheduledDeliveries || 0;
  const deliveredCount = stats.deliveredOrdersCount || 0;
  const nonDeliveredCount = stats.nonDeliveredOrdersCount || 0;
  const reassignedCount = stats.reassignedOrdersCount || 0;

  // Calculate rates
  const completionRate = totalScheduled > 0 ? ((deliveredCount / totalScheduled) * 100).toFixed(2) : '0.00';
  const failureRate = totalScheduled > 0 ? ((nonDeliveredCount / totalScheduled) * 100).toFixed(2) : '0.00';
  const reassignmentRate = totalScheduled > 0 ? ((reassignedCount / totalScheduled) * 100).toFixed(2) : '0.00';

  // Calculate total amount for scheduled deliveries
  const totalAmount = (stats.deliveredOrdersAmount || 0) + (stats.nonDeliveredOrdersAmount || 0);

  // Calculate Trends
  const calculateTrend = (current, previous) => {
    const curr = current || 0;
    const prev = previous || 0;

    // If we have data today but none yesterday, show 100% increase
    if (prev === 0 && curr > 0) return { value: '100%', type: 'up' };

    // If both are zero, show 0% to keep the UI consistent
    if (prev === 0 && curr === 0) return { value: '0%', type: 'up' };

    const diff = ((curr - prev) / prev) * 100;
    return {
      value: `${Math.abs(diff).toFixed(0)}%`,
      type: diff >= 0 ? 'up' : 'down'
    };
  };

  const deliveredTrend = calculateTrend(deliveredCount, stats.prevDeliveredCount);
  const nonDeliveredTrend = calculateTrend(nonDeliveredCount, stats.prevNonDeliveredCount);
  const totalTrend = calculateTrend(totalScheduled, stats.prevTotalOrdersCount);

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Scheduled Delivery"
        value={totalScheduled}
        icon={Truck}
        variant="blue"
        footerLabel="Total Amount"
        footerValue={formatCurrency(totalAmount)}
        isLoading={isLoading}
      />

      <StatCard
        title="Delivered Orders"
        value={deliveredCount}
        icon={CheckCircle2}
        variant="green"
        footerLabel="Completion Rate"
        footerValue={`${completionRate}%`}
        trendValue={deliveredTrend?.value}
        trendType={deliveredTrend?.type}
        isLoading={isLoading}
      />

      <StatCard
        title="Non Delivered Orders"
        value={nonDeliveredCount}
        icon={XCircle}
        variant="red"
        footerLabel="Failure Rate"
        footerValue={`${failureRate}%`}
        trendValue={nonDeliveredTrend?.value}
        trendType={nonDeliveredTrend?.type}
        isLoading={isLoading}
      />

      <StatCard
        title="Reassigned Orders"
        value={reassignedCount}
        icon={RefreshCw}
        variant="orange"
        footerLabel="Reassignment Rate"
        footerValue={`${reassignmentRate}%`}
        isLoading={isLoading}
      />

      <StatCard
        title="Online Paid Orders"
        value={stats.deliveryDatePaidCount || 0}
        icon={CreditCard}
        variant="blue"
        footerLabel="Total Amount"
        footerValue={formatCurrency(stats.deliveryDatePaidAmount || 0)}
        isLoading={isLoading}
      />

      <StatCard
        title="COD Orders"
        value={stats.deliveryDateCodCount || 0}
        icon={Banknote}
        variant="purple"
        footerLabel="Total Amount"
        footerValue={formatCurrency(stats.deliveryDateCodAmount || 0)}
        isLoading={isLoading}
      />

      <StatCard
        title="COD Collected"
        value={stats.deliveryDateCodCollectedCount || 0}
        icon={Banknote}
        variant="green"
        footerLabel="Amount Collected"
        footerValue={formatCurrency(stats.deliveryDateCodCollected || 0)}
        isLoading={isLoading}
      />

      <StatCard
        title="Cans with Customers"
        value={stats.totalCansWithCustomers || 0}
        icon={Package}
        variant="blue"
        footerLabel="Status"
        footerValue="In Hand"
        isLoading={isLoading}
      />
    </div>
  );
}
