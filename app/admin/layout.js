'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminSidebar from '../../components/admin/AdminSidebar';
import AdminHeader from '../../components/admin/AdminHeader';
import { SidebarProvider } from '../../components/ui/sidebar';
import { adminFetch } from '../../lib/admin-api';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Mark component as mounted to avoid hydration mismatch
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only run auth check after component is mounted
    if (!mounted) return;

    // Check if user is on login page
    if (pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }

    // Check admin authentication
    const checkAuth = () => {
      const adminToken = localStorage.getItem('adminToken');
      const adminEmail = localStorage.getItem('adminEmail');

      if (!adminToken || !adminEmail) {
        router.push('/admin/login');
        return;
      }

      setIsAuthenticated(true);
      setIsLoading(false);
    };

    checkAuth();
  }, [pathname, router, mounted]);

  // Auto-cleanup abandoned online pending orders every 1 hour
  useEffect(() => {
    if (!isAuthenticated) return;

    const runCleanup = async () => {
      try {
        await adminFetch('/api/admin/orders/cleanup-abandoned', {
          method: 'POST',
        });
        console.log('[Admin] Cleanup of abandoned online orders ran.');
      } catch (err) {
        // Silent fail — this is a background cleanup task
        console.error('[Admin] Cleanup job failed silently:', err);
      }
    };

    // Run once immediately when admin logs in, then every hour
    runCleanup();
    const intervalId = setInterval(runCleanup, 60 * 60 * 1000); // every 1 hour

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  // Don't show layout on login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Show loading state only after mount to avoid hydration mismatch
  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show admin layout for authenticated users
  if (pathname === '/admin/reports/print') {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen bg-gray-50 flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col w-full min-w-0">
          <AdminHeader />
          <main className="flex-1 w-full p-6 bg-gray-50">
            {children}
          </main>
          <footer className="py-4 px-6 text-center text-gray-500 text-sm border-t border-gray-200">
            Powered by <a href="https://www.stedaxis.com" target="_blank" rel="noopener noreferrer" className="font-medium">STEDAXIS</a>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}

