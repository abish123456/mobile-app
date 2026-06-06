'use client';

import { useState, useEffect, useRef } from 'react';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '../ui/sidebar';
import {
  Package,
  Route,
  Users,
  BarChart3,
  Home,
  ShoppingBag,
  ArrowLeftFromLine,
  IndianRupee,
  Coins,
  AlertCircle,
  MapPin,
  TrendingUp,
  Map,
  CheckCircle2,
  RefreshCcw,
  UserPlus,
  User,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  ChevronDown,
  CalendarIcon,
  Settings,
  Phone,
  FileSearch2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SidebarTrigger, useSidebar } from '../ui/sidebar';
import Image from 'next/image';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuArrow,
} from '../ui/dropdown-menu';

const menuItems = [
  {
    title: 'Dashboard',
    url: '/admin',
    icon: Home,
  },
  {
    title: 'Orders',
    url: '/admin/orders',
    icon: Package,
  },
  {
    title: 'Assign Routes',
    url: '/admin/routes',
    icon: Route,
  },
  {
    title: 'Master',
    icon: LayoutGrid,
    children: [
      {
        title: 'Routes',
        url: '/admin/service-routes',
        icon: Map,
      },
      {
        title: 'Service Areas',
        url: '/admin/service-areas',
        icon: MapPin,
      },
      {
        title: 'Products',
        url: '/admin/products',
        icon: ShoppingBag,
      },
      {
        title: 'Delivery Staffs',
        url: '/admin/delivery-boys',
        icon: Users,
      },
      {
        title: 'Delivery Reasons',
        url: '/admin/not-delivered-reasons',
        icon: RefreshCcw,
      },
    ]
  },
  {
    title: 'Delivery Exceptions',
    url: '/admin/delivery-exceptions',
    icon: AlertCircle,
  },
  {
    title: 'Order Log',
    url: '/admin/order-log',
    icon: FileSearch2,
  },
  {
    title: 'Customer Profiles',
    url: '/admin/customer-prices',
    icon: User,
  },
  {
    title: 'Deposit Refunds',
    url: '/admin/deposit-refunds',
    icon: IndianRupee,
  },
  {
    title: 'Performance',
    url: '/admin/delivery-boys-performance',
    icon: TrendingUp,
  },
  {
    title: 'Reports',
    icon: BarChart3,
    children: [
      {
        title: 'General Reports',
        url: '/admin/reports',
        icon: BarChart3,
      },
      {
        title: 'Order Amount Reports',
        url: '/admin/reports/order-amount',
        icon: IndianRupee,
      },
      {
        title: 'Cumulative Reports',
        url: '/admin/reports/cumulative',
        icon: TrendingUp,
      },
      {
        title: 'COD Collection',
        url: '/admin/reports/cod-collection',
        icon: IndianRupee,
      },
      {
        title: 'Reassigned Orders',
        url: '/admin/reports/reassigned',
        icon: RefreshCcw,
      },
      {
        title: 'Route-wise Report',
        url: '/admin/reports/route-wise',
        icon: CheckCircle2,
      },
      {
        title: 'Cash Settlement',
        url: '/admin/reports/cash-settlement',
        icon: Coins,
      },
    ]
  },
  {
    title: 'Settings',
    icon: Settings,
    children: [
      {
        title: 'Delivery Settings',
        url: '/admin/settings',
        icon: CalendarIcon,
      },
      {
        title: 'Support Contacts',
        url: '/admin/settings/contacts',
        icon: Phone,
      },
    ]
  },
];

function AdminSidebarItem({ item, pathname, isCollapsed, handleNavigate }) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive = !hasChildren
    ? (item.url === '/admin' ? pathname === '/admin' : pathname === item.url || pathname?.startsWith(item.url + '/'))
    : item.children.some(child => pathname === child.url || pathname?.startsWith(child.url + '/'));

  const [isExpanded, setIsExpanded] = useState(isActive);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 150); // Small delay to prevent flickering
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Keep expanded if children are active
  useEffect(() => {
    if (isActive && hasChildren) {
      setIsExpanded(true);
    }
  }, [isActive, hasChildren]);

  const Icon = item.icon;

  if (hasChildren) {
    // CONTENT FOR BOTH MODES
    const childrenList = item.children.map((child) => {
      // Use exact match for reports sub-menu to avoid highlighting parent path when sub-path is active
      const isChildActive = pathname === child.url;
      const ChildIcon = child.icon;
      return { ...child, isChildActive, ChildIcon };
    });

    if (isCollapsed) {
      return (
        <SidebarMenuItem>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={undefined}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={cn(
                  "cursor-pointer !text-white hover:!bg-white/10 rounded-lg transition-colors flex justify-center items-center w-full py-3 px-0 text-center",
                  isActive && "!bg-white/10 !text-white font-medium"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 !text-current" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="center"
              sideOffset={12}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="!bg-black !border-gray-800 !text-white min-w-[180px] z-[100]"
            >
              <DropdownMenuArrow className="fill-black stroke-gray-800 stroke-[1px]" />
              {childrenList.map((child) => (
                <DropdownMenuItem
                  key={child.title}
                  onClick={() => {
                    handleNavigate(child.url);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer hover:!bg-white/20 hover:!text-white !text-gray-300 py-2.5 px-3 flex items-center gap-3 rounded-md transition-colors",
                    child.isChildActive && "!bg-white/25 !text-white font-medium"
                  )}
                >
                  <child.ChildIcon className="h-4 w-4 shrink-0 transition-colors !text-current" />
                  <span>{child.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          onClick={() => setIsExpanded(!isExpanded)}
          tooltip={undefined}
          className={cn(
            "cursor-pointer !text-white hover:!bg-white/10 rounded-lg transition-colors flex items-center w-full px-3 py-3 gap-2",
            isActive && "!bg-white/10 !text-white font-medium"
          )}
        >
          <Icon className="h-5 w-5 shrink-0 !text-current" />
          <>
            <span className="text-md flex-1">{item.title}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
          </>
        </SidebarMenuButton>

        {isExpanded && (
          <SidebarMenuSub className="border-gray-800 ml-4 mt-1">
            {childrenList.map((child) => (
              <SidebarMenuSubItem key={child.title}>
                <SidebarMenuSubButton
                  isActive={child.isChildActive}
                  onClick={() => handleNavigate(child.url)}
                  className={cn(
                    "cursor-pointer !text-gray-400 hover:!text-white hover:!bg-white/15 rounded-md py-2 px-3 transition-all",
                    child.isChildActive && "!text-white !bg-white/20 font-medium"
                  )}
                >
                  <child.ChildIcon className="h-4 w-4 shrink-0 mr-2 !text-current" />
                  <span>{child.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => handleNavigate(item.url)}
        tooltip={item.title}
        className={cn(
          "cursor-pointer !text-white hover:!bg-white/10 rounded-lg transition-colors",
          isActive && "!bg-white/20 !text-white font-medium",
          isCollapsed
            ? "flex justify-center items-center w-full py-3 px-0"
            : "flex items-center w-full px-3 py-3 gap-2"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!isCollapsed && (
          <span className="text-md">{item.title}</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile, toggleSidebar, open, setOpen } = useSidebar();
  const [lastUpdated, setLastUpdated] = useState('');

  // Collapsed = icon-only rail mode
  const isCollapsed = !open;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setLastUpdated(formatted);
    };

    updateTime();
    window.addEventListener('admin-data-refreshed', updateTime);
    return () => {
      window.removeEventListener('admin-data-refreshed', updateTime);
    };
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminEmail');
    router.push('/admin/login');
  };

  const handleNavigate = (url) => {
    router.push(url);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className="!bg-black !border-gray-800 transition-all duration-300"
      style={{ backgroundColor: '#000000' }}
    >
      <SidebarContent className="!bg-black flex flex-col h-full" style={{ backgroundColor: '#000000' }}>

        {/* ── TOP HEADER: Logo + Collapse Toggle ── */}
        {isCollapsed ? (
          /* COLLAPSED: logo on top, expand button below — all centered */
          <div className="flex flex-col items-center gap-2 border-b border-gray-800 py-3 px-2 shrink-0 w-full mb-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Image
                src="/shop/Sobals logo.jpg"
                alt="SABOLS logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded object-contain"
                priority
              />
            </button>
          </div>
        ) : (
          /* EXPANDED: logo+name on left, chevron-left on right */
          <div className="flex items-center justify-between border-b border-gray-800 py-4 px-4 shrink-0">
            <button
              onClick={() => handleNavigate('/admin')}
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Image
                src="/shop/Sobals logo.jpg"
                alt="SABOLS logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded object-contain shrink-0"
                priority
              />
              <span className="font-bold text-xl text-white truncate">SABOLS</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="flex items-center justify-center h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                Collapse sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <SidebarGroup className="flex-1 overflow-y-auto custom-scrollbar">
          <SidebarGroupContent>
            <SidebarMenu className={cn("pt-2", isCollapsed ? "px-1" : "px-2")}>
              {menuItems.map((item) => (
                <AdminSidebarItem
                  key={item.title}
                  item={item}
                  pathname={pathname}
                  isCollapsed={isCollapsed}
                  handleNavigate={handleNavigate}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── BOTTOM: Logout + Last Updated ── */}
        <div className={cn("border-t border-gray-800 p-4", isCollapsed && "flex flex-col items-center")}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <SidebarMenuButton
                tooltip={isCollapsed ? "Log out" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors text-sm",
                  isCollapsed ? "w-auto justify-center" : "w-full"
                )}
              >
                <ArrowLeftFromLine className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span>Log out</span>}
              </SidebarMenuButton>
            </AlertDialogTrigger>
            <AlertDialogContent suppressHydrationWarning>
              <AlertDialogHeader>
                <AlertDialogTitle>Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to Logout the admin panel? You will need to sign in again to continue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {!isCollapsed && lastUpdated && (
            <div className="mt-3 px-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">
              Updated: {lastUpdated}
            </div>
          )}
        </div>

      </SidebarContent>
    </Sidebar>
  );
}

