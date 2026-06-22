'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Store, ShoppingCart, Package, User } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function BottomNav() {
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

  // Hide on login page
  if (pathname === '/app/login') {
    return null;
  }

  // Determine if nav should be hidden (only after mount to prevent hydration mismatch)
  const shouldHideNav = isMounted && pathname === '/app/profile' && isNewUserFlow;

  if (shouldHideNav) {
    return null;
  }

  const navItems = [
    { path: '/app/items', icon: Store, label: 'Items' },
    { path: '/app/cart', icon: ShoppingCart, label: 'Cart', badge: cartCount },
    { path: '/app/orders', icon: Package, label: 'Orders' },
    { path: '/app/profile', icon: User, label: 'Profile' },
  ];

  const isActive = (path) => {
    if (path === '/app/items') {
      return pathname === '/app/items';
    }
    return pathname?.startsWith(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-black'
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

