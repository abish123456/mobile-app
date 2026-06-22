'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import QuantitySelector from '../../../components/app/QuantitySelector';
// import ReturnSelector from '../../../components/app/ReturnSelector';
import { Trash2, ShoppingCart, Package, Loader2, AlertCircle, XCircle, Wallet, Info, CheckCircle2, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cart');
        return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
    }
    return [];
  });
  const [customer, setCustomer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [showReturnSelector, setShowReturnSelector] = useState({});
  const [pendingReturns, setPendingReturns] = useState(0);

  // Load cart from server on mount
  useEffect(() => {
    const loadCart = async () => {
      setIsFetching(true);
      try {
        const res = await fetch('/shop/api/cart', {
          headers: {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setCart(data.items || []);
            localStorage.setItem('cart', JSON.stringify(data.items || []));
          }
        } else if (res.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        }

        // Load customer data for wallet/cans
        const custRes = await fetch('/shop/api/user/profile', {
          headers: {},
        });
        if (custRes.ok) {
          const custData = await custRes.json();
          if (custData.success || custData.profile) {
            setCustomer(custData.profile || custData.customer);
          }
        } else if (custRes.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        }

        // Fetch pending return requests
        const returnsRes = await fetch('/shop/api/user/return-request', {
          headers: {},
        });
        if (returnsRes.ok) {
          const returnsData = await returnsRes.json();
          if (returnsData.requests) {
            const pendingParams = returnsData.requests
              .filter(req => req.status === 'REQUESTED')
              .reduce((sum, req) => sum + req.quantity, 0);
            setPendingReturns(pendingParams);
          }
        }
      } catch (err) {
        console.error('Error loading cart from server:', err);
      } finally {
        setIsFetching(false);
      }
    };

    loadCart();

    // Listen for cart updates
    const handleStorageChange = () => {
      try {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
          setCart(JSON.parse(savedCart));
        } else {
          setCart([]);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('cartUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cartUpdated', handleStorageChange);
    };
  }, []);

  // Check auth handled by layout now
  // useEffect(() => {
  //   const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  //   if (!token) {
  //     router.push('/app/login');
  //   }
  // }, [router]);

  const timeoutRefs = useRef({});
  const pendingUpdatesRef = useRef({});

  // Flush pending updates immediately
  const flushPendingUpdates = async () => {
    const updatePromises = Object.keys(pendingUpdatesRef.current).map(async (itemId) => {
      const payload = pendingUpdatesRef.current[itemId];
      if (!payload) return;

      // Clear any pending timeout for this item
      if (timeoutRefs.current[itemId]) {
        clearTimeout(timeoutRefs.current[itemId]);
        delete timeoutRefs.current[itemId];
      }

      // Perform the update
      try {
        await fetch('/shop/api/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        // Remove from pending keys upon success
        delete pendingUpdatesRef.current[itemId];
      } catch (err) {
        console.error(`Final flush failed for item ${itemId}`, err);
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      window.dispatchEvent(new Event('cartUpdated'));
    }
  };

  const updateQuantity = async (itemId, qtyOrUpdater, returnQty = null) => {
    setCart(prevCart => {
      // Resolve new quantity first
      const currentItem = prevCart.find(i => i.id === itemId);
      if (!currentItem) return prevCart;

      const currentQty = currentItem.quantity;
      const newQuantity = typeof qtyOrUpdater === 'function'
        ? qtyOrUpdater(currentQty)
        : qtyOrUpdater;

      // Handle removal if quantity becomes 0 or less
      if (newQuantity <= 0 && returnQty === null) {
        const newCart = prevCart.filter((item) => item.id !== itemId);
        localStorage.setItem('cart', JSON.stringify(newCart));

        const payload = { productId: itemId, quantity: 0 };
        pendingUpdatesRef.current[itemId] = payload;

        if (timeoutRefs.current[itemId]) clearTimeout(timeoutRefs.current[itemId]);

        fetch('/shop/api/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(() => {
          delete pendingUpdatesRef.current[itemId];
          window.dispatchEvent(new Event('cartUpdated'));
        })
          .catch(err => console.error('Error removing cart item on server:', err));

        return newCart;
      }

      // Logic for deposit and return calculations
      const customerForCalc = customer || {};
      const currentCansInHand = customerForCalc.cansInHand || 0;
      const pendingReturned = customerForCalc.pendingReturned || 0;
      const totalExplicitPendingReturns = pendingReturns || 0;
      const availableForSwapTotal = Math.max(0, currentCansInHand - pendingReturned - totalExplicitPendingReturns);

      let availableForSwap = availableForSwapTotal;

      const newCart = prevCart.map((item) => {
        if (item.id === itemId) {
          let itemReturnQty = 0;
          if ((item.depositAmount || 0) > 0) {
            itemReturnQty = Math.min(newQuantity, availableForSwap);
            availableForSwap -= itemReturnQty;
          }
          return { ...item, quantity: newQuantity, returnQuantity: itemReturnQty };
        } else {
          if ((item.depositAmount || 0) > 0) {
            const itemReturnQty = Math.min(item.quantity, availableForSwap);
            availableForSwap -= itemReturnQty;
            return { ...item, returnQuantity: itemReturnQty };
          }
          return item;
        }
      });

      localStorage.setItem('cart', JSON.stringify(newCart));

      // Debounced Server Sync
      const targetItem = newCart.find(i => i.id === itemId);
      const payload = {
        productId: itemId,
        quantity: newQuantity,
        returnQuantity: targetItem?.returnQuantity || 0
      };

      // Store payload so we can flush it later if needed
      pendingUpdatesRef.current[itemId] = payload;

      if (timeoutRefs.current[itemId]) {
        clearTimeout(timeoutRefs.current[itemId]);
      }

      timeoutRefs.current[itemId] = setTimeout(() => {
        fetch('/shop/api/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }).then(() => {
          delete pendingUpdatesRef.current[itemId];
          window.dispatchEvent(new Event('cartUpdated'));
        }).catch(err => {
          console.error('Error updating cart on server:', err);
        });
      }, 500);

      return newCart;
    });
  };

  const removeFromCart = async (itemId) => {
    setCart(prevCart => {
      const newCart = prevCart.filter((item) => item.id !== itemId);
      localStorage.setItem('cart', JSON.stringify(newCart));

      const payload = { productId: itemId, quantity: 0 };
      pendingUpdatesRef.current[itemId] = payload;

      if (timeoutRefs.current[itemId]) {
        clearTimeout(timeoutRefs.current[itemId]);
      }

      fetch('/shop/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(() => {
        delete pendingUpdatesRef.current[itemId];
        window.dispatchEvent(new Event('cartUpdated'));
      }).catch(err => {
        console.error('Error removing cart item on server:', err);
      });

      return newCart;
    });
  };

  const calculateSubtotal = () => {
    // Only calculate subtotal from available products
    return cart
      .filter((item) => item.isAvailable !== false)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const calculateGST = () => {
    // Calculate total GST based on each product's specific percentage
    return cart
      .filter((item) => item.isAvailable !== false)
      .reduce((sum, item) => {
        const itemSubtotal = item.price * item.quantity;
        const itemGstRate = item.gst ?? 5.0;
        return sum + (itemSubtotal * (itemGstRate / 100));
      }, 0);
  };

  const calculateTotal = (subtotal, gst, deposit) => {
    return subtotal + gst + deposit;
  };

  const calculateDeposit = () => {
    // Filter only items that have deposit amount (depositAmount > 0)
    const depositItems = cart.filter((item) => item.isAvailable !== false && (item.depositAmount || 0) > 0);

    // If no items have deposit, return zero
    if (depositItems.length === 0) {
      return { toPay: 0, walletUsed: 0, walletCredit: 0, totalRequired: 0, cansRequiringDeposit: 0, depositRate: 0 };
    }

    // Target Balance Deposit Model:
    // We calculate the total empty cans the customer will have after ALL pending orders 
    // and the CURRENT cart are processed.
    const currentCansInHand = customer?.cansInHand || 0;
    const pendingOrdered = customer?.pendingOrdered || 0;
    const pendingReturned = customer?.pendingReturned || 0;
    const walletBalance = customer?.depositWalletBalance || 0;
    const pendingDeposit = customer?.pendingDeposit || 0;

    const totalOrderedInCart = depositItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalReturnedInCart = depositItems.reduce((sum, item) => sum + (item.returnQuantity || 0), 0);

    // Total returned considering pending explicit return requests as well
    const totalExplicitPendingReturns = pendingReturns || 0;

    // Predicted future state:
    const futureCansInHand = currentCansInHand + (pendingOrdered - pendingReturned) + (totalOrderedInCart - (totalReturnedInCart + totalExplicitPendingReturns));

    // Get deposit rate (assuming uniform)
    const depositRate = depositItems[0]?.depositAmount || 0;

    // Required wallet balance for that many cans
    const requiredDepositBalance = Math.max(0, futureCansInHand * depositRate);

    // Deficit in wallet is what needs to be paid
    // Account for both existing wallet balance AND deposits already committed in other active orders
    const toPay = Math.max(0, requiredDepositBalance - walletBalance - pendingDeposit);

    if (toPay > 0) {
      return {
        toPay,
        walletUsed: 0,
        walletCredit: 0,
        totalRequired: toPay,
        cansRequiringDeposit: Math.ceil(toPay / depositRate),
        depositRate,
      };
    }

    // If there is a surplus, show potential wallet credit
    if (requiredDepositBalance < walletBalance) {
      const surplus = walletBalance - requiredDepositBalance;
      return {
        toPay: 0,
        walletUsed: 0,
        walletCredit: surplus,
        totalRequired: -surplus,
        cansRequiringDeposit: 0,
        depositRate,
      };
    }

    // Perfect balance
    return { toPay: 0, walletUsed: 0, walletCredit: 0, totalRequired: 0, cansRequiringDeposit: 0, depositRate };
  };

  const getTotalQuantity = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getAvailableItems = () => {
    return cart.filter((item) => item.isAvailable !== false);
  };

  const hasDepositProducts = () => {
    return cart.some((item) => item.isAvailable !== false && (item.depositAmount || 0) > 0);
  };

  const getUnavailableItems = () => {
    return cart.filter((item) => item.isAvailable === false);
  };

  const handleProceedToCheckout = async () => {
    const availableItems = getAvailableItems();
    if (availableItems.length === 0) {
      return;
    }

    // Don't allow checkout if there are unavailable items
    const unavailableItems = getUnavailableItems();
    if (unavailableItems.length > 0) {
      return;
    }

    // Check if any item has quantity > 100
    const hasHighQuantity = availableItems.some((item) => item.quantity > 100);
    if (hasHighQuantity) {
      toast.error('Quantity cannot exceed 100 per item');
      return;
    }

    // Wait for any pending backend updates to finish
    setIsLoading(true);
    await flushPendingUpdates();

    // Navigate to order/checkout page with cart data
    router.push('/app/order');
  };

  // Show loading state while fetching cart
  if (isFetching) {
    return (
      <div className="h-full">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="pb-2">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-4">
              {[1, 2].map(i => (
                <Card key={i} className="border">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-6 w-1/2" />
                        <div className="flex justify-between">
                          <Skeleton className="h-8 w-24" />
                          <Skeleton className="h-6 w-24" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-4 sm:top-20 border-primary/20">
                <CardHeader className="p-4 sm:p-6">
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show empty cart only after we've confirmed it's actually empty
  if (cart.length === 0) {
    return (
      <div className="h-full">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="rounded-xl">
            <h1 className="text-2xl sm:text-3xl font-bold text-black">Shopping Cart</h1>
            <p className="text-black mt-2 text-sm sm:text-base">Your cart is empty</p>
          </div>

          <Card className="hover-lift">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 p-4 mb-4">
                  <ShoppingCart className="h-16 w-16 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Your cart is empty</h3>
                <p className="text-muted-foreground mb-4">
                  Add items to your cart to continue
                </p>
                <Button onClick={() => router.push('/app/items')} size="lg">
                  Browse Items
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const subtotal = calculateSubtotal();
  const gst = calculateGST();
  const depositInfo = calculateDeposit();
  const total = calculateTotal(subtotal, gst, depositInfo.toPay);
  const totalQuantity = getTotalQuantity();

  return (
    <div className="h-full">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Cart Summary Header */}
        <div className="rounded-xl pb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Cart Summary</h1>
          <p className="text-black mt-1 text-sm sm:text-base">
            {totalQuantity} Item{totalQuantity !== 1 ? 's' : ''} in this cart
          </p>
        </div>

        {getUnavailableItems().length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Some products are no longer available.</strong> Please remove them from your cart before proceeding to checkout.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item) => {
              const isUnavailable = item.isAvailable === false;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "hover:shadow-md transition-shadow border",
                    isUnavailable && "bg-destructive/5 border-destructive/30"
                  )}
                >
                  <CardContent className="p-4 sm:p-6">
                    {/* Product Row */}
                    <div className="flex items-start gap-4">
                      {/* Product Image */}
                      <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden">
                        {item.image &&
                          typeof item.image === 'string' &&
                          item.image.trim() !== '' &&
                          item.image !== 'null' &&
                          item.image !== 'undefined' &&
                          (item.image.startsWith('/') || item.image.startsWith('http://') || item.image.startsWith('https://')) ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            className="object-contain p-1.5"
                            sizes="(max-width: 640px) 64px, 80px"
                          />
                        ) : (
                          <div className="text-3xl flex items-center justify-center h-full">
                            💧
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        {/* Product Name - Full width on mobile */}
                        <div className="mb-3">
                          <h3 className="text-base sm:text-lg font-semibold text-black">
                            {item.name}
                          </h3>
                        </div>

                        {/* Quantity Selector and Actions - Below name on mobile, right side on desktop */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex items-center gap-2 rounded-lg border-2 px-2 py-1",
                              item.hasPendingDeposit ? "border-gray-200 bg-gray-50" : "border-blue-300 bg-blue-50"
                            )}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => updateQuantity(item.id, q => Math.max(1, q - 1))}
                                disabled={isUnavailable || item.quantity <= 1 || item.hasPendingDeposit}
                                className={cn("h-8 w-8", item.hasPendingDeposit ? "text-gray-400" : "text-blue-500 hover:bg-blue-100")}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                  if (val !== '' && !isNaN(val)) {
                                    updateQuantity(item.id, Math.max(1, Math.min(100, val)));
                                  }
                                }}
                                onBlur={(e) => {
                                  if (e.target.value === '' || isNaN(parseInt(e.target.value))) {
                                    updateQuantity(item.id, 1);
                                  }
                                }}
                                className={cn(
                                  "w-12 h-8 text-center bg-transparent border-none focus:outline-none focus:ring-0 font-bold p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                  item.hasPendingDeposit ? "text-gray-500" : "text-blue-700"
                                )}
                                disabled={isUnavailable || item.hasPendingDeposit}
                                min="1"
                                max="100"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => updateQuantity(item.id, q => q + 1)}
                                disabled={isUnavailable || item.quantity >= 100 || item.hasPendingDeposit}
                                className={cn("h-8 w-8", item.hasPendingDeposit ? "text-gray-400" : "text-blue-700 hover:bg-blue-100")}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFromCart(item.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={item.hasPendingDeposit}
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>

                          {/* Price - Below controls on mobile, right side on desktop */}
                          <div className="sm:ml-auto">
                            <p className="text-lg sm:text-xl font-bold text-black">
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {item.hasPendingDeposit && (
                          <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Waiting for deposit approval
                          </div>
                        )}

                        {/* Empty Jar Return Section - Automated */}
                        {item.depositAmount > 0 && (
                          <div className="mt-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                {/* <p className="font-bold text-sm sm:text-base text-gray-900 mb-1">
                                  Empty {item.unit} Return
                                </p> */}
                                {item.returnQuantity > 0 ? (
                                  <p className="text-xs sm:text-sm text-green-700 flex items-center gap-1">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {item.returnQuantity} empty {item.unit}{item.returnQuantity > 1 ? 's' : ''} will be collected from you.
                                  </p>
                                ) : (
                                  <p className="text-xs sm:text-sm text-gray-700">
                                    No empty {item.unit}s available to return from your stock.
                                  </p>
                                )}
                              </div>
                            </div>
                            {depositInfo.toPay > 0 && item.returnQuantity < item.quantity && (
                              <div className="mt-3 pt-3 border-t border-cyan-200">
                                <p className="text-xs sm:text-sm text-amber-600 font-medium">
                                  Note: ₹{item.depositAmount.toFixed(2)} per new can applicable for {item.quantity - item.returnQuantity} {item.unit}{item.quantity - item.returnQuantity > 1 ? 's' : ''}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {isUnavailable && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            This product was removed. Please remove it from your cart.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4 sm:top-20 border-primary/20 shadow-colorful">
              <CardHeader className="p-4 sm:p-6 rounded-t-xl">
                <CardTitle className="text-base sm:text-lg font-bold">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground truncate pr-2">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-medium flex-shrink-0 text-black">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {getUnavailableItems().length > 0 && (
                    <div className="pt-2 border-t space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Unavailable items (excluded):</p>
                      {getUnavailableItems().map((item) => (
                        <div key={item.id} className="flex justify-between text-xs text-muted-foreground line-through">
                          <span className="truncate pr-2">
                            {item.name} × {item.quantity}
                          </span>
                          <span className="flex-shrink-0 text-black">₹{((item.price || 0) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-primary/20 pt-3 sm:pt-4 space-y-2">
                  <div className="flex justify-between text-sm sm:text-base">
                    <span className="font-medium">Subtotal</span>
                    <span className="font-semibold text-black">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm sm:text-base">
                    <span className="font-medium">GST</span>
                    <span className="font-semibold text-black">₹{gst.toFixed(2)}</span>
                  </div>

                  {pendingReturns > 0 && (
                    <div className="flex justify-between text-sm text-blue-600">
                      <span className="font-medium">Pending Returns Applied</span>
                      <span className="font-semibold">{pendingReturns} Cans</span>
                    </div>
                  )}

                  {(depositInfo.toPay > 0 || depositInfo.walletCredit > 0) ? (
                    <div className="pt-2 border-t border-dashed space-y-2">
                      {depositInfo.toPay > 0 && (
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-black">
                            New Can Charges
                            {depositInfo.cansRequiringDeposit > 0 && depositInfo.depositRate > 0 && (
                              <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                                ({depositInfo.cansRequiringDeposit} × ₹{depositInfo.depositRate.toFixed(2)})
                              </span>
                            )}
                          </span>
                          <span className="text-black">₹{depositInfo.toPay.toFixed(2)}</span>
                        </div>
                      )}

                      {depositInfo.walletCredit > 0 && (
                        <div className="flex flex-col gap-1 p-2 bg-blue-50 rounded-md border border-blue-100">
                          <div className="flex justify-between text-xs text-blue-700 font-bold">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Deposit Surplus Available
                            </span>
                            <span>₹{depositInfo.walletCredit.toFixed(2)}</span>
                          </div>
                          <p className="text-[10px] text-blue-600">You have a surplus from extra returns. No deposit needed for this order.</p>
                        </div>
                      )}
                    </div>
                  ) : hasDepositProducts() && (
                    <div className="pt-2 border-t border-dashed">
                      <p className="text-[10px] text-blue-600 italic flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-blue-500" />
                        20L Can balance adjusted for this order
                      </p>
                    </div>
                  )}
                  <div className="flex justify-between text-base sm:text-lg font-bold  border-t pt-3">
                    <span>Total</span>
                    <span className="text-black">₹{Math.round(total)}</span>
                  </div>
                </div>
                {getUnavailableItems().length > 0 && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Remove unavailable items to proceed
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleProceedToCheckout}
                  className="w-full h-11 sm:h-12"
                  size="lg"
                  disabled={isLoading || getAvailableItems().length === 0 || getUnavailableItems().length > 0}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating Cart...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4 mr-2" />
                      Proceed to Checkout
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}