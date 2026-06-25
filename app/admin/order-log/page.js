'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '../../../lib/admin-api';
import { formatInTimeZone } from 'date-fns-tz';
import { format } from 'date-fns';
import {
  Search, Loader2, Package, User, Phone, MapPin, CreditCard,
  Clock, CheckCircle2, XCircle, AlertTriangle, Truck, Route,
  Link2, Wallet, RefreshCw, Calendar as CalendarIcon, IndianRupee, Info,
  ChevronDown, ChevronUp, Hash, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Calendar as CalendarComponent } from '../../../components/ui/calendar';
import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';

const IST = 'Asia/Kolkata';

function fmtDateTime(iso) {
  if (!iso) return 'N/A';
  return formatInTimeZone(new Date(iso), IST, 'dd MMM yyyy, h:mm a');
}

function fmtDate(iso) {
  if (!iso) return 'N/A';
  return formatInTimeZone(new Date(iso), IST, 'dd MMM yyyy');
}

function fmtTime(iso) {
  if (!iso) return '';
  return formatInTimeZone(new Date(iso), IST, 'h:mm a');
}

const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CONFIRMED: 'bg-blue-100 text-blue-800 border-blue-200',
  OUT_FOR_DELIVERY: 'bg-purple-100 text-purple-800 border-purple-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  NOT_DELIVERED: 'bg-orange-100 text-orange-800 border-orange-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

const PAYMENT_STATUS_COLORS = {
  SUCCESS: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  FAILED: 'bg-red-100 text-red-800',
  COD: 'bg-blue-100 text-blue-800',
};

const EVENT_CONFIG = {
  ORDER_PLACED:         { icon: Package,      color: 'bg-blue-500',   label: 'Order Placed' },
  PAYMENT_INITIATED:    { icon: CreditCard,   color: 'bg-yellow-500', label: 'Payment Initiated' },
  PAYMENT_SUCCESS:      { icon: CheckCircle2, color: 'bg-green-500',  label: 'Payment Confirmed' },
  PAYMENT_FAILED:       { icon: XCircle,      color: 'bg-red-500',    label: 'Payment Failed' },
  ROUTE_ASSIGNED:       { icon: Route,        color: 'bg-indigo-500', label: 'Route Assigned' },
  ROUTE_LINK_GENERATED: { icon: Link2,        color: 'bg-purple-500', label: 'Route Link' },
  DELIVERED:            { icon: CheckCircle2, color: 'bg-emerald-500',label: 'Delivered' },
  NOT_DELIVERED:        { icon: AlertTriangle,color: 'bg-orange-500', label: 'Not Delivered' },
  DEPOSIT_CREDITED:     { icon: Wallet,       color: 'bg-teal-500',   label: 'Deposit' },
  DEPOSIT_DEBITED:      { icon: Wallet,       color: 'bg-amber-500',  label: 'Deposit' },
  CANCELLED:            { icon: XCircle,      color: 'bg-red-600',    label: 'Cancelled' },
};

function TimelineEvent({ event, isLast }) {
  const [open, setOpen] = useState(false);
  const cfg = EVENT_CONFIG[event.type] || { icon: Info, color: 'bg-gray-500', label: event.type };
  const Icon = cfg.icon;
  const hasMeta = event.meta && Object.keys(event.meta).length > 0;

  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center">
        <div className={`flex items-center justify-center w-7 h-7 rounded-full ${cfg.color} shadow-sm shrink-0`}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1 mb-1 min-h-[16px]" />}
      </div>

      {/* Content */}
      <div className={`pb-4 flex-1 ${isLast ? '' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{event.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDateTime(event.timestamp)}
            </p>
          </div>
          {hasMeta && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
            >
              Details {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {event.description && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-gray-600">{event.description}</p>
            {event.type === 'DELIVERED' && (
              <>
                {event.meta?.isQrPayment ? (
                  <Badge className="text-[10px] py-0 h-4 bg-blue-600 text-white border-0 font-bold px-1.5">
                    QR PAID
                  </Badge>
                ) : event.meta?.paymentMethod === 'COD' ? (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 font-bold px-1.5">
                    COD
                  </Badge>
                ) : null}
              </>
            )}
          </div>
        )}

        {open && hasMeta && (
          <div className="mt-1.5 p-2 bg-gray-50 rounded-lg border border-gray-100 text-[11px] space-y-0.5">
            {event.type === 'DELIVERED' && event.meta.paymentMethod && (
              <div className="mb-2 pb-2 border-b border-gray-200">
                {event.meta.paymentInstrument && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-36 shrink-0 uppercase tracking-tighter font-bold">Payment Type</span>
                    <span className="text-gray-700 font-bold uppercase">{event.meta.paymentInstrument}</span>
                  </div>
                )}
              </div>
            )}
            {Object.entries(event.meta).map(([k, v]) => {
              if (v === null || v === undefined || v === '') return null;
              if (['deliverySlot', 'newSlot', 'oldSlot', 'type', 'isQrPayment', 'fromRoute', 'toRoute'].includes(k)) return null;
              if (event.type === 'DELIVERED' && ['paymentMethod', 'paymentInstrument'].includes(k)) return null;
              if (event.type === 'REASSIGNED' && ['oldDeliveryBoy', 'newDeliveryBoy', 'reason'].includes(k)) return null;
              
              let displayVal = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
// ...
              
              if (['deliveryDate', 'expectedDeliveryDate', 'newDate', 'oldDate', 'newDeliveryDate', 'oldDeliveryDate'].includes(k)) {
                try { displayVal = fmtDate(v); } catch {}
              } else if (k.toLowerCase().includes('date') || k.toLowerCase().includes('at')) {
                try { displayVal = fmtDateTime(v); } catch {}
              }
              if (k === 'amount') displayVal = `₹${Number(v).toFixed(2)}`;
              let label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
              if (k === 'bankRrn') label = 'Bank RRN';
              if (k === 'upiId') label = 'UPI ID';
              if (k === 'payerContact') label = 'Payer Contact';
              return (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-400 w-36 shrink-0">{label}</span>
                  <span className="text-gray-700 break-all">{displayVal}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderSummaryCard({ order }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showEmptyCans, setShowEmptyCans] = useState(false);

  // Calculate breakdown if items exist
  const hasItems = order.items && order.items.length > 0;
  let subtotal = 0;
  let taxTotal = 0;

  if (hasItems) {
    order.items.forEach(item => {
      const itemSubtotal = item.price * item.quantity;
      subtotal += itemSubtotal;
      taxTotal += (itemSubtotal * (item.gst || 0)) / 100;
    });
  } else {
    // Fallback if no items
    const gstRate = 0.05; 
    subtotal = order.amount / (1 + gstRate);
    taxTotal = order.amount - subtotal;
  }

  return (
    <Card className="border-2 border-blue-100 shadow-sm flex flex-col h-[580px] lg:h-[640px]">
      <CardHeader className="py-2.5 border-b border-gray-100 bg-blue-50/10">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            Order Details
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {order.orderNumber || `#${order.id.slice(-8).toUpperCase()}`}
            </Badge>
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1 font-mono">Internal ID : {order.id}</p>
        </div>
      </CardHeader>
      
      <CardContent className="pt-3 flex-1 flex flex-col overflow-y-auto custom-scrollbar-light">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Customer Information */}
        <section className="space-y-2">
          <h3 className="text-[12px] font-bold flex items-center gap-2 text-black-700 uppercase tracking-widest">
            <User className="h-4 w-4 text-blue-600" />
            Customer Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">Customer ID:</p>
                <p className="text-sm font-medium text-gray-700">{order.customer.internalId?.slice(-8).toUpperCase() || order.customer.id.slice(-8).toUpperCase()}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Order Date & Time
                </p>
                <p className="text-sm font-medium text-gray-700">{fmtDateTime(order.createdAt)}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">Name:</p>
              <p className="text-sm font-medium text-blue-600">{order.customer.name}</p>
              <p className="text-sm font-medium text-blue-600">{order.customer.phone}</p>
            </div>
          </div>
        </section>

        {/* Delivery Address */}
          <section className="space-y-2">
            <h3 className="text-[12px] font-bold flex items-center gap-2 text-black-600 uppercase tracking-widest">
              <MapPin className="h-4 w-4 text-blue-600" />
              Delivery Address
            </h3>
            <div className="pl-6 space-y-3">
              <div className="flex items-start gap-2">
                <p className="text-sm  text-gray-800 flex-1">
                  {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-500">{order.address.area}, {order.address.city} - {order.address.pincode}</p>
              {order.address.landmark && <p className="text-xs font-medium text-gray-400 italic">Landmark: {order.address.landmark}</p>}
              <div className="pt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">Contact Person:</p>
                  <p className="text-sm font-medium text-gray-700">{order.address.contactName || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">Contact Number:</p>
                  <p className="text-sm font-medium text-gray-700">{order.address.contactPhone || '—'}</p>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Delivery Information */}
          <section className="space-y-2">
            <h3 className="text-[12px] font-bold flex items-center gap-2 text-black-600 uppercase tracking-widest">
              <CalendarIcon className="h-4 w-4 text-blue-600" />
              Delivery Information
            </h3>
            <div className="grid grid-cols-1 gap-y-4 pl-6">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Delivery Date
                </p>
                <p className="text-sm font-medium text-gray-700">{fmtDate(order.deliveryDate)} (Expected)</p>
              </div>
              {order.deliveredAt && (
                <div>
                  <p className="text-[10px] text-green-600 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Delivered On
                  </p>
                  <p className="text-sm font-bold text-green-600">{fmtDateTime(order.deliveredAt)}</p>
                </div>
              )}
            </div>
          </section>

          {/* Order Breakdown */}
            <section className="space-y-2">
              <button 
                onClick={() => {
                  const willShow = !showBreakdown;
                  setShowBreakdown(willShow);
                  if (willShow) setShowEmptyCans(false);
                }}
                className="w-full text-[12px] font-bold flex items-center justify-between text-black-700 uppercase tracking-widest mb-3 hover:bg-gray-50/50 p-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Order Breakdown
                </div>
                {showBreakdown ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              {showBreakdown && (
                <div className="overflow-hidden border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-widest">Product</th>
                        <th className="text-center px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-widest">Qty</th>
                        <th className="text-right px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-widest">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                      {hasItems ? (
                        order.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-2 font-normal text-gray-600">{item.productName}</td>
                            <td className="px-4 py-2 text-center text-gray-500 font-mono font-light">{item.quantity}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-700 font-mono">₹{(item.price * item.quantity).toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2 font-normal text-gray-600">{order.productName}</td>
                          <td className="px-4 py-2 text-center text-gray-500 font-mono font-light">{order.quantity}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-700 font-mono">₹{subtotal.toFixed(2)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50/80 border-t border-gray-100 divide-y divide-gray-100">
                      <tr>
                        <td colSpan={2} className="px-4 py-2 text-right text-gray-400 font-normal text-[11px]">Subtotal</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-600 font-mono text-xs">₹{subtotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-4 py-2 text-right text-gray-400 font-normal text-[11px]">Total Tax (GST)</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-600 font-mono text-xs">₹{taxTotal.toFixed(2)}</td>
                      </tr>
                      {order.depositAmount > 0 && (
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-right text-gray-400 font-normal text-[11px]">Charged Deposit</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-600 font-mono text-xs">₹{Number(order.depositAmount).toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="bg-blue-50/30">
                        <td colSpan={2} className="px-4 py-2 text-right font-medium uppercase tracking-widest text-[10px] text-gray-600">Grand Total</td>
                        <td className="px-4 py-2 text-right font-bold text-xs text-gray-800">₹{Number(order.amount).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* Empty Cans Info */}
            <section className="space-y-2">
              <button 
                onClick={() => {
                  const willShow = !showEmptyCans;
                  setShowEmptyCans(willShow);
                  if (willShow) setShowBreakdown(false);
                }}
                className="w-full text-[12px] font-bold flex items-center justify-between text-black-700 uppercase tracking-widest mb-3 hover:bg-gray-50/50 p-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Empty Cans Details
                </div>
                {showEmptyCans ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              
              {showEmptyCans && (
                <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
                  {/* Top Side: Number */}
                  <div className="bg-[#f8f9fc] p-4 text-center border-b border-gray-200 flex flex-col justify-center items-center shrink-0">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">20L Empty Cans in Hand</p>
                    <p className="text-xl font-bold text-gray-900">{order.customer?.cansInHand || 0}</p>
                  </div>

                  {/* Bottom Side: Deposit Log */}
                  <div className="flex-1 bg-white flex flex-col">
                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 shrink-0">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Deposit Amt Log</p>
                    </div>
                    <div className="overflow-y-auto max-h-[200px] custom-scrollbar-light">
                      {order.customer?.depositHistory?.length > 0 ? (
                        <div className="divide-y divide-gray-50">
                          {order.customer.depositHistory.map((tx, idx) => (
                            <div key={idx} className="px-4 py-2 flex justify-between items-center hover:bg-gray-50/50 transition-colors">
                              <span className="text-[11px] text-gray-600 font-medium">
                                {format(new Date(tx.date), 'dd MMM yyyy, h:mm a')}
                              </span>
                              <div className={`text-xs font-mono font-bold whitespace-nowrap ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.type === 'CREDIT' ? '+' : '-'}₹{Math.ceil(Math.abs(Number(tx.amount)))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-[11px] text-gray-400 py-4 italic">No deposit logs found</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </CardContent>
      
      <div className="px-6 py-1.5 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-400">
        <span>Last Updated: {fmtDateTime(order.updatedAt)}</span>
        
      </div>
    </Card>
  );
}



export default function OrderLogPage() {
  const [searchInput, setSearchInput] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logData, setLogData] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [error, setError] = useState('');

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchInput.trim();
      if (q.length >= 3 || selectedDate) {
        performSearch(q, selectedDate, 1); // Reset to page 1 on new query
      } else if (q.length === 0 && !selectedDate) {
        setSearchResults([]);
        setError('');
      }
    }, 500); 

    return () => clearTimeout(timer);
  }, [searchInput, selectedDate]);

  const fetchLog = async (orderId) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/log`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLogData(data);
          // Don't clear searchResults so they persist when clicking "Back to Search"
          return true;
        }
      }
      setError('Failed to load order log.');
      return false;
    } catch (err) {
      setError('Network error loading log.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const performSearch = async (q, date, page = 1) => {
    if (!q && !date) return;
    setIsLoading(true);
    setError('');
    
    // Only clear results if it's a fresh search (page 1)
    if (page === 1) {
      setSearchResults([]);
    }

    try {
      const params = new URLSearchParams();
      if (q) params.append('search', q);
      if (date) params.append('date', format(date, 'yyyy-MM-dd'));
      params.append('page', String(page));
      params.append('limit', '20');

      const searchRes = await adminFetch(`/api/admin/orders?${params.toString()}`);
      const searchData = await searchRes.json();
      
      if (searchData.success && searchData.orders?.length > 0) {
        setSearchResults(searchData.orders);
        if (searchData.pagination) {
          setPagination(searchData.pagination);
        }
      } else {
        setSearchResults([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
        if (q || date) {
          setError(`No orders found for your search.`);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Search failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = async (e, page = 1) => {
    e?.preventDefault();
    const q = searchInput.trim();
    if (!q && !selectedDate) { toast.error('Enter search query or select a date'); return; }
    
    setIsLoading(true);
    setError('');
    setLogData(null);
    setSearchResults([]);

    try {
      const params = new URLSearchParams();
      if (q) params.append('search', q);
      if (selectedDate) params.append('date', format(selectedDate, 'yyyy-MM-dd'));
      params.append('page', String(page));
      params.append('limit', '20');

      const searchRes = await adminFetch(`/api/admin/orders?${params.toString()}`);
      const searchData = await searchRes.json();
      
      if (searchData.success && searchData.orders?.length > 0) {
        if (searchData.orders.length === 1 && !selectedDate && page === 1) {
          await fetchLog(searchData.orders[0].id);
        } else {
          setSearchResults(searchData.orders);
          if (searchData.pagination) {
            setPagination(searchData.pagination);
          }
        }
      } else {
        setError(`No orders found for your search.`);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error(err);
      setError('Search failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          Order Log
        </h1>
        <p className="text-gray-500 mt-1">Search by Customer Name, Phone, or Order Number to see processing history.</p>
      </div>

      {/* Search */}
      <Card className="shadow-md border-2 border-blue-50">
        <CardContent className="pt-6">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="order-log-search"
                className="pl-10 h-11 text-base border-gray-300 focus:border-blue-500"
                placeholder="Search by Name, Mobile, Order Number…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                autoFocus
              />
            </div>
            
            <div className="w-full md:w-64">
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start text-left font-normal bg-white border-gray-300",
                      !selectedDate && "text-gray-400"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Ordered Date"}
                    {selectedDate && (
                      <span 
                        className="ml-auto hover:text-red-500 p-1" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(null);
                        }}
                      >
                        ✕
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setIsDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 px-8 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md active:scale-95 transition-all"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error / No Results */}
      {error && (
        error.includes('No orders found') ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <Package className="h-10 w-10 text-blue-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">No Orders Found</h3>
            <p className="text-gray-400 text-sm mt-1 max-w-sm">
              {error}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )
      )}

      {/* Loading skeleton */}
      {isLoading && !logData && searchResults.length === 0 && (
        <div className="space-y-4 animate-pulse">
          <div className="h-36 bg-gray-100 rounded-xl" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      )}

      {/* Search Results List (Multiple Matches) */}
      {searchResults.length > 0 && !logData && (
        <Card className={cn("shadow-md border-2 border-blue-100 transition-opacity duration-200", isLoading && "opacity-60 pointer-events-none")}>
          <CardHeader className="bg-blue-50/50 border-b border-blue-100 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                Found {pagination.total} matches
                {searchInput && <span> for "{searchInput}"</span>}
              </CardTitle>
              <div className="text-[10px] text-gray-500 font-medium">
                Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {searchResults.map(order => (
                <button
                  key={order.id}
                  onClick={() => fetchLog(order.id)}
                  className="w-full p-2.5 hover:bg-gray-50 flex items-center justify-between text-left transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">
                        {order.orderNumber || `#${order.id.slice(-8).toUpperCase()}`}
                      </span>
                      <Badge variant="outline" className={STATUS_COLORS[order.status]}>
                        {order.status === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : order.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1 font-bold text-blue-600"><User className="h-3 w-3" /> {order.customer.name}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {order.customer.phone}</span>
                      <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {fmtDate(order.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className="font-bold text-blue-600">₹{Number(order.amount).toFixed(2)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">
                        {order.paymentInstrument || order.paymentMethod}
                      </p>
                      {order.isQrPayment && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200 text-[8px] py-0 px-1 font-bold h-4">
                          QR
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-end gap-6">
                <div className="text-xs text-gray-500">
                  Page <span className="font-bold text-gray-900">{pagination.page}</span> of {pagination.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1 || isLoading}
                    onClick={() => performSearch(searchInput.trim(), selectedDate, pagination.page - 1)}
                    className="flex items-center gap-1 h-8 px-3"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages || isLoading}
                    onClick={() => performSearch(searchInput.trim(), selectedDate, pagination.page + 1)}
                    className="flex items-center gap-1 h-8 px-3"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detail Results */}
      {logData && !isLoading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLogData(null)}
              className="text-gray-500 hover:text-blue-600"
            >
              ← Back to Search
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="lg:col-span-1 w-full">
              {/* Order Summary */}
              <div className="h-[580px] lg:h-[640px]">
                <OrderSummaryCard order={logData.order} />
              </div>
            </div>

            <div className="lg:col-span-1 w-full">
              {/* Timeline */}
              <Card className="shadow-md flex flex-col h-[580px] lg:h-[640px]">
                <CardHeader className="pb-4 border-b border-gray-100 shrink-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle className="text-sm flex flex-col gap-1 font-bold">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        Processing Timeline
                      </div>
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md w-fit">
                        {logData.timeline.length} event{logData.timeline.length !== 1 ? 's' : ''}
                      </span>
                    </CardTitle>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${STATUS_COLORS[logData.order.status] || 'bg-gray-100 text-gray-800'}`}>
                          {logData.order.status === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : logData.order.status.replace(/_/g, ' ')}
                        </span>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${PAYMENT_STATUS_COLORS[logData.order.paymentStatus] || 'bg-gray-100 text-gray-800'}`}>
                              {logData.order.paymentMethod === 'COD' ? 'COD' : `${logData.order.paymentStatus} — ${logData.order.paymentInstrument?.toUpperCase() || logData.order.paymentMethod}`}
                            </span>
                            {logData.order.isQrPayment && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] font-bold h-6">
                                QR PAID
                              </Badge>
                            )}
                          </div>
                          {logData.order.bankRrn && (
                            <p className="text-[10px] text-gray-500 font-mono">RRN: {logData.order.bankRrn}</p>
                          )}
                          {logData.order.upiId && (
                            <p className="text-[10px] text-gray-500 font-mono">UPI: {logData.order.upiId}</p>
                          )}
                          {logData.order.payerContact && (
                            <p className="text-[10px] text-gray-500 font-mono">Payer: {logData.order.payerContact}</p>
                          )}
                        </div>
                      </div>
                      {logData.order.status === 'DELIVERED' && logData.order.deliveredAt && (
                        <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Delivered on {fmtDateTime(logData.order.deliveredAt)}
                        </p>
                      )}
                      {logData.order.status !== 'DELIVERED' && logData.order.lastFailedReason && (
                        <p className="text-sm text-red-600 font-bold flex items-center gap-1.5 mt-1 max-w-[250px] text-right leading-tight justify-end">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Failed: {logData.order.lastFailedReason}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 flex-1 overflow-y-auto custom-scrollbar-light">
                  {logData.timeline.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No timeline events found.</p>
                  ) : (
                    <div>
                      {logData.timeline.map((event, idx) => (
                        <TimelineEvent
                          key={event.id}
                          event={event}
                          isLast={idx === logData.timeline.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Initial Empty state */}
      {!logData && !isLoading && !error && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <Package className="h-10 w-10 text-blue-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700">Search for an Order</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-sm">
            Enter a Customer Name, Mobile Number, or Order Number above to view the complete history.
          </p>
        </div>
      )}
    </div>
  );
}
