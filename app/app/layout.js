'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AppHeader from '../../components/app/AppHeader';
import BottomNav from '../../components/app/BottomNav';
import { cn } from '../../lib/utils';

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNewUserFlow, setIsNewUserFlow] = useState(false);

  useEffect(() => {
    const checkUserFlow = () => {
      if (typeof window !== 'undefined') {
        const isNew = localStorage.getItem('isNewUserFlow') === 'true';
        setIsNewUserFlow(isNew);

        // Redirect to profile if new user and not already on profile page
        if (isNew && pathname !== '/app/profile') {
          router.replace('/app/profile');
        }
      }
    };

    checkUserFlow();

    // Listen for storage events (if changed in another tab/window)
    window.addEventListener('storage', checkUserFlow);
    // Listen for custom event dispatch
    window.addEventListener('newUserFlowChanged', checkUserFlow);

    return () => {
      window.removeEventListener('storage', checkUserFlow);
      window.removeEventListener('newUserFlowChanged', checkUserFlow);
    };
  }, [pathname, router]);

  // Session validation
  useEffect(() => {
    // Skip validation on login page
    if (pathname === '/app/login') return;

    const validateSession = async () => {
      try {
        const res = await fetch('/shop/api/auth/session');
        if (!res.ok) {
          // Session invalid/expired
          if (typeof window !== 'undefined') {
            localStorage.removeItem('isLoggedIn');
            // localStorage.removeItem('authToken'); // Cleanup old token
          }
          router.replace('/app/login');
        }
      } catch (err) {
        console.error('Session validation error', err);
      }
    };

    validateSession();
  }, [pathname, router]);

  return (
    <div className="min-h-[100dvh] bg-muted/50 flex flex-col overflow-hidden">
      {!isNewUserFlow && pathname !== '/app/login' && <AppHeader />}
      <main
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden min-h-0",
          pathname === '/app/login' ? "flex flex-col" : "pt-2 pb-16 sm:pb-2"
        )}
        style={{
          paddingBottom: pathname === '/app/login' || isNewUserFlow
            ? '0'
            : 'calc(4rem + env(safe-area-inset-bottom))'
        }}
      >
        {children}
        {(pathname === '/app/login' || pathname === '/app/profile') && (
          <footer className="py-4 px-4 text-center text-gray-500 text-xs border-t border-gray-100 mt-auto">
            Powered by <a href="https://www.stedaxis.com" target="_blank" rel="noopener noreferrer" className=" font-medium">STEDAXIS</a>
          </footer>
        )}
      </main>
      {!isNewUserFlow && pathname !== '/app/login' && <BottomNav />}
    </div>
  );
}