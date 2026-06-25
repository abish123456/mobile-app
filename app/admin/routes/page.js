'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
const MapPicker = dynamic(() => import('../../../components/app/MapPicker'), { ssr: false });
const RouteMap = dynamic(() => import('../../../components/app/RouteMap'), { ssr: false });
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Calendar } from '../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { format } from 'date-fns';
import { Route, Plus, CalendarIcon, Copy, CheckCircle2, Loader2, AlertCircle, Shuffle, ChevronLeft, ChevronRight, RefreshCcw, History, UserPlus, Edit, Truck, Search, Check, ChevronsUpDown, ChevronUp, ChevronDown, GripVertical, MapPin, List, MapIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';
import { formatDateIST, getStartOfDayIST, isTodayIST } from '../../../lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';

export default function RoutesPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReassigning, setIsReassigning] = useState(false);
  const [isLoadingDeliveryBoys, setIsLoadingDeliveryBoys] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [assignFormData, setAssignFormData] = useState({
    deliveryBoyId: '',
    date: new Date(),
  });
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState([]);

  useEffect(() => {
    try {
      const perms = localStorage.getItem('adminPermissions');
      if (perms) {
        setAdminPermissions(JSON.parse(perms));
      }
    } catch (e) {
      console.error('Failed to parse admin permissions', e);
    }
  }, []);

  const hasPermission = (perm) => {
    return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
  };

  const [dialogError, setDialogError] = useState('');
  const [copiedRoutes, setCopiedRoutes] = useState({}); // Track copied state for each route
  const [isGenerating, setIsGenerating] = useState({}); // Track generating state for each route
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [holidayDates, setHolidayDates] = useState(new Set());
  const [weeklyOffDays, setWeeklyOffDays] = useState(new Set());
  const [historyRoute, setHistoryRoute] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isStaffPopoverOpen, setIsStaffPopoverOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');

  // Orders Dialog State
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [selectedRouteOrders, setSelectedRouteOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersDialogRoute, setOrdersDialogRoute] = useState(null);
  const [isSavingSort, setIsSavingSort] = useState(false);
  const [hasUnsavedSort, setHasUnsavedSort] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [initialRouteOrders, setInitialRouteOrders] = useState([]);
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [isRedistributing, setIsRedistributing] = useState(false);
  const [showRedistributeConfirm, setShowRedistributeConfirm] = useState(false);
  const [pendingTargetRouteId, setPendingTargetRouteId] = useState(null);
  const [ordersViewMode, setOrdersViewMode] = useState('list');

  const [hubLocation, setHubLocation] = useState(null);
  const [showHubDialog, setShowHubDialog] = useState(false);
  const [isSavingHub, setIsSavingHub] = useState(false);

  const [showOptimizePrompt, setShowOptimizePrompt] = useState(false);
  const [routeToOptimize, setRouteToOptimize] = useState(null);
  const [isAutoOptimizing, setIsAutoOptimizing] = useState(false);

  const fetchHubLocation = async () => {
    try {
      const res = await adminFetch('/api/admin/hub-location');
      const data = await res.json();
      if (data.success && data.location) {
        setHubLocation(data.location);
      } else {
        setHubLocation({lat: 11.0168, lng: 76.9558}); 
      }
    } catch (err) {
      console.error('Error fetching hub location:', err);
    }
  };

  const saveHubLocation = async () => {
    if (!hubLocation) return;
    setIsSavingHub(true);
    try {
      const res = await adminFetch('/api/admin/hub-location', {
        method: 'POST',
        body: JSON.stringify(hubLocation)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Hub location saved successfully');
        setShowHubDialog(false);
      } else {
        toast.error('Failed to save hub location');
      }
    } catch (err) {
      console.error('Error saving hub location:', err);
      toast.error('Network error');
    } finally {
      setIsSavingHub(false);
    }
  };

  useEffect(() => {
    fetchHubLocation();
  }, []);


  // Clear highlight after 10 seconds
  useEffect(() => {
    if (highlightedOrderId) {
      const timer = setTimeout(() => {
        setHighlightedOrderId(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [highlightedOrderId]);



  useEffect(() => {
    fetchRoutes();

    const intervalId = setInterval(() => {
      fetchRoutes();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [selectedDate]);

  useEffect(() => {
    fetchDeliveryBoys();
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/shop/api/config', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.config) {
        if (Array.isArray(data.config.holidays)) {
          setHolidayDates(new Set(data.config.holidays.map((h) => h.date)));
        }
        if (Array.isArray(data.config.HOLIDAY_WEEKDAYS)) {
          setWeeklyOffDays(new Set(data.config.HOLIDAY_WEEKDAYS));
        }
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  const fetchRoutes = async () => {
    setIsLoading(true);
    setError('');

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Fetch both service routes (all territories) and daily routes (orders/tokens)
      const [serviceRes, dailyRes] = await Promise.all([
        adminFetch(`/api/admin/service-routes?date=${dateStr}`),
        adminFetch(`/api/admin/routes?date=${dateStr}`)
      ]);

      const serviceData = await serviceRes.json();
      const dailyData = await dailyRes.json();

      if (serviceData.success) {
        const serviceRoutes = serviceData.serviceRoutes || [];
        const dailyRoutes = dailyData.success ? (dailyData.routes || []) : [];

        // Merge: Use service routes as base, enrich with daily data
        const merged = serviceRoutes.map(sr => {
          // Find matching daily route by serviceRouteId
          const dailyMatch = dailyRoutes.find(dr => dr.serviceRouteId === sr.id);

          // Get assignment info
          // Priority: dailyMatch (actual Route with orders) > dailyAssignment (from service-routes API)
          const deliveryBoyId = dailyMatch?.deliveryBoyId || sr.dailyAssignment?.deliveryBoyId || null;
          const deliveryBoyName = dailyMatch?.deliveryBoyName || sr.dailyAssignment?.deliveryBoyName || null;

          return {
            id: sr.id, // ServiceRoute ID (for UI keys and assignment API)
            name: sr.name,
            description: sr.description,
            serviceAreas: sr.serviceAreas || [],
            pincodes: (sr.serviceAreas || []).map(sa => sa.pincode), // Extract pincodes for display

            // Assignment info
            deliveryBoyId: deliveryBoyId,
            deliveryBoyName: deliveryBoyName,
            isAssigned: !!deliveryBoyId, // Boolean flag for UI

            // Daily route info (orders, tokens) - only if orders exist
            routeId: dailyMatch?.id || sr.dailyAssignment?.id, // Route table ID for token generation
            orderCount: dailyMatch?.orderCount || sr.unassignedOrderCount || 0,
            unoptimizedCount: dailyMatch?.unoptimizedCount || 0,
            refundCount: dailyMatch?.refundCount || 0,
            token: dailyMatch?.token || null,
            tokenExpiresAt: dailyMatch?.tokenExpiresAt || null,
            tokenLogs: dailyMatch?.tokenLogs || [],
            date: dailyMatch?.date || dateStr,
            isSubmitted: dailyMatch?.isSubmitted || false,
            submittedAt: dailyMatch?.submittedAt || null,
            isAutoOptimized: dailyMatch?.isAutoOptimized || false,
          };
        });

        setRoutes(merged);
      } else {
        setError(serviceData.message || 'Failed to fetch routes');
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeliveryBoys = async () => {
    setIsLoadingDeliveryBoys(true);
    try {
      const response = await adminFetch('/api/admin/delivery-boys');
      const data = await response.json();
      if (data.success) {
        setDeliveryBoys(data.deliveryBoys || []);
      }
    } catch (err) {
      console.error('Error fetching delivery Staff:', err);
    } finally {
      setIsLoadingDeliveryBoys(false);
    }
  };



  const totalPages = Math.ceil(routes.length / itemsPerPage);
  const paginatedRoutes = routes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);



  const formatDate = (dateString) => {
    return formatInTimeZone(new Date(dateString), 'Asia/Kolkata', 'MMM dd, yyyy');
  };

  /* New Assignment Logic */
  const openAssignDialog = (route) => {
    setSelectedRoute(route);
    setAssignFormData({
      deliveryBoyId: route.deliveryBoyId || '',
      date: selectedDate,
    });
    setShowAssignDialog(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setIsAssignSubmitting(true);

    try {
      // We need the SERVICE ROUTE ID here
      const payload = {
        serviceRouteId: selectedRoute.id, // This is the ID from ServiceRoute table
        deliveryBoyId: assignFormData.deliveryBoyId || null,
        date: assignFormData.date,
      };

      const response = await adminFetch('/api/admin/daily-routes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        toast.success('Assignment updated successfully');
        setShowAssignDialog(false);
        fetchRoutes(); // Refresh all data to reflect changes
        
        // Background sync for audit logs
        try {
          if (data.routeId) {
            const newStaff = assignFormData.deliveryBoyId ? deliveryBoys.find(s => s.id === assignFormData.deliveryBoyId) : null;
            adminFetch('/api/admin/audit-logs/route-orders', {
              method: 'POST',
              body: JSON.stringify({
                routeId: data.routeId,
                action: assignFormData.deliveryBoyId ? 'UPDATE' : 'DELETE',
                routeName: selectedRoute.name,
                newStaffName: newStaff ? newStaff.name : null
              })
            }).catch(e => console.error('Audit sync error:', e));
          }
        } catch (e) {
          console.error('Audit prep error:', e);
        }
      } else {
        toast.error(data.message || 'Assignment failed');
      }
    } catch (err) {
      console.error('Error assigning route:', err);
      toast.error('Network error');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  // NOTE: Keeping generateToken largely same but needing minimal tweak to ensure we have an ID
  const generateToken = async (route) => {
    // If there are unoptimized orders, OR if it has NEVER been auto-optimized (and has orders)
    if ((route.unoptimizedCount > 0) || (route.orderCount > 0 && !route.isAutoOptimized)) {
      setRouteToOptimize(route);
      setShowOptimizePrompt(true);
      return { success: false };
    }

    let targetRouteId = route.routeId;

    // If no route record exists yet but staff is assigned (e.g., carried forward)
    // auto-create the route first
    if (!targetRouteId && route.deliveryBoyId) {
      setIsGenerating(prev => ({ ...prev, [route.id]: true }));
      try {
        const payload = {
          serviceRouteId: route.id,
          deliveryBoyId: route.deliveryBoyId,
          date: selectedDate,
        };
        const assignRes = await adminFetch('/api/admin/daily-routes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const assignData = await assignRes.json();

        if (assignData.success && assignData.routeId) {
          targetRouteId = assignData.routeId;
        } else {
          toast.error(assignData.message || "Failed to create route record");
          return { success: false };
        }
      } catch (err) {
        console.error("Link generation prep failed:", err);
        toast.error("Preparation failed");
        return { success: false };
      }
    }

    if (!targetRouteId) {
      toast.error("Please assign a delivery person first to create the route record.");
      return { success: false };
    }

    setIsGenerating(prev => ({ ...prev, [route.id]: true }));
    try {
      const response = await adminFetch(`/api/admin/routes/${targetRouteId}/generate-token`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        // Refresh routes to get updated token and logs
        await fetchRoutes();
        toast.success(`Link generated for ${route.name}`);

        return { success: true };
      } else {
        toast.error(data.message || 'Failed to generate link');
        return { success: false };
      }
    } catch (err) {
      console.error('Error generating token:', err);
      toast.error('Network error');
      return { success: false };
    } finally {
      setIsGenerating(prev => ({ ...prev, [route.id]: false }));
    }
  };

  const handleConfirmOptimizeAndGenerate = async () => {
    if (!routeToOptimize) return;
    setIsAutoOptimizing(true);
    try {
      const response = await adminFetch(`/api/admin/routes/${routeToOptimize.routeId}/optimize`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message || 'Route optimized successfully');
        setShowOptimizePrompt(false);
        // Now generate the token
        const updatedRoute = { ...routeToOptimize, unoptimizedCount: 0, isAutoOptimized: true };
        await generateToken(updatedRoute);
        // We should also refresh the routes so the UI is updated with the latest unoptimizedCount!
        fetchRoutes();
      } else {
        toast.error(data.message || 'Optimization failed');
        setShowOptimizePrompt(false);
      }
    } catch (err) {
      console.error('Error auto-optimizing:', err);
      toast.error('Network error during optimization');
      setShowOptimizePrompt(false);
    } finally {
      setIsAutoOptimizing(false);
      setRouteToOptimize(null);
    }
  };



  const handleCopyLink = async (route) => {
    if (!route.token || !route.routeId) return;

    const dateStr = format(new Date(selectedDate), 'yyyy-MM-dd');
    const link = `${window.location.origin}/shop/route/${dateStr}/${route.token}`;

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard');

      // Log the copy action to backend
      await adminFetch(`/api/admin/routes/${route.routeId}/log-copy`, {
        method: 'POST'
      });

      // Local state update for immediate feedback (or just wait for interval refresh)
      setCopiedRoutes(prev => ({ ...prev, [route.id]: true }));
      setTimeout(() => {
        setCopiedRoutes(prev => ({ ...prev, [route.id]: false }));
      }, 2000);

      // Refresh to show the new "COPIED" log
      fetchRoutes();
    } catch (err) {
      console.error('Error copying link:', err);
      toast.error('Failed to copy link');
    }
  };

  /* New Orders Dialog Logic */
  const fetchRouteOrders = async (route) => {
    if (!route) return;
    setIsLoadingOrders(true);
    setOrdersDialogRoute(route);

    try {
      let url = '';
      if (route.routeId) {
        url = `/api/admin/orders?routeId=${route.routeId}&limit=100`;
      } else {
        const dateStr = format(new Date(selectedDate), 'yyyy-MM-dd');
        url = `/api/admin/orders?serviceRouteId=${route.id}&deliveryDate=${dateStr}&limit=100`;
      }
      const response = await adminFetch(url);
      const data = await response.json();

      if (data.success) {
        setSelectedRouteOrders(data.orders || []);
        setInitialRouteOrders(data.orders || []);
      } else {
        toast.error(data.message || 'Failed to fetch orders');
        setSelectedRouteOrders([]);
      }
    } catch (err) {
      console.error('Error fetching route orders:', err);
      toast.error('Network error fetching orders');
      setSelectedRouteOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleRouteClick = (route) => {
    setOrdersDialogRoute(route);
    setShowOrdersDialog(true);
    setHasUnsavedSort(false);
    setSelectedOrderIds(new Set()); // Reset selection when opening a new route
    fetchRouteOrders(route);
  };

  const toggleOrderSelection = (orderId) => {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === selectedRouteOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(selectedRouteOrders.map(o => o.id)));
    }
  };

  const handleMoveOrders = (targetRouteId) => {
    if (!ordersDialogRoute?.routeId || selectedOrderIds.size === 0 || isRedistributing) return;
    setPendingTargetRouteId(targetRouteId);
    setShowRedistributeConfirm(true);
  };

  const executeRedistribution = async () => {
    if (!pendingTargetRouteId || !ordersDialogRoute?.routeId || selectedOrderIds.size === 0 || isRedistributing) return;

    setIsRedistributing(true);
    setShowRedistributeConfirm(false);

    try {
      const targetRoute = routes.find(r => r.id === pendingTargetRouteId);
      if (!targetRoute) throw new Error("Target route not found");

      let finalTargetRouteId = targetRoute.routeId;

      if (!finalTargetRouteId) {
        const payload = {
          serviceRouteId: targetRoute.id,
          deliveryBoyId: targetRoute.deliveryBoyId || null,
          date: selectedDate,
        };
        const assignRes = await adminFetch('/api/admin/daily-routes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const assignData = await assignRes.json();
        
        if (assignData.success && assignData.routeId) {
          finalTargetRouteId = assignData.routeId;
        } else {
          toast.error("Failed to initialize target route");
          setIsRedistributing(false);
          return;
        }
      }

      const response = await adminFetch('/api/admin/routes/redistribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRouteId: ordersDialogRoute.routeId,
          targetRouteId: finalTargetRouteId,
          orderIds: Array.from(selectedOrderIds)
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setSelectedOrderIds(new Set());
        setPendingTargetRouteId(null);
        // Refresh the current route's orders (they should be gone now)
        await fetchRouteOrders(ordersDialogRoute);
        // Also refresh the main routes list to update order counts
        fetchRoutes();
      } else {
        toast.error(data.message || 'Failed to move orders');
      }
    } catch (err) {
      console.error('Error moving orders:', err);
      toast.error('Network error moving orders');
    } finally {
      setIsRedistributing(false);
    }
  };


  const handleSaveSort = async () => {
    if (!ordersDialogRoute?.routeId || isSavingSort) return;

    setIsSavingSort(true);
    try {
      const orderIds = selectedRouteOrders.map(o => o.id);
      const response = await adminFetch(`/api/admin/routes/${ordersDialogRoute.routeId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds })
      });
      const data = await response.json();

      if (data.success) {
        toast.success('Sort order saved successfully');
        setHasUnsavedSort(false);
        setInitialRouteOrders([...selectedRouteOrders]);
        fetchRoutes(); // Update route list state
      } else {
        toast.error(data.message || 'Failed to save sort order');
      }
    } catch (err) {
      console.error('Error saving sort order:', err);
      toast.error('Network error saving sort order');
    } finally {
      setIsSavingSort(false);
    }
  };

  const handleOptimizePath = async () => {
    if (!ordersDialogRoute?.routeId || isOptimizing) return;

    setIsOptimizing(true);
    try {
      const response = await adminFetch(`/api/admin/routes/${ordersDialogRoute.routeId}/optimize`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message || 'Route optimised successfully');
        // Refresh orders to see new sequence
        await fetchRouteOrders(ordersDialogRoute);
        setHasUnsavedSort(false);
        fetchRoutes(); // Update route list state
      } else {
        toast.error(data.message || 'Optimisation failed');
      }
    } catch (err) {
      console.error('Error optimizing route:', err);
      toast.error('Network error during optimization');
    } finally {
      setIsOptimizing(false);
    }
  };

  const onDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const onDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newOrders = [...selectedRouteOrders];
    const draggedItem = newOrders[draggedIndex];

    // Remove the item from its original position
    newOrders.splice(draggedIndex, 1);
    // Insert it into the new position
    newOrders.splice(dropIndex, 0, draggedItem);

    setSelectedRouteOrders(newOrders);
    setHighlightedOrderId(draggedItem.id);

    // Check if the current order is different from the initial order
    const currentIds = newOrders.map(o => o.id).join(',');
    const initialIds = initialRouteOrders.map(o => o.id).join(',');
    setHasUnsavedSort(currentIds !== initialIds);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getRouteHistoryLogs = (route) => {
    if (!route) return [];
    const logs = [...(route.tokenLogs || [])];
    if (route.isSubmitted && route.submittedAt) {
      logs.push({
        action: 'SUBMITTED',
        generatedAt: route.submittedAt
      });
    }
    return logs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Assign Routes and Deliveries</h1>
          <p className="text-muted-foreground">Manage delivery routes and assignments</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          
          <div className="flex items-center gap-4">
            {hasPermission('set_hub_location') && (
              <Button variant="outline" onClick={() => setShowHubDialog(true)} className="gap-2 text-blue-500 border-blue-200 hover:bg-blue-50">
                <MapPin className="h-4 w-4" />
                Set Hub Location
              </Button>
            )}
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>

              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  defaultMonth={selectedDate || new Date()}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setIsDatePickerOpen(false);
                    }
                  }}
                  initialFocus
                  disabled={(date) => {
                    // Holiday check
                    const istDateStr = new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'Asia/Kolkata',
                      year: 'numeric', month: '2-digit', day: '2-digit',
                    }).format(date);
                    if (holidayDates.has(istDateStr)) return true;

                    // Weekly off check
                    const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
                      new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata', weekday: 'short',
                      }).format(date)
                    );
                    if (weeklyOffDays.has(weekdayIdx)) return true;

                    return false;
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Routes List</CardTitle>
          <CardDescription>
            {routes.length} route{routes.length !== 1 ? 's' : ''} for {formatDate(selectedDate)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoading && routes.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Route className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No routes found</h3>

              {/* <Button onClick={() => router.push('/admin/routes/create')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Route
              </Button> */}
            </div>
          ) : (
            <div className={cn("rounded-md border transition-opacity", isLoading && "opacity-50 pointer-events-none")}>
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Route Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Delivery Staff</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Route Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRoutes.map((route) => {
                    const now = new Date();
                    // Active from 00:00 AM (Start of Day) on delivery day in IST
                    const activeFrom = getStartOfDayIST(new Date(selectedDate));
                    const isActive = now >= activeFrom;
                    const isToday = isTodayIST(activeFrom);

                    const isExpired = (route.tokenExpiresAt && now > new Date(route.tokenExpiresAt)) || (isActive && !isToday);

                    return (
                      <TableRow key={route.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRouteClick(route)}>
                        <TableCell className="w-[150px] align-top">
                          <div
                            className={cn(
                              "font-medium text-base whitespace-normal break-words",
                              route.routeId ? "text-dark" : ""
                            )}
                          >
                            {route.name}
                          </div>
                        </TableCell>
                        <TableCell className="w-[150px] align-top">
                          <div className="text-sm">
                            {format(new Date(route.date), 'MMM dd, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell className="w-[200px] align-top">
                          {route.isAssigned ? (
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 whitespace-normal text-left h-auto py-1"
                              >
                                <Truck className="h-3 w-3 mr-1 shrink-0" />
                                <span>{route.deliveryBoyName}</span>
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); openAssignDialog(route); }} title="Change">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs border-dashed  justify-start" onClick={(e) => { e.stopPropagation(); openAssignDialog(route); }}>
                              <UserPlus className="h-3 w-3 mr-1" />
                              Assign Staff
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="w-[150px] align-top">
                          <div className="flex flex-col gap-1">
                            <Badge variant={route.orderCount > 0 ? "outline" : "secondary"}>
                              {route.orderCount} orders
                            </Badge>
                            {route.refundCount > 0 && (
                              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                                {route.refundCount} returns
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-[250px] align-top">
                          {(() => {
                            // Only show link controls if assigned
                            if (!route.isAssigned) {
                              return <span className="text-xs text-muted-foreground italic">Assign staff first</span>;
                            }

                            // Check if this is a future date first
                            if (!isActive && !isToday) {
                              return (
                                <span className="text-xs text-muted-foreground italic flex items-center">
                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                  Available on delivery date
                                </span>
                              );
                            }

                            // If 0 orders AND 0 refunds (regardless of whether route record exists), don't show generate button
                            if (isActive && !route.token && route.orderCount === 0 && (!route.refundCount || route.refundCount === 0)) {
                              return <span className="text-xs text-muted-foreground italic tracking-tight">No orders or refunds for link</span>;
                            }

                            const isCopied = copiedRoutes[route.id];
                            const isGen = isGenerating[route.id];

                            return (
                              <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {isExpired ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground italic font-medium flex items-center px-2 py-1">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Link Expired
                                      </span>
                                    </div>
                                  ) : route.token ? (
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 py-1 font-medium whitespace-nowrap">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Link Generated
                                      </Badge>
                                      {hasPermission('copy_route_links') && (
                                        <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                                        onClick={(e) => { e.stopPropagation(); handleCopyLink(route); }}
                                        title="Copy Link"
                                      >
                                        <Copy className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  ) : hasPermission('generate_route_links') ? (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); generateToken(route); }}
                                      className={cn(
                                        "text-xs bg-primary hover:bg-primary/90 whitespace-nowrap",
                                        isGen && "opacity-70"
                                      )}
                                      disabled={isGen}
                                    >
                                      {isGen ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="h-3 w-3 mr-1" />
                                          Generate Link
                                        </>
                                      )}
                                    </Button>
                                  ) : null}

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-gray-600 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHistoryRoute(route);
                                      setShowHistoryDialog(true);
                                    }}
                                    title="View Full History"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Mini Logs Below */}
                                {route.tokenLogs && route.tokenLogs.length > 0 && (
                                  <div className="space-y-1 w-full">
                                    {route.tokenLogs.slice(0, 3).map((log, idx) => (
                                      <div key={idx} className="text-[10px] text-muted-foreground flex items-center justify-between gap-2 border-l-2 border-primary/20 pl-2">
                                        <span className="font-medium truncate max-w-[80px]">
                                          {log.action === 'GENERATED' ? 'Generated' : 'Copied'}
                                        </span>
                                        <span className="whitespace-nowrap">
                                          {formatInTimeZone(new Date(log.generatedAt), 'Asia/Kolkata', 'hh:mm:ss a')}
                                        </span>
                                      </div>
                                    ))}
                                    {route.tokenLogs.length > 3 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setHistoryRoute(route); setShowHistoryDialog(true); }}
                                        className="text-[10px] text-primary hover:underline font-medium block"
                                      >
                                        View More (+{route.tokenLogs.length - 3})
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground mr-2">
                Showing {Math.min(routes.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(routes.length, currentPage * itemsPerPage)} of {routes.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Staff - {format(assignFormData.date, "PPP")}</DialogTitle>
            <DialogDescription>
              Assign a delivery staff to <strong>{selectedRoute?.name}</strong> for this date.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit}>
            <div className="space-y-4 py-4">
              {/* Date Field - Read Only for now as we are assigning for the VIEW's selected date essentially, 
                          but user can change it if they want to assign for future? 
                          Actually let's keep it tied to the view date for simplicity to avoid confusion. */}
              <div className="space-y-2">
                <Label>Target Date</Label>
                <div className="p-2 border rounded-md bg-muted text-sm disabled">
                  {format(assignFormData.date, "PPP")}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Delivery Staff</Label>
                <Popover open={isStaffPopoverOpen} onOpenChange={setIsStaffPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      {assignFormData.deliveryBoyId
                        ? deliveryBoys.find(db => db.id === assignFormData.deliveryBoyId)?.name || "Select delivery staff"
                        : "Select delivery staff"
                      }
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="mr-2 h-4 w-4 opacity-50" />
                      <input
                        className="flex h-9 w-full bg-transparent outline-none text-sm"
                        placeholder="Search staff..."
                        value={staffSearchTerm}
                        onChange={(e) => setStaffSearchTerm(e.target.value)}
                      />
                    </div>
                    <div
                      className="max-h-[200px] overflow-y-auto p-1"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {deliveryBoys
                        .filter(db => db.name.toLowerCase().includes(staffSearchTerm.toLowerCase()))
                        .map((db) => (
                          <div
                            key={db.id}
                            className={cn(
                              "flex select-none items-center rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors",
                              !db.active && "opacity-50 pointer-events-none"
                            )}
                            onClick={() => {
                              setAssignFormData({ ...assignFormData, deliveryBoyId: db.id });
                              setIsStaffPopoverOpen(false);
                              setStaffSearchTerm('');
                            }}
                          >
                            <div className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center border rounded-sm transition-colors",
                              assignFormData.deliveryBoyId === db.id ? "bg-primary border-primary text-white" : "border-muted-foreground/30"
                            )}>
                              {assignFormData.deliveryBoyId === db.id && <Check className="h-3 w-3" />}
                            </div>
                            <div className="flex flex-col">
                              <span>{db.name} {db.onLeave ? '(On Leave)' : ''}</span>
                            </div>
                          </div>
                        ))}
                      {deliveryBoys.filter(db => db.name.toLowerCase().includes(staffSearchTerm.toLowerCase())).length === 0 && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No delivery staff found.
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isAssignSubmitting}>
                {isAssignSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Assignment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Route Activity History</DialogTitle>
            <DialogDescription>
              Logs for <strong>{historyRoute?.name}</strong> on {historyRoute ? formatDate(historyRoute.date) : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[300px] overflow-y-auto">
            {(() => {
              const logs = getRouteHistoryLogs(historyRoute);
              if (logs.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground italic">
                    No activity logs found for this route.
                  </div>
                );
              }
              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">
                          {formatInTimeZone(new Date(log.generatedAt), 'Asia/Kolkata', 'MMM dd, yyyy hh:mm:ss a')}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge 
                            variant={log.action === 'SUBMITTED' ? 'default' : log.action === 'GENERATED' ? 'secondary' : 'outline'} 
                            className={cn(
                              "text-[10px]", 
                              log.action === 'SUBMITTED' && "bg-green-600 hover:bg-green-600 text-white font-bold"
                            )}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redistribution Confirmation Dialog */}
      <Dialog open={showRedistributeConfirm} onOpenChange={setShowRedistributeConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="h-5 w-5 text-blue-600" />
              Confirm Redistribution
            </DialogTitle>
            <DialogDescription className="py-2">
              Are you sure you want to move <strong>{selectedOrderIds.size}</strong> order{selectedOrderIds.size !== 1 ? 's' : ''} to <strong>{routes.find(r => r.id === pendingTargetRouteId)?.name || 'the selected route'}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowRedistributeConfirm(false); setPendingTargetRouteId(null); }}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={executeRedistribution}>
              Confirm Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Orders Dialog */}
      <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
        <DialogContent className="max-w-[80vw] sm:max-w-[80vw] w-[80vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b flex flex-row items-start justify-between pr-12">
            <div>
              <DialogTitle className="text-xl">Orders for {ordersDialogRoute?.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                {ordersDialogRoute && format(new Date(ordersDialogRoute.date), 'PPP')}
                {selectedRouteOrders.length > 0 && ` • ${selectedRouteOrders.length} Order${selectedRouteOrders.length !== 1 ? 's' : ''}`}
                {selectedRouteOrders.some(o => o.sequence === 0) && selectedRouteOrders.some(o => o.sequence > 0) && (
                  <Badge variant="destructive" className="animate-pulse bg-amber-500 hover:bg-amber-600 border-none ml-2">
                    <RefreshCcw className="h-3 w-3 mr-1" />
                    Re-optimization Required
                  </Badge>
                )}
              </DialogDescription>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg border shadow-sm mt-0 relative top-[-4px]">
              <button 
                onClick={() => setOrdersViewMode('list')} 
                className={cn("flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all", ordersViewMode === 'list' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
              >
                <List className="h-4 w-4" /> List
              </button>
              <button 
                onClick={() => setOrdersViewMode('map')} 
                className={cn("flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all", ordersViewMode === 'map' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
              >
                <MapIcon className="h-4 w-4" /> Map
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-0 pt-0 bg-slate-50/30">
            {ordersViewMode === 'map' ? (
              <div className="p-6 h-[500px]">
                <RouteMap hubLocation={hubLocation} orders={selectedRouteOrders} />
              </div>
            ) : isLoadingOrders ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : selectedRouteOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <p>No orders found for this route.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-10 px-0"></TableHead>
                      <TableHead className="w-10 px-0">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className={cn(
                              "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                              ordersDialogRoute?.token ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            )}
                            checked={selectedRouteOrders.length > 0 && selectedOrderIds.size === selectedRouteOrders.length}
                            onChange={toggleSelectAll}
                            disabled={!!ordersDialogRoute?.token}
                          />
                        </div>
                      </TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[110px]">Order Info</TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[170px]">Customer</TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[350px]">Address</TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[150px]">Product Details</TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[170px] text-center">Payment Type</TableHead>
                      <TableHead className="font-semibold text-slate-900 h-11 w-[140px]">Staff / Route</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRouteOrders.map((order, index) => {
                      const totalQty = order.items?.reduce((sum, item) => sum + item.quantity, 0) || order.quantity;
                      const isDragging = draggedIndex === index;
                      const isDragOver = dragOverIndex === index;

                      return (
                        <TableRow
                          key={order.id}
                          draggable={!isSavingSort && !!ordersDialogRoute?.routeId && !ordersDialogRoute?.token}
                          onDragStart={(e) => onDragStart(e, index)}
                          onDragOver={(e) => onDragOver(e, index)}
                          onDragEnd={onDragEnd}
                          onDrop={(e) => onDrop(e, index)}
                          className={cn(
                            "hover:bg-slate-50/50 transition-all duration-200",
                            isDragging && "opacity-40 bg-slate-100",
                            isDragOver && "border-t-2 border-t-blue-500 bg-blue-50/30",
                            highlightedOrderId === order.id && "bg-yellow-40 ring-2 ring-yellow-400 ring-inset shadow-sm",
                            ordersDialogRoute?.token && "cursor-not-allowed opacity-80"
                          )}
                        >
                          <TableCell className="py-4 w-10 text-center px-0">
                            <div className={cn(
                              "flex items-center justify-center text-slate-300 transition-colors",
                              (ordersDialogRoute?.routeId && !ordersDialogRoute?.token) ? "cursor-grab active:cursor-grabbing hover:text-slate-500" : "opacity-50"
                            )}>
                              <GripVertical className="h-5 w-5" />
                            </div>
                          </TableCell>
                          <TableCell className="py-4 w-10 text-center px-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                className={cn(
                                  "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                                  ordersDialogRoute?.token ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                                )}
                                checked={selectedOrderIds.has(order.id)}
                                onChange={() => toggleOrderSelection(order.id)}
                                disabled={!!ordersDialogRoute?.token}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-slate-900">#{order.orderNumber || 'PENDING'}</span>
                              <span className="text-[13px] text-slate-500 font-medium break-words">
                                {order.createdAtIST?.split(', ')[0] || (order.createdAt && format(new Date(order.createdAt), 'dd/MM/yy')) || 'N/A'}
                              </span>
                              <span className="text-[13px] text-slate-400 break-words">
                                {order.createdAtIST?.split(', ')[1] || (order.createdAt && format(new Date(order.createdAt), 'hh:mm a')) || ''}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4 whitespace-normal max-w-[170px]">
                            <div className="flex flex-col gap-0.5 break-words">
                              <span className="font-bold text-slate-900 leading-tight">{order.customer.name}</span>
                              <span className="text-[13px] text-slate-500">{order.customer.phone}</span>
                              {(!order.address.latitude || !order.address.longitude) && (
                                <Badge variant="destructive" className="mt-1 w-fit text-[10px] py-0 px-1 bg-red-100 text-red-600 border-red-200 hover:bg-red-100">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  No GPS
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4 max-w-[350px] whitespace-normal">
                            <div className="flex flex-col gap-0.5 text-[13px] text-slate-500 break-words">
                              <span className="font-medium leading-tight">{order.address.line1}</span>
                              {order.address.line2 && <span className="leading-tight">{order.address.line2}</span>}
                              {order.address.landmark && (
                                <span className="leading-tight italic text-slate-400">Near {order.address.landmark}</span>
                              )}
                              <span className="leading-tight">{order.address.area}, {order.address.city} - {order.address.pincode}</span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4 max-w-[150px] whitespace-normal">
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1.5">
                                {order.items && order.items.length > 0 ? (
                                  order.items.map((item, idx) => (
                                    <div key={idx} className="text-[13px] font-semibold text-slate-800">
                                      {item.productName} : {item.quantity}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[13px] font-semibold text-slate-800">
                                    {order.productName || 'Water Can'} : {order.quantity}
                                  </div>
                                )}
                              </div>
                              <div className="text-[13px] font-medium text-slate-500">
                                Qty: <span className="text-slate-900">{totalQty}</span> | <span className="font-bold text-slate-900">₹{Math.ceil(Number(order.amount))}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge
                                variant="outline"
                                className="font-semibold text-[11px] px-2.5 py-0.5 border-slate-200 text-slate-600 bg-white rounded-full uppercase"
                              >
                                {order.paymentMethod === 'ONLINE' ? 'Card / UPI' : order.paymentMethod}
                              </Badge>
                              {order.isQrPayment && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-[9px] py-0 px-1.5 h-4 uppercase font-bold">
                                  QR Paid
                                </Badge>
                              )}
                            </div>
                            {(!order.address?.latitude || !order.address?.longitude) && (
                              <div className="mt-2 text-[10px] text-red-500 font-medium italic">Missing Pin</div>
                            )}
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="flex flex-col gap-0.5 break-words">
                              <span className="font-bold text-slate-900 leading-tight">{order.deliveryBoyName || 'Not Assigned'}</span>
                              {order.routeName && (
                                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">{order.routeName}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {selectedOrderIds.size > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 mr-2">
                  <span className="text-sm font-bold text-blue-700">{selectedOrderIds.size} Selected</span>
                  <div className="h-4 w-[1px] bg-blue-200 mx-1" />
                {hasPermission('change_order_route') && (
                  <Select onValueChange={handleMoveOrders} disabled={isRedistributing || !!ordersDialogRoute?.token}>
                    <SelectTrigger className="h-8 w-[180px] text-xs bg-white border-blue-200 focus:ring-blue-500">
                      <SelectValue placeholder={ordersDialogRoute?.token ? "Locked (Link Generated)" : "Move to Route..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {routes
                        .filter(r => r.id !== ordersDialogRoute?.id && !r.token)
                        .map(r => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.name} ({r.deliveryBoyName || 'No Staff'})
                          </SelectItem>
                        ))
                      }
                      {routes.filter(r => r.id !== ordersDialogRoute?.id && !r.token).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground italic">No other available routes</div>
                      )}
                    </SelectContent>
                  </Select>
                )}
                </div>
              )}
              {hasUnsavedSort && (
                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                  Unsaved Changes
                </Badge>
              )}
              {ordersDialogRoute?.token ? (
                <span className="text-xs text-muted-foreground italic">
                  <span className="text-red-500">*</span> Sorting is disabled (Link Generated)
                </span>
              ) : !ordersDialogRoute?.routeId ? (
                <span className="text-xs text-muted-foreground italic">
                  <span className="text-red-500">*</span> Sorting is disabled
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOptimizePath}
                disabled={isOptimizing || !ordersDialogRoute?.routeId || ordersDialogRoute?.token || selectedRouteOrders.some(o => !o.address.latitude || !o.address.longitude)}
                className={cn(
                  "transition-all duration-300",
                  selectedRouteOrders.some(o => o.sequence === 0) && selectedRouteOrders.some(o => o.sequence > 0)
                    ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700 hover:border-amber-700 shadow-md ring-2 ring-amber-200"
                    : "text-blue-600 border-blue-200 hover:bg-blue-50",
                  selectedRouteOrders.some(o => !o.address.latitude || !o.address.longitude) && "opacity-50 cursor-not-allowed border-red-200 text-red-400"
                )}
                title={selectedRouteOrders.some(o => !o.address.latitude || !o.address.longitude) ? "All orders must have GPS coordinates to optimise" : "Auto-Optimise Path"}
              >
                {isOptimizing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : selectedRouteOrders.some(o => o.sequence === 0) && selectedRouteOrders.some(o => o.sequence > 0) ? (
                  <RefreshCcw className="h-4 w-4 mr-2" />
                ) : (
                  <Shuffle className="h-4 w-4 mr-2" />
                )}
                {selectedRouteOrders.some(o => o.sequence === 0) && selectedRouteOrders.some(o => o.sequence > 0) ? "Re-Optimise Path" : "Auto-Optimise Path"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowOrdersDialog(false)}
                disabled={isSavingSort}
              >
                Close
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSaveSort}
                disabled={!hasUnsavedSort || isSavingSort || ordersDialogRoute?.token || !ordersDialogRoute?.routeId}
              >
                {isSavingSort ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : ordersDialogRoute?.token ? (
                  'Save'
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHubDialog} onOpenChange={setShowHubDialog}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <MapPin className="h-5 w-5 text-blue-500" />
              Shop / Hub Location
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              Set the starting and ending point for route optimization.
            </DialogDescription>
          </DialogHeader>
          <div className="w-full relative px-6 py-2">
            <div className="w-full rounded-md overflow-hidden border shadow-inner relative">
               {hubLocation && (
                  <MapPicker 
                     value={hubLocation} 
                     onChange={(lat, lng) => setHubLocation({lat, lng})} 
                  />
               )}
            </div>
          </div>
          <DialogFooter className="p-4 border-t bg-slate-50/50 mt-2">
            <Button variant="outline" onClick={() => setShowHubDialog(false)}>Cancel</Button>
            <Button 
               className="bg-[#0095B6] hover:bg-[#007b99] text-white" 
               onClick={saveHubLocation}
               disabled={isSavingHub}
            >
               {isSavingHub ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
               Save Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOptimizePrompt} onOpenChange={setShowOptimizePrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Optimize Route?</DialogTitle>
            <DialogDescription>
              <strong>{routeToOptimize?.name}</strong> has <strong>{routeToOptimize?.unoptimizedCount}</strong> unoptimized order(s).
              Would you like to automatically optimize the path before generating the link?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOptimizePrompt(false)} disabled={isAutoOptimizing}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConfirmOptimizeAndGenerate} disabled={isAutoOptimizing}>
              {isAutoOptimizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shuffle className="h-4 w-4 mr-2" />}
              Optimize & Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
