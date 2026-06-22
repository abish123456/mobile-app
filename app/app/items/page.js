'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { Plus, Droplet, Loader2, Trash2 } from 'lucide-react';
import Image from 'next/image';

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [pendingReturns, setPendingReturns] = useState(0);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/shop/api/products', {
        headers: {},
      });
      const data = await response.json();
      if (data.success) {
        setItems(data.products || []);
      }
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check auth and load cart
  useEffect(() => {
    const init = async () => {
      // Load initial cart from server
      try {
        const res = await fetch('/shop/api/cart', {
          headers: {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setCart(data.items || []);
          }
        } else if (res.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        }

        // Fetch profile for cans info
        const profileRes = await fetch('/shop/api/user/profile', {
          headers: {},
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.profile) {
            setCustomer(profileData.profile);
          }
        } else if (profileRes.status === 401) {
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
        console.error('Error in init:', err);
      }
    };

    fetchItems();
    init();

    // Listen for cart updates from other tabs
    const handleStorageChange = () => {
      try {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
          setCart(JSON.parse(savedCart));
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
  }, [router]);

  const getItemQuantity = (itemId) => {
    const cartItem = cart.find((item) => item.id === itemId);
    return cartItem ? cartItem.quantity : 0;
  };

  const timeoutRefs = useRef({});
  const pendingUpdates = useRef({}); // Store latest state for flush on unmount

  // Flush pending updates on unmount
  useEffect(() => {
    return () => {
      Object.keys(pendingUpdates.current).forEach(itemId => {
        const update = pendingUpdates.current[itemId];
        if (update) {
          // Fire and forget - reliable enough for beacon-like behavior
          fetch('/shop/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
            keepalive: true, // Important: allows request to outlive page
          }).catch(e => console.error('Flush error', e));
        }
      });
    };
  }, []);

  const addToCart = async (item, { redirectToCart = false } = {}) => {
    // Automation: Calculate return quantities based on available cans
    const currentCansInHand = customer?.cansInHand || 0;
    const pendingReturned = customer?.pendingReturned || 0;
    const totalExplicitPendingReturns = pendingReturns || 0;
    const availableForSwapTotal = Math.max(0, currentCansInHand - pendingReturned - totalExplicitPendingReturns);

    setCart(prevCart => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      // If only one item in catalog, set to 1 and let user adjust in cart; otherwise increment
      const newQuantity = items.length === 1
        ? (existingItem ? existingItem.quantity : 1) // If existing, keep it (user manages in cart), else 1
        // Actually, if it's existing, clicking 'Add' again (if visible) should probably essentially do nothing or redirect?
        // But assuming we want to enable 'Add', let's stick to original logic: existingItem.quantity
        : (existingItem ? existingItem.quantity + 1 : 1);

      let newCart;
      if (existingItem) {
        newCart = prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: newQuantity }
            : cartItem
        );
      } else {
        newCart = [...prevCart, { ...item, quantity: newQuantity }];
      }

      let availableForSwap = availableForSwapTotal;
      // Apply automation to all items in the new cart
      const automatedCart = newCart.map((cartItem) => {
        if ((cartItem.depositAmount || 0) > 0) {
          const itemReturnQty = Math.min(cartItem.quantity, availableForSwap);
          availableForSwap -= itemReturnQty;
          return { ...cartItem, returnQuantity: itemReturnQty };
        }
        return { ...cartItem, returnQuantity: 0 };
      });

      localStorage.setItem('cart', JSON.stringify(automatedCart));

      const targetItem = automatedCart.find(i => i.id === item.id);

      const payload = {
        productId: item.id,
        quantity: newQuantity,
        returnQuantity: targetItem?.returnQuantity || 0
      };

      // Store in pending for flush assurance
      pendingUpdates.current[item.id] = payload;

      const syncToServer = async () => {
        try {
          await fetch('/shop/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          // Clear pending update satisfied
          delete pendingUpdates.current[item.id];
          window.dispatchEvent(new Event('cartUpdated'));
        } catch (err) {
          console.error('Error updating cart on server:', err);
        }
      };

      if (redirectToCart) {
        if (timeoutRefs.current[item.id]) clearTimeout(timeoutRefs.current[item.id]);
        syncToServer().then(() => {
          router.push('/app/cart');
        });
      } else if (!existingItem) {
        if (timeoutRefs.current[item.id]) clearTimeout(timeoutRefs.current[item.id]);
        syncToServer();
      } else {
        if (timeoutRefs.current[item.id]) clearTimeout(timeoutRefs.current[item.id]);
        timeoutRefs.current[item.id] = setTimeout(syncToServer, 300);
      }

      return automatedCart;
    });
  };

  const removeFromCart = async (itemId) => {
    setCart(prevCart => {
      const newCart = prevCart.filter((item) => item.id !== itemId);
      localStorage.setItem('cart', JSON.stringify(newCart));

      if (timeoutRefs.current[itemId]) {
        clearTimeout(timeoutRefs.current[itemId]);
      }

      // Persist removal to server in background (Immediate)
      fetch('/shop/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: itemId,
          quantity: 0,
        }),
      }).then(() => {
        window.dispatchEvent(new Event('cartUpdated'));
      }).catch(err => {
        console.error('Error removing cart item on server:', err);
      });

      return newCart;
    });
  };

  return (
    <div className="h-full">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="rounded-xl ">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Select Items</h1>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="border-primary/20 shadow-sm overflow-hidden">
                <CardHeader className="p-3 sm:p-6">
                  <div className="flex justify-between mb-2">
                    <Skeleton className="w-12 h-12 sm:w-20 sm:h-20 rounded-md" />
                  </div>
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-4 p-3 sm:p-6 pt-0">
                  <div className="flex justify-between pb-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {items.map((item) => {
              const quantity = getItemQuantity(item.id);
              return (
                <Card key={item.id} className="hover-lift border-primary/20 shadow-colorful overflow-hidden">
                  <CardHeader className="p-3 sm:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="relative w-12 h-12 sm:w-20 sm:h-20 flex-shrink-0  p-1 ">
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
                            className="object-contain"
                            sizes="(max-width: 640px) 48px, 80px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Droplet className="h-6 w-6 text-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-sm sm:text-lg text-foreground">{item.name}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm line-clamp-2">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 sm:space-y-4 p-3 sm:p-6 pt-0">
                    <div className="flex items-center justify-between rounded-lg pb-2">
                      <span className="text-lg sm:text-2xl font-bold text-black">₹{Number(item.price).toFixed(2)}</span>
                      <span className="text-[10px] sm:text-sm text-muted-foreground font-medium">{item.unit}</span>
                    </div>
                    {item.inStock ? (
                      item.hasPendingDeposit ? (
                        <Button
                          className="w-full h-9 sm:h-11 text-xs sm:text-sm"
                          variant="secondary"
                          size="sm"
                        >
                          Pending Approval
                        </Button>
                      ) : quantity > 0 ? (
                        <div className="flex gap-2 w-full">
                          <Button
                            onClick={() => router.push('/app/cart')}
                            className="flex-1 h-9 sm:h-11 text-xs sm:text-sm"
                            variant="outline"
                            size="sm"
                          >
                            Go to cart
                          </Button>
                          <Button
                            onClick={() => removeFromCart(item.id)}
                            className="w-10 h-9 sm:h-11 px-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                            variant="outline"
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => {
                            addToCart(item, { redirectToCart: items.length === 1 });
                          }}
                          className="w-full h-9 sm:h-11 text-xs sm:text-sm"
                          variant="default"
                          size="sm"
                        >
                          Add to cart
                        </Button>
                      )
                    ) : (
                      <Button disabled className="w-full h-9 sm:h-11 text-xs sm:text-sm" variant="outline" size="sm">
                        Out of Stock
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Droplet className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No items available</h3>
                <p className="text-muted-foreground">
                  Check back later for new items
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

