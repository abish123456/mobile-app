'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Package, Users, TrendingUp, Loader2, Calendar, UserCheck, ShoppingCart, Truck, IndianRupee, CheckCircle2, XCircle, CreditCard, Banknote, Wallet, RefreshCw, History, ListOrdered, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../../lib/admin-api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { DatePicker } from '../../components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import DashboardStats from '../../components/admin/DashboardStats';
import ReportStats from '../../components/admin/ReportStats';
import PaymentOverviewStats from '../../components/admin/PaymentOverviewStats';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalOrders: 0,
    todayOrdersReceived: 0,
    todayScheduledDeliveries: 0,
    activeDeliveryBoys: 0,
    revenue: 0,
    todayRevenue: 0,
    todayRevenueCount: 0,
    todayOrdersAmount: 0,
    paidOrdersCount: 0,
    paidOrdersAmount: 0,
    codOrdersCount: 0,
    codOrdersAmount: 0,
    deliveredOrdersCount: 0,
    deliveredOrdersAmount: 0,
    nonDeliveredOrdersCount: 0,
    nonDeliveredOrdersAmount: 0,
    customerUsage: 0,
    codExpected: 0,
    codExpectedCount: 0,
    codCollected: 0,
    codCollectedCount: 0,
    cansToBeDelivered: 0,
    cansDelivered: 0,
    totalCansWithCustomers: 0,
    todayOrdersByTime: [],
    topPincodes: [],
    dailyRevenue: [],
    isFiltered: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminPermissions, setAdminPermissions] = useState([]);
  const [isPermsLoading, setIsPermsLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [date, setDate] = useState(new Date());
  const [routePage, setRoutePage] = useState(1);
  const productsPerPage = 5;
  const routesPerPage = 5;
  
  const [leftRoutePage, setLeftRoutePage] = useState(1);
  const leftRoutesPerPage = 4;

  const [currentView, setCurrentView] = useState(0);
  const [routeViewType, setRouteViewType] = useState('products'); // 'products' or 'delivery'
  const [leftGraphView, setLeftGraphView] = useState('route-delivery'); // 'route-delivery' or 'daily-payment'
  const views = [
    { id: 'delivery', title: 'Delivery Overview' },
    { id: 'reports', title: 'Previous Day  Reports & Payment Overview' }
  ];

  const nextView = () => setCurrentView((prev) => (prev + 1) % views.length);
  const prevView = () => setCurrentView((prev) => (prev - 1 + views.length) % views.length);

  useEffect(() => {
    const perms = localStorage.getItem('adminPermissions');
    if (perms) {
      setAdminPermissions(JSON.parse(perms));
    }
    setIsPermsLoading(false);
  }, []);

  const hasPermission = (perm) => {
    return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
  };

  useEffect(() => {
    if (!isPermsLoading && !hasPermission('view_dashboard')) {
      const hasPerm = (p) => adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(p);
      
      if (hasPerm('view_orders')) router.replace('/admin/orders');
      else if (hasPerm('view_assign_routes')) router.replace('/admin/routes');
      else if (hasPerm('view_routes')) router.replace('/admin/service-routes');
      else if (hasPerm('view_service_areas')) router.replace('/admin/service-areas');
      else if (hasPerm('view_products')) router.replace('/admin/products');
      else if (hasPerm('view_delivery_staff')) router.replace('/admin/delivery-boys');
      else if (hasPerm('view_not_delivered_reasons')) router.replace('/admin/not-delivered-reasons');
      else if (hasPerm('view_delivery_exceptions')) router.replace('/admin/delivery-exceptions');
      else if (hasPerm('view_order_log')) router.replace('/admin/order-log');
      else if (hasPerm('view_customers')) router.replace('/admin/customer-prices');
      else if (hasPerm('view_deposit_refunds')) router.replace('/admin/deposit-refunds');
      else if (hasPerm('view_delivery_performance')) router.replace('/admin/delivery-boys-performance');
      else if (hasPerm('view_general_reports')) router.replace('/admin/reports');
      else if (hasPerm('view_delivery_settings')) router.replace('/admin/settings');
      else if (hasPerm('view_support_contacts')) router.replace('/admin/settings/contacts');
      else if (hasPerm('view_roles')) router.replace('/admin/settings/team');
      else if (hasPerm('view_admins')) router.replace('/admin/settings/admins');
    }
  }, [isPermsLoading, adminPermissions, router]);

  const [orderModal, setOrderModal] = useState({
    isOpen: false,
    type: '',
    title: '',
    orders: [],
    isLoading: false
  });

/*
  const handleCardClick = async (type, title) => {
    setOrderModal({ ...orderModal, isOpen: true, type, title, isLoading: true, orders: [] });
    
    try {
      const params = new URLSearchParams();
      params.append('type', type);
      params.append('startDate', date.toISOString());
      params.append('endDate', date.toISOString());
      
      const response = await adminFetch(`/api/admin/dashboard/orders?${params.toString()}`);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setOrderModal(prev => ({ ...prev, orders: data, isLoading: false }));
      } else {
        setOrderModal(prev => ({ ...prev, isLoading: false }));
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setOrderModal(prev => ({ ...prev, isLoading: false }));
    }
  };
*/

  useEffect(() => {
    fetchDashboardStats();

    // Auto-refresh every 60 seconds (1 minute)
    const intervalId = setInterval(() => {
      fetchDashboardStats();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [date]); // Refetch when date changes

  const fetchDashboardStats = async () => {
    setIsLoading(true);
    setError('');

    try {
      let url = '/api/admin/dashboard';
      if (date) {
        const params = new URLSearchParams();
        params.append('startDate', date.toISOString());
        params.append('endDate', date.toISOString());
        url += `?${params.toString()}`;
      }

      const response = await adminFetch(url);
      const data = await response.json();

      if (data.success) {
        setStats(data.stats || {
          totalOrders: 0,
          todayOrdersReceived: 0,
          todayScheduledDeliveries: 0,
          activeDeliveryBoys: 0,
          revenue: 0,
          todayRevenue: 0,
          customerUsage: 0,
          codExpected: 0,
          codExpectedCount: 0,
          codCollected: 0,
          codCollectedCount: 0,
          cansToBeDelivered: 0,
          cansDelivered: 0,
          totalCansWithCustomers: 0,
          todayOrdersByTime: [],
          topPincodes: [],
          routeWiseProducts: [],
          dailyRevenue: [],
          isFiltered: false
        });
        // Signal that data has been refreshed
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        setError(data.message || 'Failed to fetch dashboard stats');
      }
      setRoutePage(1); // Reset pagination on new data fetch
      setLeftRoutePage(1); // Reset left side pagination
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `RS. ${new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(amount)}`;
  };


  // Filter today's orders by payment type
  const filteredTodayOrders = stats.todayOrdersByTime.map((item) => {
    if (paymentFilter === 'online') {
      return {
        time: item.time,
        cod: 0,
        online: item.online,
      };
    } else if (paymentFilter === 'cod') {
      return {
        time: item.time,
        cod: item.cod,
        online: 0,
      };
    }
    return item;
  });

  // Group products by route
  const groupedRouteProducts = Object.entries(
    (stats.routeWiseProducts || []).reduce((acc, curr) => {
      if (!acc[curr.routeName]) acc[curr.routeName] = [];
      acc[curr.routeName].push(curr);
      return acc;
    }, {})
  ).map(([routeName, products]) => ({
    routeName,
    products
  }));

  const flattenedProducts = [];
  groupedRouteProducts.forEach((routeGroup) => {
    routeGroup.products.forEach((product, pIndex) => {
      flattenedProducts.push({
        ...product,
        routeName: routeGroup.routeName,
        isFirstInRoute: pIndex === 0,
        isLastInRoute: pIndex === routeGroup.products.length - 1,
      });
    });
  });

  if (isPermsLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!hasPermission('view_dashboard')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <XCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view the Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{views[currentView].title}</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Navigation Arrows for Cards */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-sm gap-1">
            <Button 
              variant={currentView === 0 ? "white" : "ghost"} 
              size="sm" 
              onClick={() => setCurrentView(0)} 
              className={`h-8 px-3 flex items-center gap-2 rounded-md transition-all ${currentView === 0 ? 'bg-white shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Truck className={`h-4 w-4 ${currentView === 0 ? 'text-primary' : ''}`} />
              <span className="text-xs font-bold">Delivery</span>
            </Button>
            <Button 
              variant={currentView === 1 ? "white" : "ghost"} 
              size="sm" 
              onClick={() => setCurrentView(1)} 
              className={`h-8 px-3 flex items-center gap-2 rounded-md transition-all ${currentView === 1 ? 'bg-white shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <History className={`h-4 w-4 ${currentView === 1 ? 'text-primary' : ''}`} />
              <span className="text-xs font-bold">Reports</span>
            </Button>
          </div>
          <DatePicker date={date} setDate={setDate} />
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}

      {/* Card Views Section */}
      {currentView === 0 && (
        <DashboardStats stats={stats} isLoading={isLoading} />
      )}

      {currentView === 1 && (
        <>
          <ReportStats stats={stats} isLoading={isLoading} />
          <PaymentOverviewStats stats={stats} isLoading={isLoading} />
        </>
      )}

      {/* Graphs - Always Show */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left Side Graph with Toggle */}
        <Card className="shadow-sm border border-slate-200/60 bg-white h-[420px] flex flex-col justify-between">
          <CardHeader className="pb-5 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800">
                  {leftGraphView === 'route-delivery' ? 'Route-Wise Delivery Status' : 'Daily Payment Received'}
                </CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-sm gap-1">
                  <Button 
                    variant={leftGraphView === 'route-delivery' ? "white" : "ghost"} 
                    size="sm" 
                    onClick={() => { setLeftGraphView('route-delivery'); setLeftRoutePage(1); }} 
                    className={`h-6 px-2 flex items-center text-[10px] rounded-md transition-all ${leftGraphView === 'route-delivery' ? 'bg-white shadow-sm border border-slate-200 font-bold text-slate-800' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
                  >
                    Route Delivery
                  </Button>
                  <Button 
                    variant={leftGraphView === 'daily-payment' ? "white" : "ghost"} 
                    size="sm" 
                    onClick={() => setLeftGraphView('daily-payment')} 
                    className={`h-6 px-2 flex items-center text-[10px] rounded-md transition-all ${leftGraphView === 'daily-payment' ? 'bg-white shadow-sm border border-slate-200 font-bold text-slate-800' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
                  >
                    Daily Payment
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden pt-4">
            {leftGraphView === 'daily-payment' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(date) => {
                      try {
                        const d = new Date(date);
                        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                      } catch (e) {
                        return date;
                      }
                    }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(value) => `₹${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
                    dx={-10}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                    formatter={(value) => [`₹${new Intl.NumberFormat('en-IN').format(value)}`, 'Revenue']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} barSize={32}>
                    {stats.dailyRevenue.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === stats.dailyRevenue.length - 1 ? '#f59e0b' : '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              ) : (
              <div className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                      <TableHead className="h-10 text-[11px] font-bold uppercase tracking-wider text-slate-400">Route</TableHead>
                      <TableHead className="h-10 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">Empty Cans</TableHead>
                      <TableHead className="h-10 text-[11px] font-bold uppercase tracking-wider text-slate-400">Delivery Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topPincodes.slice((leftRoutePage - 1) * leftRoutesPerPage, leftRoutePage * leftRoutesPerPage).map((route, index) => {
                      const total = (route.delivered || 0) + (route.not_delivered || 0);
                      const deliveredPercent = total > 0 ? (route.delivered / total) * 100 : 0;
                      const notDeliveredPercent = total > 0 ? (route.not_delivered / total) * 100 : 0;

                      return (
                        <TableRow key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors last:border-0">
                          <TableCell className="py-3 font-semibold text-slate-700 text-sm">{route.routeName}</TableCell>
                          <TableCell className="py-3 text-center text-sm font-medium text-slate-600">{route.empty_cans}</TableCell>
                          <TableCell className="py-3 min-w-[200px]">
                            <div className="space-y-1.5">
                              <div className="h-2 w-full flex rounded-full overflow-hidden bg-slate-100 shadow-inner">
                                {deliveredPercent > 0 && (
                                  <div
                                    className="bg-emerald-500 h-full transition-all duration-700 ease-out"
                                    style={{ width: `${deliveredPercent}%` }}
                                  />
                                )}
                                {notDeliveredPercent > 0 && (
                                  <div
                                    className="bg-rose-500 h-full transition-all duration-700 ease-out"
                                    style={{ width: `${notDeliveredPercent}%` }}
                                  />
                                )}
                              </div>
                              <div className="flex justify-between text-[10px] font-medium text-slate-400 px-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Delivered: {route.delivered}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Not Delivered: {route.not_delivered}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!stats.topPincodes || stats.topPincodes.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-10 text-slate-400 text-sm italic">
                          No delivery data recorded for this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              )}
          </CardContent>
          {leftGraphView === 'route-delivery' && stats.topPincodes.length > leftRoutesPerPage && (
            <div className="flex items-center justify-end border-t border-slate-100 py-2.5 px-4 bg-slate-50/50 gap-1 shrink-0 rounded-b-lg">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7 bg-white" 
                onClick={() => setLeftRoutePage(prev => Math.max(1, prev - 1))}
                disabled={leftRoutePage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold text-slate-600 px-2 min-w-16 text-center">
                Page {leftRoutePage} of {Math.ceil(stats.topPincodes.length / leftRoutesPerPage)}
              </span>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7 bg-white" 
                onClick={() => setLeftRoutePage(prev => Math.min(Math.ceil(stats.topPincodes.length / leftRoutesPerPage), prev + 1))}
                disabled={leftRoutePage >= Math.ceil(stats.topPincodes.length / leftRoutesPerPage)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>

        {/* Route-Wise Delivery Status */}
        <Card className="shadow-sm border border-slate-200/60 bg-white h-[420px] flex flex-col justify-between">
          <CardHeader className="pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg font-bold text-slate-800">Route-Wise Details</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2 flex-1 overflow-hidden">
            {/* routeViewType === 'products' ? ( */}
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 hover:bg-transparent bg-white">
                      <TableHead className="h-11 px-4 text-[12px] font-bold uppercase tracking-wider text-slate-500 w-[35%]">Route Name</TableHead>
                      <TableHead className="h-11 px-4 text-[12px] font-bold uppercase tracking-wider text-slate-500 w-[45%]">Scheduled Product</TableHead>
                      <TableHead className="h-11 px-4 text-[12px] font-bold uppercase tracking-wider text-slate-500 text-right w-[20%]">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flattenedProducts.slice((routePage - 1) * productsPerPage, routePage * productsPerPage).map((product, pIndex) => {
                      const isFirstOnPage = pIndex === 0;
                      const showRouteName = product.isFirstInRoute || isFirstOnPage;
                      const isLastOnPage = pIndex === productsPerPage - 1 || (routePage - 1) * productsPerPage + pIndex === flattenedProducts.length - 1;
                      const showBottomBorder = product.isLastInRoute || isLastOnPage;

                      return (
                        <TableRow 
                          key={`${product.routeName}-${product.productName}-${pIndex}`} 
                          className={`hover:bg-slate-50/80 transition-colors ${showBottomBorder ? 'border-b border-slate-200' : 'border-b border-slate-50'}`}
                        >
                          <TableCell className="py-3 px-4 align-top">
                            {showRouteName && (
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                                  <Truck className="h-3.5 w-3.5" />
                                </div>
                                <span className="font-bold text-slate-800 text-[13px]">{product.routeName}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Package className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-[13px] font-medium text-slate-700">{product.productName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4 text-right">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 border-slate-200 shadow-sm">
                              {product.totalQuantity}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!stats.routeWiseProducts || stats.routeWiseProducts.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-12">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <Package className="h-8 w-8 text-slate-300" />
                            <p className="text-slate-400 text-sm font-medium">No products scheduled for this period</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            {/* End of products table */}
          </CardContent>
          {(routeViewType === 'products' ? flattenedProducts : stats.topPincodes).length > (routeViewType === 'products' ? productsPerPage : routesPerPage) && (
            <div className="flex items-center justify-end border-t border-slate-100 py-2.5 px-4 bg-slate-50/50 gap-1 shrink-0 rounded-b-lg">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7 bg-white" 
                onClick={() => setRoutePage(prev => Math.max(1, prev - 1))}
                disabled={routePage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold text-slate-600 px-2 min-w-16 text-center">
                Page {routePage} of {Math.ceil((routeViewType === 'products' ? flattenedProducts.length / productsPerPage : stats.topPincodes.length / routesPerPage))}
              </span>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7 bg-white" 
                onClick={() => setRoutePage(prev => Math.min(Math.ceil((routeViewType === 'products' ? flattenedProducts.length / productsPerPage : stats.topPincodes.length / routesPerPage)), prev + 1))}
                disabled={routePage >= Math.ceil((routeViewType === 'products' ? flattenedProducts.length / productsPerPage : stats.topPincodes.length / routesPerPage))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
      
      {/* Orders List Modal */}
      {/* 
      <Dialog open={orderModal.isOpen} onOpenChange={(open) => setOrderModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center justify-between">
              <span>{orderModal.title}</span>
              <Badge variant="secondary" className="ml-2">
                {orderModal.orders.length} Orders
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Detailed list of orders for the selected category on {date.toLocaleDateString('en-IN')}.
            </DialogDescription>
          </DialogHeader>

          {orderModal.isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-slate-500 font-medium">Fetching orders list...</p>
            </div>
          ) : orderModal.orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <Package className="h-12 w-12 text-slate-300" />
              <p className="text-slate-500 font-medium">No orders found for this category.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden border-slate-200 shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">Order ID</TableHead>
                    <TableHead className="font-bold text-slate-700">Customer</TableHead>
                    <TableHead className="font-bold text-slate-700">Amount</TableHead>
                    <TableHead className="font-bold text-slate-700">Status</TableHead>
                    <TableHead className="font-bold text-slate-700">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderModal.orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-mono text-xs text-slate-500">
                        #{order.id.slice(-8).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{order.customerName}</span>
                          <span className="text-xs text-slate-500">{order.customerPhone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-slate-900">
                        {formatCurrency(order.amount / 100)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            (order.historicalStatus || order.status) === 'DELIVERED' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' :
                            (order.historicalStatus || order.status) === 'CANCELLED' ? 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200' :
                            'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200'
                          }
                        >
                          {order.historicalStatus || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-4 border-slate-300 text-slate-600">
                            {order.paymentMethod}
                          </Badge>
                          <span className={`text-[10px] font-bold ${order.paymentStatus === 'SUCCESS' ? 'text-green-600' : 'text-orange-500'}`}>
                            {order.paymentStatus}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setOrderModal(prev => ({ ...prev, isOpen: false }))}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      */}
    </div>
  );
}
