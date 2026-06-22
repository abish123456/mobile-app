'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import PaymentMethodDropdown from '../../../components/app/PaymentMethodDropdown';
import { Loader2, Package, MapPin, Calendar, CreditCard, Clock, CheckCircle2, XCircle, Truck, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Smartphone, Landmark, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [cancelLoadingId, setCancelLoadingId] = useState(null);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loadingItemsId, setLoadingItemsId] = useState(null);

  // Payment processing state
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState({ upi: [], card: [] });
  const [onlinePaymentMethodType, setOnlinePaymentMethodType] = useState('upi'); // 'upi', 'card' or 'netbanking'
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [isFetchingPaymentMethods, setIsFetchingPaymentMethods] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Sort orders by createdAt descending (latest first)
  // IMPORTANT: Uses UTC timestamp (createdAt) for sorting, NOT IST display string
  const sortOrdersDesc = (list) => {
    if (!list || !Array.isArray(list)) return [];

    const sorted = [...list].sort((a, b) => {
      // Use UTC timestamp (createdAt) for sorting - this ensures correct chronological order
      let dateA = new Date(a.createdAt);
      let dateB = new Date(b.createdAt);

      // If dates are invalid, try ISO string comparison (lexicographic works for ISO format)
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        const strA = String(a.createdAt || '');
        const strB = String(b.createdAt || '');
        return strB.localeCompare(strA); // Reverse for DESC
      }

      // Sort by UTC timestamp (descending = latest first)
      return dateB.getTime() - dateA.getTime();
    });

    // Verify sorting is correct
    if (sorted.length > 1) {
      const firstTime = new Date(sorted[0].createdAt).getTime();
      const lastTime = new Date(sorted[sorted.length - 1].createdAt).getTime();
      const isCorrect = firstTime > lastTime;
    }

    return sorted;
  };

  // Refresh orders when payment status might have changed
  const refreshOrders = async (page = pagination.page) => {
    try {
      const response = await fetch(`/shop/api/orders?page=${page}&limit=${pagination.limit}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Always sort by UTC timestamp to ensure latest orders are first
          const sortedOrders = sortOrdersDesc(data.orders || []);
          setOrders(sortedOrders);

          if (data.pagination) {
            setPagination(prev => ({
              ...prev,
              page: data.pagination.page,
              total: data.pagination.total,
              totalPages: data.pagination.totalPages,
            }));
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing orders:', err);
    }
  };

  const fetchPaymentMethods = async () => {
    setIsFetchingPaymentMethods(true);
    try {
      const response = await fetch('/shop/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        const pm = data.profile?.paymentMethods || { upi: [], card: [] };
        setPaymentMethods(pm);

        // Set default payment method if available
        const defaultPm = data.profile?.defaultPaymentMethod;
        if (defaultPm?.type && defaultPm.details) {
          setOnlinePaymentMethodType(defaultPm.type);
          const methodList = pm[defaultPm.type] || [];
          const defaultMethod = methodList.find(m => m.details === defaultPm.details && m.isDefault) || methodList[0];
          if (defaultMethod) {
            setSelectedPaymentMethod({
              id: defaultMethod.id,
              type: defaultPm.type,
              details: defaultMethod.details,
              razorpayTokenId: defaultMethod.razorpayTokenId,
              cardLast4: defaultMethod.cardLast4,
              cardBrand: defaultMethod.cardBrand,
            });
          }
        } else {
          // Fallback logic
          if (pm.upi.length > 0) {
            setOnlinePaymentMethodType('upi');
          } else if (pm.card.length > 0) {
            setOnlinePaymentMethodType('card');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      toast.error('Failed to load saved payment methods');
    } finally {
      setIsFetchingPaymentMethods(false);
    }
  };

  // When onlinePaymentMethodType changes, select first method of that type or 'new'
  useEffect(() => {
    if (!isPaymentModalOpen) return;

    const methods = paymentMethods[onlinePaymentMethodType] || [];
    if (methods.length > 0) {
      const firstMethod = methods.find(m => m.isDefault) || methods[0];
      setSelectedPaymentMethod({
        id: firstMethod.id,
        type: onlinePaymentMethodType,
        details: firstMethod.details,
        razorpayTokenId: firstMethod.razorpayTokenId,
        cardLast4: firstMethod.cardLast4,
        cardBrand: firstMethod.cardBrand,
      });
    } else {
      // No saved methods, select "new" automatically
      setSelectedPaymentMethod({
        id: 'new',
        type: onlinePaymentMethodType,
        details: '',
        isNew: true,
      });
    }
  }, [onlinePaymentMethodType, paymentMethods, isPaymentModalOpen]);

  const handlePayNow = (order) => {
    setSelectedOrder(order);
    setIsPaymentModalOpen(true);
    fetchPaymentMethods();
  };


  const processPayment = async () => {
    if (!selectedOrder) return;
    const order = selectedOrder;

    setIsPaymentProcessing(true);
    setIsLoading(true);

    try {
      // Step 1: Create Razorpay order
      const amountInPaise = Math.round(order.amount * 100);

      // Get selected payment method ID (only for cards to enable quick pay)
      // If 'new' method is selected, send null so Razorpay doesn't use saved token
      const paymentMethodId = onlinePaymentMethodType === 'card' && selectedPaymentMethod?.id !== 'new' ? selectedPaymentMethod?.id : null;

      const paymentResponse = await fetch('/shop/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          amount: amountInPaise,
          paymentMethodId: paymentMethodId,
        }),
      });

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.message || 'Failed to initialize payment');
      }

      // Step 2: Process payment with Razorpay
      // Wait for Razorpay to load if not already loaded
      if (typeof window === 'undefined' || !window.Razorpay) {
        // Wait a bit for Razorpay script to load
        await new Promise((resolve) => {
          const checkRazorpay = setInterval(() => {
            if (window.Razorpay) {
              clearInterval(checkRazorpay);
              resolve();
            }
          }, 100);
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkRazorpay);
            resolve();
          }, 5000);
        });
      }

      const razorpayOptions = {
        key: paymentData.key,
        amount: paymentData.amount,
        currency: paymentData.currency || 'INR',
        name: paymentData.name || 'SABOLS Delivery',
        description: paymentData.description || `Order #${order.id}`,
        order_id: paymentData.orderId,
        prefill: {
          name: paymentData.prefill?.name,
          contact: paymentData.prefill?.contact,
          email: paymentData.prefill?.email,
        },
        theme: {
          color: '#3b82f6',
        },
        method: {
          upi: onlinePaymentMethodType === 'upi',
          card: onlinePaymentMethodType === 'card',
          netbanking: onlinePaymentMethodType === 'netbanking',
          wallet: false,
          emi: false,
          paylater: false,
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
            setIsPaymentProcessing(false);
          }
        },
        handler: async (response) => {
          setIsPaymentModalOpen(false); // Close the modal on success
          setIsPaymentSuccess(true);

          try {
            // Verify payment signature on server
            const verifyResponse = await fetch('/shop/api/payments/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderId: order.id,
                paymentMethodId: selectedPaymentMethod?.id === 'new' ? null : selectedPaymentMethod?.id,
              }),
            });

            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyData.success) {
              setIsPaymentSuccess(false);
              throw new Error(verifyData.message || 'Payment verification failed');
            }

            toast.success('Payment successful!');

            // Refresh orders
            refreshOrders();

          } catch (verifyErr) {
            console.error('Payment verification error:', verifyErr);
            setIsPaymentSuccess(false);
            toast.error('Payment verification failed. Please contact support.');
          } finally {
            setIsLoading(false);
            setIsPaymentProcessing(false);
            setTimeout(() => setIsPaymentSuccess(false), 3000);
          }
        }
      };

      const razorpay = new window.Razorpay(razorpayOptions);
      razorpay.open();

    } catch (err) {
      console.error('Error initiating payment:', err);
      toast.error(err.message || 'Failed to initiate payment');
      setIsLoading(false);
      setIsPaymentProcessing(false);
    }
  };

  useEffect(() => {
    // Check for success message from order placement or Razorpay redirect
    const orderSuccess = sessionStorage.getItem('orderSuccess');
    const urlParams = new URLSearchParams(window.location.search);
    const paymentSuccess = urlParams.get('payment');
    const orderId = urlParams.get('orderId');
    const paymentFailed = urlParams.get('payment') === 'failed';

    if (orderSuccess === 'true') {
      toast.success('Order placed successfully!');
      sessionStorage.removeItem('orderSuccess');
    } else if (paymentFailed) {
      // Payment failed from Razorpay redirect
      toast.error('Payment failed. Please try again.');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentSuccess === 'success' && orderId) {
      // Payment successful from Razorpay redirect
      toast.success('Order placed successfully!');

      // Clear server-side cart after successful payment
      const clearCart = async () => {
        try {
          const token = typeof window !== 'undefined' ? localStorage.getItem('isLoggedIn') : null;
          if (token) {
            // Fetch current cart to clear all items
            const cartRes = await fetch('/shop/api/cart');

            if (cartRes.ok) {
              const cartData = await cartRes.json();
              if (cartData.success && cartData.items) {
                // Clear each item from server cart
                for (const item of cartData.items) {
                  try {
                    await fetch('/shop/api/cart', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        productId: item.id,
                        quantity: 0,
                      }),
                    });
                  } catch (err) {
                    console.error('Error clearing cart item:', err);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('Error clearing server cart:', err);
        }
      };

      clearCart();

      // Clear local cart
      try {
        localStorage.removeItem('cart');
        window.dispatchEvent(new Event('cartUpdated'));
      } catch (err) {
        console.error('Error clearing local cart:', err);
      }

      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);

      // Poll for updated payment status (webhook might be delayed)
      if (orderId) {
        pollOrderStatus(orderId);
        // Also refresh orders list after a delay
        setTimeout(() => {
          refreshOrders(1); // Reset to page 1 on new order
        }, 3000);
      }
    }
  }, [toast]);

  const pollOrderStatus = async (orderId, attempts = 0) => {
    // Poll up to 5 times with 2 second intervals
    if (attempts >= 5) return;

    try {
      const response = await fetch(`/shop/api/orders/${orderId}`, {
        headers: {},
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.order) {
          // Update the order in the list if payment status changed
          setOrders(prevOrders => {
            const updated = prevOrders.map(order =>
              order.id === orderId ? { ...order, paymentStatus: data.order.paymentStatus } : order
            );
            // Always sort after update
            return sortOrdersDesc(updated);
          });

          // If payment status changed to SUCCESS, refresh all orders
          if (data.order.paymentStatus === 'SUCCESS') {
            refreshOrders();
          }

          // If payment is still pending, poll again
          if (data.order.paymentStatus === 'PENDING' && attempts < 4) {
            setTimeout(() => pollOrderStatus(orderId, attempts + 1), 2000);
          }
        }
      }
    } catch (err) {
      console.error('Error polling order status:', err);
    }
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await fetch(`/shop/api/orders?page=${pagination.page}&limit=${pagination.limit}`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/app/login');
            return;
          }
          throw new Error('Failed to fetch orders');
        }

        const data = await response.json();
        if (data.success) {

          // Always sort by UTC timestamp to ensure latest orders are first
          const sortedOrders = sortOrdersDesc(data.orders);
          // Data sorted

          setOrders(sortedOrders);

          if (data.pagination) {
            setPagination(prev => ({
              ...prev,
              page: data.pagination.page,
              total: data.pagination.total,
              totalPages: data.pagination.totalPages,
            }));
          }
        } else {
          setError(data.message || 'Failed to fetch orders');
        }
      } catch (err) {
        console.error('Error fetching orders:', err);
        setError('Failed to load orders. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [router, pagination.page]); // Re-fetch when page changes

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'DELIVERED':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'OUT_FOR_DELIVERY':
        return <Truck className="h-4 w-4 text-blue-600" />;
      case 'CONFIRMED':
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'NOT_DELIVERED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'DELIVERED':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'OUT_FOR_DELIVERY':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'CONFIRMED':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'CANCELLED':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'NOT_DELIVERED':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
  };

  const formatDeliverySlot = (slot) => {
    return slot
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatPaymentStatus = (order) => {
    const status = order.paymentStatus;
    const method = order.paymentMethod;

    if (method === 'ONLINE' && status === 'SUCCESS') {
      return 'Online - Paid';
    }

    switch (status) {
      case 'SUCCESS':
        return 'Paid';
      case 'PENDING':
        return 'Pending';
      case 'FAILED':
        return 'Failed';
      case 'COD':
        return 'COD';
      default:
        return status;
    }
  };

  const canCancel = (status) => {
    return ['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'].includes(status);
  };

  // Always ensure orders are sorted before rendering (by UTC timestamp)
  const sortedOrders = useMemo(() => {
    const sorted = sortOrdersDesc(orders);
    return sorted;
  }, [orders]);

  const handleCancel = async (orderId) => {
    const confirmed = window.confirm('Cancel this order?');
    if (!confirmed) return;

    try {
      setCancelLoadingId(orderId);
      const response = await fetch(`/shop/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {},
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to cancel order');
      }

      setOrders((prev) => {
        const updated = prev.map((order) =>
          order.id === orderId ? { ...order, status: 'CANCELLED' } : order
        );
        // Always sort after update
        return sortOrdersDesc(updated);
      });
      toast.success('Order cancelled');
    } catch (err) {
      console.error('Error cancelling order:', err);
      toast.error(err.message || 'Could not cancel order');
    } finally {
      setCancelLoadingId(null);
    }
  };
  const toggleOrderItems = async (orderId) => {
    if (expandedOrders.has(orderId)) {
      const newExpanded = new Set(expandedOrders);
      newExpanded.delete(orderId);
      setExpandedOrders(newExpanded);
      return;
    }

    // Expand
    const newExpanded = new Set(expandedOrders);
    newExpanded.add(orderId);
    setExpandedOrders(newExpanded);

    // Fetch items if not already loaded
    if (!orderItemsMap[orderId]) {
      try {
        setLoadingItemsId(orderId);
        const response = await fetch(`/shop/api/orders/${orderId}`, {
          headers: {},
        });
        const data = await response.json();
        if (data.success && data.order && data.order.items) {
          setOrderItemsMap(prev => ({
            ...prev,
            [orderId]: data.order.items
          }));
        }
      } catch (err) {
        console.error('Error fetching order items:', err);
        toast.error('Failed to load items');
      } finally {
        setLoadingItemsId(null);
      }
    }
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="h-full">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="w-full sm:w-32 h-10 sm:h-11" />
          </div>

          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-row flex-wrap items-start justify-between gap-x-2 gap-y-3">
                    <div className="space-y-1">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                  <div className="p-3 sm:pt-4 border-t flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Payment Success Overlay */}
      {isPaymentSuccess && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg shadow-lg border">
            <div className="h-20 w-20 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
            <p className="text-xl font-bold text-foreground">Payment Successful!</p>
            <p className="text-sm text-muted-foreground">Updating order status...</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">My Orders</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              View your order history and track deliveries
            </p>
          </div>
          <Button onClick={() => router.push('/app/items')} className="w-full sm:w-auto h-10 sm:h-11" size="lg">
            <Package className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>



        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {sortedOrders.length === 0 && !error && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start ordering water cans to see them here
                </p>
                <Button onClick={() => router.push('/app/order')}>
                  Place Your First Order
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={`space-y-3 sm:space-y-4 transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {sortedOrders.map((order, index) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-row flex-wrap items-start justify-between gap-x-2 gap-y-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                      <span>Order #{order.orderNumber || order.id.slice(-8).toUpperCase()}</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Placed on{" "}
                      {order.createdAtIST
                        ? order.createdAtIST
                        : `${formatDate(order.createdAt)} at ${formatTime(order.createdAt)}`}
                    </CardDescription>
                  </div>
                  <div
                    className={`self-start px-2 sm:px-3 py-1 rounded-full border text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 flex-shrink-0 ${getStatusColor(
                      order.status
                    )} ${
                      // Override color for Pay Now eligibility if needed, or keep status color
                      ''
                      }`}
                  >
                    {getStatusIcon(order.status)}
                    <span className="hidden sm:inline">
                      {/* Logic: 
                            1. If PENDING (and Paid/COD) and NOT assigned -> "Order Placed"
                            2. If Assigned AND Route NOT Generated -> "Confirmed"
                            3. If Assigned AND Route Generated -> "Delivery in Progress"
                            4. Else fallback
                        */}
                      {(order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'NOT_DELIVERED')
                        ? order.status.replace(/_/g, ' ')
                        : (order.status === 'PENDING' && (order.paymentStatus === 'SUCCESS' || order.paymentStatus === 'COD') && !order.isAssigned)
                          ? 'Order Placed'
                          : (order.isAssigned && !order.isRouteGenerated)
                            ? 'Confirmed'
                            : (order.isRouteGenerated || order.status === 'CONFIRMED' || order.status === 'OUT_FOR_DELIVERY')
                              ? 'Delivery in Progress'
                              : order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="sm:hidden">
                      {(order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'NOT_DELIVERED')
                        ? (order.status === 'NOT_DELIVERED' ? 'Not Delivered' : order.status.replace(/_/g, ' '))
                        : (order.status === 'PENDING' && (order.paymentStatus === 'SUCCESS' || order.paymentStatus === 'COD') && !order.isAssigned)
                          ? 'Order Placed'
                          : (order.isAssigned && !order.isRouteGenerated)
                            ? 'Confirmed'
                            : (order.isRouteGenerated || order.status === 'CONFIRMED' || order.status === 'OUT_FOR_DELIVERY')
                              ? 'Delivery in Progress'
                              : order.status.split('_')[0]}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between group cursor-pointer" onClick={() => toggleOrderItems(order.id)}>
                            <p className="text-xs sm:text-sm font-medium">{order.productName || 'Water Can'}</p>
                            {expandedOrders.has(order.id) ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {order.originalQuantity && order.additionalQuantity
                              ? `${order.originalQuantity} + ${order.additionalQuantity} items`
                              : `${order.quantity} item${order.quantity !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>

                      {expandedOrders.has(order.id) && (
                        <div className="ml-6 pl-2 border-l-2 border-muted space-y-2 py-1">
                          {loadingItemsId === order.id ? (
                            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Loading items...</span>
                            </div>
                          ) : orderItemsMap[order.id] ? (
                            <>
                              <div className="space-y-1">
                                {orderItemsMap[order.id].map((item, idx) => {
                                  // Calculate item totals
                                  const itemPrice = item.price || 0;
                                  const itemTotal = itemPrice * item.quantity; // Base total (without GST)

                                  return (
                                    <div key={item.id || idx} className="flex items-center justify-between text-xs py-1">
                                      <span className="text-foreground font-medium">
                                        {item.quantity} * {item.productName}
                                      </span>
                                      <span className="text-foreground">
                                        ₹{itemTotal.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Order Summary in Expanded View */}
                              <div className="pt-2 mt-2 border-t border-dashed space-y-1.5 text-xs">
                                {(() => {
                                  const items = orderItemsMap[order.id];
                                  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                  const totalGst = items.reduce((sum, item) => sum + ((item.price * item.quantity) * ((item.gst || 5.0) / 100)), 0);

                                  return (
                                    <>
                                      <div className="flex justify-between text-muted-foreground">
                                        <span>Subtotal</span>
                                        <span>₹{subtotal.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between text-muted-foreground">
                                        <span>Total Tax (GST)</span>
                                        <span>₹{totalGst.toFixed(2)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-muted-foreground italic">No item details available</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      {order.status === 'DELIVERED' ? (
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      ) : (
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium">
                          {order.status === 'DELIVERED' ? 'Delivered Date & Time' : 'Delivery Date'}
                        </p>
                        {order.status === 'DELIVERED' ? (
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {order.updatedAtIST ? (
                              <>
                                <span>{order.updatedAtIST}</span>
                              </>
                            ) : order.updatedAt ? (
                              <>
                                <span>{formatDate(order.updatedAt)}</span>
                                <span className="block">{formatTime(order.updatedAt)}</span>
                              </>
                            ) : (
                              'N/A'
                            )}
                          </div>
                        ) : (
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            <span>{formatDate(order.deliveryDate)}</span>
                            <span className="block text-xs opacity-75">(Expected)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium">Delivery Address</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {order.address.line1}
                          {order.address.line2 && `, ${order.address.line2}`}
                          <br />
                          {order.address.city} - {order.address.pincode}{order.address.area ? `, ${order.address.area}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium">Payment</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {formatPaymentStatus(order)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-3 sm:pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <p className="text-xs sm:text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-base sm:text-lg font-semibold">₹{Math.round(Number(order.amount))}</p>
                      {order.paidAmount < order.amount && order.paidAmount > 0 && (
                        <p className="text-[10px] sm:text-xs text-green-600 font-medium">
                          Paid: ₹{Math.round(Number(order.paidAmount))}
                        </p>
                      )}
                    </div>

                    {(order.paymentStatus === 'COD' || order.paymentStatus === 'PENDING') &&
                      order.status !== 'DELIVERED' &&
                      order.status !== 'CANCELLED' &&
                      order.status !== 'NOT_DELIVERED' && (
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white shadow-md"
                          onClick={() => handlePayNow(order)}
                          disabled={isPaymentProcessing}
                        >
                          {isPaymentProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing
                            </>
                          ) : (
                            'Pay Now'
                          )}
                        </Button>
                      )}

                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-6 pb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Selection Modal */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Options</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={onlinePaymentMethodType === 'upi' ? 'default' : 'outline'}
                className="flex flex-col items-center justify-center h-20 gap-2"
                onClick={() => setOnlinePaymentMethodType('upi')}
              >
                <Smartphone className="h-6 w-6" />
                UPI
              </Button>
              <Button
                variant={onlinePaymentMethodType === 'card' ? 'default' : 'outline'}
                className="flex flex-col items-center justify-center h-20 gap-2"
                onClick={() => setOnlinePaymentMethodType('card')}
              >
                <CreditCard className="h-6 w-6" />
                Card
              </Button>
              <Button
                variant={onlinePaymentMethodType === 'netbanking' ? 'default' : 'outline'}
                className="flex flex-col items-center justify-center h-20 gap-2"
                onClick={() => setOnlinePaymentMethodType('netbanking')}
              >
                <Landmark className="h-6 w-6" />
                Net Banking
              </Button>
            </div>

            {paymentMethods[onlinePaymentMethodType]?.length > 0 && (
              <div className="pt-2">
                <PaymentMethodDropdown
                  paymentMethods={paymentMethods}
                  selectedType={onlinePaymentMethodType}
                  selectedId={selectedPaymentMethod?.id}
                  onSelect={setSelectedPaymentMethod}
                  errors={{}}
                />
              </div>
            )}

            <Button
              className="w-full mt-4"
              size="lg"
              onClick={processPayment}
              disabled={isLoading || isPaymentProcessing}
            >
              {isLoading || isPaymentProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Pay ₹{Math.round(selectedOrder?.amount || 0)}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
