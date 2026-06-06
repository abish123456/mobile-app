'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Search, User, ChevronDown, LogOut } from 'lucide-react';
import { SidebarTrigger } from '../ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

export default function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [adminEmail, setAdminEmail] = useState(null);

  useEffect(() => {
    // Only access localStorage on client side after mount
    const email = localStorage.getItem('adminEmail');
    setAdminEmail(email);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminEmail');
    router.push('/admin/login');
  };

  // Get page title based on current route
  const getPageTitle = () => {
    if (pathname && pathname.startsWith('/admin') && pathname !== '/admin/login') {
      return 'Admin';
    }
    return 'Dashboard';
  };

  return (
    <header
      className="sticky top-0 z-40 w-full border-b bg-white/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-[4.25rem] items-center justify-between px-4 sm:px-6 lg:px-8 gap-3">
        {/* Left: Mobile toggle + Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <SidebarTrigger className="xl:hidden -ml-1" aria-label="Toggle menu" />
          <h1 className="text-xl sm:text-2xl font-bold text-black truncate">{getPageTitle()}</h1>
        </div>

        {/* Right: Search and User Profile */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Search Bar */}
          {/* <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search orders, customers, products..."
              className="pl-10 w-64 h-9 bg-gray-50 border-gray-200 focus:bg-white"
            />
          </div> */}

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 h-9 px-2 sm:px-3 hover:bg-gray-100"
              >
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
                <ChevronDown className="h-4 w-4 text-gray-600 hidden sm:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">Admin</p>
                  <p className="text-xs text-muted-foreground">{adminEmail || 'admin@watercan.com'}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent suppressHydrationWarning>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Logout</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to log out? You will need to sign in again to access the admin panel.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

