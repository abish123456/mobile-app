'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { LogOut, User, Package, ShoppingCart, Store } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import Image from 'next/image';

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
  // Initialize as false to match server render, update after mount
  const [isNewUserFlow, setIsNewUserFlow] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Load cart count from server (database) for accuracy
  useEffect(() => {
    // Mark as mounted to prevent hydration mismatch
    setIsMounted(true);

    const loadCartCount = async () => {
      try {
        // Token check removed, validating via session cookie
        const res = await fetch('/shop/api/cart', {
          headers: {},
          cache: 'no-store',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.items)) {
            const total = data.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            setCartCount(total);
            return;
          }
        }
      } catch {
        setCartCount(0);
      }
    };

    // Check for new user flow flag
    const checkNewUserFlow = () => {
      setIsNewUserFlow(localStorage.getItem('isNewUserFlow') === 'true');
    };

    // Load count from server
    loadCartCount();
    checkNewUserFlow();

    // Listen for cart updates and new user flow changes
    const handleCartUpdate = () => {
      // Try local storage first for instant update
      try {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
          const items = JSON.parse(savedCart);
          const total = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          setCartCount(total);
        }
      } catch (e) {
        // ignore
      }
      loadCartCount();
    };
    const handleStorageChange = () => {
      handleCartUpdate();
      checkNewUserFlow();
    };
    const handleNewUserFlowChange = () => {
      checkNewUserFlow();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('cartUpdated', handleCartUpdate);
    window.addEventListener('newUserFlowChanged', handleNewUserFlowChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('newUserFlowChanged', handleNewUserFlowChange);
    };
  }, []);

  // Re-check new user flow flag when pathname changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsNewUserFlow(localStorage.getItem('isNewUserFlow') === 'true');
    }
  }, [pathname]);

  // Hide the app header on the login screen to keep it clean and focused
  if (pathname === '/app/login') {
    return null;
  }

  // Determine if header should be hidden (only after mount to prevent hydration mismatch)
  const shouldHideHeader = isMounted && pathname === '/app/profile' && isNewUserFlow;

  const handleLogout = async () => {
    try {
      await fetch('/shop/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error("Logout error", e);
    }

    if (typeof window !== 'undefined') {
      // Store the phone number before removing it, so we can compare on next login
      const currentPhone = localStorage.getItem('userPhone');
      if (currentPhone) {
        localStorage.setItem('lastUserPhone', currentPhone);
      }
      localStorage.removeItem('authToken');
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userPhone');
    }
    router.push('/app/login');
  };

  const goToProfile = () => {
    router.push('/app/profile');
  };

  const goToOrders = () => {
    router.push('/app/orders');
  };

  const goToCart = () => {
    router.push('/app/cart');
  };

  const goToItems = () => {
    router.push('/app/items');
  };

  const isOnProfile = pathname?.startsWith('/app/profile');
  const isOnOrders = pathname?.startsWith('/app/orders');
  const isOnItems = pathname?.startsWith('/app/items');
  const isOnCart = pathname?.startsWith('/app/cart');

  return (
    <header
      className={`w-full border-b border-primary/20 sticky top-0 z-40 shadow-sm bg-[#f3f7fb] backdrop-blur ${shouldHideHeader ? 'hidden' : ''
        }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto max-w-5xl flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3">
        <button
          type="button"
          onClick={goToItems}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="hover:shadow-lg transition-shadow">
            <Image
              src="/shop/Sobals logo.jpg"
              alt="SABOLS logo"
              width={40}
              height={40}
              className="h-7 w-7 object-contain"
              priority
            />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-sm font-bold text-black">SABOLS</span>
            <span className="text-xs text-muted-foreground">Watercan Ordering</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isOnItems ? 'default' : 'outline'}
            size="sm"
            className="hidden sm:inline-flex items-center gap-1"
            onClick={goToItems}
          >
            <Store className="h-4 w-4" />
            Items
          </Button>
          <Button
            type="button"
            variant={isOnCart ? 'default' : 'outline'}
            size="sm"
            className="hidden sm:inline-flex items-center gap-1 relative"
            onClick={goToCart}
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-pulse">
                {cartCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant={isOnOrders ? 'default' : 'outline'}
            size="sm"
            className="hidden sm:inline-flex items-center gap-1"
            onClick={goToOrders}
          >
            <Package className="h-4 w-4" />
            Orders
          </Button>
          <Button
            type="button"
            variant={isOnProfile ? 'default' : 'outline'}
            size="sm"
            className="hidden sm:inline-flex items-center gap-1"
            onClick={goToProfile}
          >
            <User className="h-4 w-4" />
            Profile
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Logout"
                className="h-9 w-9"
                suppressHydrationWarning
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent suppressHydrationWarning>
              <AlertDialogHeader>
                <AlertDialogTitle>Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure want to logout? You will need to log in again to access your orders and profile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>
                  Yes, logout
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </header>
  );
}