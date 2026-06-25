'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '../../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Loader2, Eye, ChevronLeft, ChevronRight, Clock, User, Package, Phone, MapPin, Calendar, CreditCard, Activity, LayoutGrid, Filter, ChevronsUpDown, RotateCcw, Search } from 'lucide-react';
import { adminFetch } from '../../../lib/admin-api';
import toast from 'react-hot-toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';

const CATEGORIES = {
    all: "All Resources",
    order: "Orders",
    route: "Routes",
    customer: "Customers",
    master_data: "Master Data",
    system: "System & Settings"
};

const EVENT_OPTIONS_BY_CATEGORY = {
    all: {
        all: "All Events"
    },
    order: {
        all: "All Order Events",
        reassign: "Order Reassignment",
        reschedule: "Order Reschedule",
        cancel_order: "Order Cancellation",
        edit_address: "Address Edit"
    },
    route: {
        all: "All Route Events",
        link_generated: "Link Generated",
        link_copied: "Link Copied",
        redistribution: "Bulk Order Assignment (Redistribution)",
        delivery_staff_change: "Delivery Staff Change"
    },
    customer: {
        all: "All Customer Events",
        customer_profile: "Customer Profile Updates",
        refund_action: "Refund Approvals & Rejections"
    },
    master_data: {
        all: "All Master Data Events",
        products: "Products",
        routes: "Service Routes",
        service_areas: "Service Areas",
        delivery_reason: "Delivery Reasons",
        delivery_staff: "Delivery Staff"
    },
    system: {
        all: "All System Events",
        login: "Admin Login",
        hub_location: "Hub Location Settings",
        cutoff_settings: "Adjust Cut-off",
        holiday_settings: "Holiday Settings",
        support_contacts: "Support Contacts",
        user_settings: "User Settings",
        role_settings: "Role Settings"
    }
};

const ENTITY_LABELS = {
    ROUTE: 'Delivery Route',
    DELIVERY_BOY: 'Delivery Staff',
    DELIVERY_STAFF: 'Delivery Staff',
    SERVICE_ROUTE: 'Service Route',
    SERVICE_AREA: 'Service Area',
    PRODUCT: 'Product Inventory',
    ADMIN: 'Admin User',
    ADMIN_ROLE: 'Security Role',
    HOLIDAY: 'Holiday Settings',
    NOT_DELIVERED_REASON: 'Delivery Reasons',
    FAILURE_REASON: 'Delivery Reasons',
    SUPPORT_CONTACT: 'Support Contacts',
    SYSTEM_CONFIG: 'System Configurations',
    SYSTEM_SETTING: 'System Settings',
    CUSTOMER: 'Customer Profile',
    ORDER: 'Order',
    SESSION: 'User Session'
};

const ACTION_LABELS = {
    LOGIN: 'Signed In',
    LOGOUT: 'Signed Out',
    READ: 'Viewed',
    CREATE: 'Created',
    UPDATE: 'Modified',
    DELETE: 'Removed',
    APPROVE_DEPOSIT_REFUND: 'Approved Refund',
    REJECT_DEPOSIT_REFUND: 'Rejected Refund',
    TOKEN_GENERATED: 'Generated Link'
};

const DIFF_KEY_LABELS = {
    'address.line1': 'Street Address',
    'address.line2': 'Address Line 2',
    'address.area': 'Area/Locality',
    'address.city': 'City',
    'address.pincode': 'Pincode',
    'address.nickname': 'Address Nickname',
    'address.contactName': 'Contact Name',
    'address.contactPhone': 'Contact Phone',
    'driverId': 'Assigned Driver',
    'deliveryBoyId': 'Assigned Driver',
    'currentDeliveryBoyId': 'Assigned Driver',
    'deliveryBoy': 'Delivery Staff',
    'status': 'Status',
    'scheduledDate': 'Scheduled Date',
    'quantity': 'Quantity',
    'totalAmount': 'Total Amount',
    'paymentStatus': 'Payment Status',
    'walletBalance': 'Wallet Balance',
    'name': 'Name',
    'phone': 'Phone Number',
    'email': 'Email Address',
    'isVerified': 'Verification Status',
    'price': 'Price',
    'stock': 'Stock Count',
    'description': 'Description',
    'routeName': 'Route Name',
    'deliveryBoyName': 'Delivery Staff Name',
    'areaName': 'Area Name',
    'hubLocation.lat': 'Latitude',
    'hubLocation.lng': 'Longitude',
    'cutOffTime': 'Cut Off Time',
    'roleName': 'Role',
    'updatedAt': 'Updated At',
    'createdAt': 'Created At',
};

const getDiffKeyLabel = (key) => {
    const cleanKey = key.replace(/^(address|order|customer|product|route|role)\./, '');
    if (DIFF_KEY_LABELS[key]) return DIFF_KEY_LABELS[key];
    if (DIFF_KEY_LABELS[cleanKey]) return DIFF_KEY_LABELS[cleanKey];
    return cleanKey
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
};

const formatDiffValue = (key, val) => {
    if (val === null || val === undefined) {
        return <span className="text-gray-400 italic">empty</span>;
    }
    if (Array.isArray(val)) {
        if (val.length === 0) {
            return <span className="text-gray-400 italic">none</span>;
        }
        // Render permission arrays as badges
        if (key === 'permissions' || key.endsWith('.permissions')) {
            return (
                <div className="flex flex-wrap gap-1 mt-1">
                    {val.map(p => (
                        <span key={p} className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/20">
                            {p === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                    ))}
                </div>
            );
        }
        return <span className="text-gray-800 break-all">{val.join(', ')}</span>;
    }
    if (typeof val === 'string' && val.trim() === '') {
        return <span className="text-gray-400 italic">empty</span>;
    }
    if (typeof val === 'boolean') {
        return (
            <Badge 
                variant="outline" 
                className="bg-gray-50 text-gray-700 border-gray-200 rounded-full font-bold px-2 py-0.5 text-[10px] shadow-none"
            >
                {val ? "Yes" : "No"}
            </Badge>
        );
    }

    const cleanKey = key.toLowerCase();

    if (cleanKey.includes('price') || cleanKey.includes('amount') || cleanKey.includes('balance') || cleanKey.includes('deposit')) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
            return <span className="font-semibold text-gray-900">₹{num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
        }
    }

    if ((cleanKey.includes('date') || cleanKey.endsWith('at')) && !cleanKey.endsWith('lat') && !cleanKey.endsWith('lng')) {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
            const isDateOnly = cleanKey.includes('date');
            return (
                <span className="text-gray-700">
                    {date.toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        ...(isDateOnly ? {} : { hour: '2-digit', minute: '2-digit', hour12: true })
                    })}
                </span>
            );
        }
    }

    return <span className="text-gray-800 break-all">{String(val)}</span>;
};

const formatDescriptionText = (log) => {
    if (!log) return '';
    let desc = log.description || '';
    if (desc === 'Generated new delivery tracking link for route') {
        return 'Generated route link';
    }
    if (desc === 'Copied delivery tracking link') {
        return 'Copied route link';
    }
    if (log.entity === 'SYSTEM_SETTING' && (log.entityId === 'SAME_DAY_CUTOFF_HOUR' || log.entityId === 'SAME_DAY_CUTOFF_MINUTE' || log.entityId === 'CUT_OFF_TIME')) {
        return 'Admin updated the cut off time';
    }
    if (log.entity === 'ROUTE' && desc.toLowerCase().startsWith('reassigned')) {
        const reassignmentMatch = desc.match(/^Reassigned\s+(.*?)\s+from\s+(.*?)\s+to\s+(.*?)\.?$/i);
        if (reassignmentMatch) {
            return `${reassignmentMatch[1]} delivery staff changed from ${reassignmentMatch[2]} to ${reassignmentMatch[3]}.`;
        }
    }
    if (log.entity === 'ROUTE' && desc.toLowerCase().startsWith('created new daily route')) {
        const creationMatch = desc.match(/^Created\s+new\s+daily\s+route\s+for\s+(.*?)\s+and\s+assigned\s+to\s+(.*?)\.?$/i);
        if (creationMatch) {
            return `${creationMatch[2]} assigned for ${creationMatch[1]}.`;
        }
    }
    return desc;
};

const formatLogDescription = (log) => {
    if (!log) return '';
    let desc = formatDescriptionText(log);
    if (log.entity === 'ORDER' && log.orderNumber) {
        if (desc.toLowerCase().endsWith('for order')) {
            desc = `${desc} #${log.orderNumber}`;
        } else if (!desc.includes(log.orderNumber)) {
            desc = `${desc} (Order #${log.orderNumber})`;
        }
    }
    return desc;
};

const getInitials = (name) => {
    if (!name) return 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
};

const isLinkGeneratedEvent = (log) => {
    if (!log) return false;
    const desc = log.description?.toLowerCase() || '';
    return log.action === 'TOKEN_GENERATED' || 
           log.newData?.action === 'TOKEN_GENERATED' ||
           desc.includes('generated new delivery tracking link') ||
           desc.includes('generated route link');
};

const isLinkCopiedEvent = (log) => {
    if (!log) return false;
    const desc = log.description?.toLowerCase() || '';
    return log.newData?.action === 'TOKEN_COPIED' || 
           desc.includes('copied delivery tracking link') ||
           desc.includes('copied tracking link') ||
           desc.includes('copied route link');
};

const isLinkEvent = (log) => {
    return isLinkGeneratedEvent(log) || isLinkCopiedEvent(log);
};

const isRedistributionEvent = (log) => {
    if (!log) return false;
    const desc = log.description?.toLowerCase() || '';
    return desc.includes('redistributed') || desc.includes('redistribution');
};

const getActionLabel = (log) => {
    if (!log) return '';
    if (isLinkGeneratedEvent(log)) return 'Link Generated';
    if (isLinkCopiedEvent(log)) return 'Link Copied';
    return ACTION_LABELS[log.action] || log.action;
};

const getActionBadgeClass = (action, log) => {
    const lower = isLinkEvent(log) ? 'token_generated' : (action?.toLowerCase() || '');
    if (lower === 'create' || lower === 'read' || lower === 'approve_deposit_refund') {
        return 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200/50 dark:border-green-800/30';
    }
    if (lower === 'update' || lower === 'edit' || lower === 'login' || lower === 'token_generated') {
        return 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/30';
    }
    if (lower === 'delete' || lower === 'reject_deposit_refund') {
        return 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200/50 dark:border-red-800/30';
    }
    return 'bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200/50 dark:border-gray-700/50';
};

export default function AuditLogsPage() {
    const [activeTab, setActiveTab] = useState('orders');

    useEffect(() => {
        const savedTab = localStorage.getItem('auditLogsTab');
        if (savedTab) {
            setActiveTab(savedTab);
        }
    }, []);

    const handleTabChange = (value) => {
        setActiveTab(value);
        localStorage.setItem('auditLogsTab', value);
    };

    // Orders Tab State
    const [orders, setOrders] = useState([]);
    const [ordersPage, setOrdersPage] = useState(1);
    const [ordersLimit, setOrdersLimit] = useState(10);
    const [ordersTotal, setOrdersTotal] = useState(0);
    const [ordersTotalPages, setOrdersTotalPages] = useState(1);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [ordersSearch, setOrdersSearch] = useState('');
    const [debouncedOrdersSearch, setDebouncedOrdersSearch] = useState('');

    // Debounce orders search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedOrdersSearch(ordersSearch);
            setOrdersPage(1); // Reset page on new search
        }, 500);
        return () => clearTimeout(handler);
    }, [ordersSearch]);

    // Admin Logs Tab State
    const [adminLogs, setAdminLogs] = useState([]);
    const [adminPage, setAdminPage] = useState(1);
    const [adminLimit, setAdminLimit] = useState(50);
    const [adminTotalPages, setAdminTotalPages] = useState(1);
    const [adminTotal, setAdminTotal] = useState(0);
    const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedEventFilter, setSelectedEventFilter] = useState('all');
    const [admins, setAdmins] = useState([]);
    const [selectedAdminFilter, setSelectedAdminFilter] = useState('all');

    // Dialog States
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [timelineLogs, setTimelineLogs] = useState([]);
    const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

    const [isLogDetailOpen, setIsLogDetailOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    // Helper to flatten nested JSON objects for comparison
    const flattenObject = (obj, prefix = '') => {
        if (!obj) return {};
        return Object.keys(obj).reduce((acc, k) => {
            const pre = prefix.length ? prefix + '.' : '';
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                Object.assign(acc, flattenObject(obj[k], pre + k));
            } else {
                acc[pre + k] = obj[k];
            }
            return acc;
        }, {});
    };

    const formatValue = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-400 italic">null</span>;
        if (typeof val === 'boolean') return <Badge variant={val ? "success" : "secondary"}>{val.toString()}</Badge>;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    const renderDiff = (oldData, newData) => {
        // Special handling for cutoff time logs — combine hour and minute into HH:MM
        if (selectedLog?.entity === 'SYSTEM_SETTING' &&
            (selectedLog?.entityId === 'SAME_DAY_CUTOFF_HOUR' || selectedLog?.entityId === 'SAME_DAY_CUTOFF_MINUTE')) {
            const oldVal = oldData?.value;
            const newVal = newData?.value;
            if (oldVal === undefined && newVal === undefined) {
                return <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-md border border-gray-100">No structural data changes recorded in this action payload.</div>;
            }
            const isHour = selectedLog?.entityId === 'SAME_DAY_CUTOFF_HOUR';
            // We only have one part (hour or minute), display as partial time
            const oldTime = oldVal !== undefined ? (isHour ? `${String(oldVal).padStart(2,'0')}:__` : `__:${String(oldVal).padStart(2,'0')}`) : null;
            const newTime = newVal !== undefined ? (isHour ? `${String(newVal).padStart(2,'0')}:__` : `__:${String(newVal).padStart(2,'0')}`) : null;
            if (oldVal === newVal || (oldVal !== undefined && newVal !== undefined && String(oldVal) === String(newVal))) {
                return <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-md border border-gray-100">No change recorded — value remained the same.</div>;
            }
            return (
                <div className="space-y-1.5 p-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-gray-700 py-0.5">
                        <span className="font-semibold text-gray-800">Cut Off {isHour ? 'Hour' : 'Minute'} :</span>
                        <span className="text-gray-600">{oldVal !== undefined ? <span className="text-gray-800">{String(oldVal).padStart(2,'0')}</span> : <span className="text-gray-400 italic">not set</span>}</span>
                        <span className="text-gray-400 font-medium px-0.5">→</span>
                        <span className="font-semibold text-gray-800">{String(newVal).padStart(2,'0')}</span>
                    </div>
                </div>
            );
        }
        const oldFlat = flattenObject(oldData);
        const newFlat = flattenObject(newData);
        const allKeys = Array.from(new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])).sort();

        const changes = allKeys.filter(key => JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key]));

        if (changes.length === 0) {
            return (
                <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-md border border-gray-100">
                    No structural data changes recorded in this action payload.
                </div>
            );
        }

        const desc = selectedLog?.description || '';
        const redistributionMatch = desc.match(/(?:redistributed\s+\d+\s+orders|reassigned\s+order)\s+from\s+(Route\s+\d+|[a-zA-Z0-9\s]+)\s+to\s+(Route\s+\d+|[a-zA-Z0-9\s]+)/i);
        // Treat as "create" if action is CREATE, or if oldData is entirely null (first-time set)
        const isCreateAction = selectedLog?.action === 'CREATE' || oldData === null || oldData === undefined;

        const visibleChanges = changes.map((key) => {
            const hasOld = oldFlat[key] !== undefined;
            const hasNew = newFlat[key] !== undefined;

            // Special rendering for permissions arrays — show added/removed badges
            if (key === 'permissions' && Array.isArray(oldFlat[key]) && Array.isArray(newFlat[key])) {
                const oldPerms = new Set(oldFlat[key]);
                const newPerms = new Set(newFlat[key]);
                const added = newFlat[key].filter(p => !oldPerms.has(p));
                const removed = oldFlat[key].filter(p => !newPerms.has(p));
                if (added.length === 0 && removed.length === 0) return null;
                return (
                    <div key={key} className="space-y-3 py-1">
                        {added.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">✓ Permissions Added ({added.length})</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {added.map(p => (
                                        <span key={p} className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                            {p === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {removed.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1.5">✕ Permissions Removed ({removed.length})</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {removed.map(p => (
                                        <span key={p} className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                                            {p === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }

            if (key === 'updatedAt' || key === 'createdAt' || key.endsWith('.updatedAt') || key.endsWith('.createdAt')) return null;
            if ((key.endsWith('.id') || key.endsWith('At')) && !hasOld) return null;

            const oldRaw = oldFlat[key];
            const newRaw = newFlat[key];

            // If it is description, skip if empty/null/undefined
            if (key === 'description' || key.endsWith('.description')) {
                if (newRaw === null || newRaw === undefined || String(newRaw).trim() === '') {
                    return null;
                }
            }

            // Skip empty fields on creation
            if (isCreateAction) {
                if (newRaw === null || newRaw === undefined || String(newRaw).trim() === '') {
                    return null;
                }
            }

            // For UPDATE actions: only show fields that actually changed
            if (!isCreateAction) {
                // Skip if old value was not present in the original data (not a tracked field)
                if (!hasOld) return null;
                // Skip if old and new are identical (no real change)
                const oldStr = oldRaw === null || oldRaw === undefined ? '' : String(oldRaw);
                const newStr = newRaw === null || newRaw === undefined ? '' : String(newRaw);
                if (oldStr === newStr) return null;
            }



            let label = getDiffKeyLabel(key);
            let oldVal = hasOld ? formatDiffValue(key, oldRaw) : <span className="text-gray-400 italic">not set</span>;
            let newVal = hasNew ? formatDiffValue(key, newRaw) : <span className="text-gray-400 italic">removed</span>;

            // For system settings, use the entityId as the label instead of the generic 'value' key
            if (key === 'value' && selectedLog?.entity === 'SYSTEM_SETTING' && selectedLog?.entityId) {
                label = selectedLog.entityId
                    .replace(/_/g, ' ')
                    .toLowerCase()
                    .replace(/\b\w/g, c => c.toUpperCase());
            }

            if (key.endsWith('targetRouteId') && redistributionMatch) {
                label = 'Route';
                oldVal = <span className="text-gray-800 break-all">{redistributionMatch[1]}</span>;
                newVal = <span className="text-gray-800 break-all">{redistributionMatch[2]}</span>;
            }

            if (isCreateAction) {
                return (
                    <div key={key} className="flex flex-wrap items-center gap-1.5 text-gray-700 py-0.5">
                        <span className="font-semibold text-gray-800">{label} :</span>
                        <span className="font-semibold text-gray-800">{newVal}</span>
                    </div>
                );
            }

            return (
                <div key={key} className="flex flex-wrap items-center gap-1.5 text-gray-700 py-0.5">
                    <span className="font-semibold text-gray-800">{label} :</span>
                    <span className="text-gray-600">{oldVal}</span>
                    <span className="text-gray-400 font-medium px-0.5">→</span>
                    <span className="font-semibold text-gray-800">{newVal}</span>
                </div>
            );
        }).filter(Boolean);

        if (visibleChanges.length === 0) {
            return (
                <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-md border border-gray-100">
                    No structural data changes recorded in this action payload.
                </div>
            );
        }

        return (
            <div className="space-y-3 bg-gray-50/50 rounded-xl p-4 border border-gray-100 text-sm">
                {visibleChanges}
            </div>
        );
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    const fetchAdmins = async () => {
        try {
            const res = await adminFetch('/api/admin/admins');
            const data = await res.json();
            if (data.success) {
                setAdmins(data.admins || []);
            }
        } catch (err) {
            console.error('Failed to fetch admins list for filtering:', err);
        }
    };

    useEffect(() => {
        if (activeTab === 'orders') fetchOrders(ordersPage, ordersLimit, debouncedOrdersSearch);
        if (activeTab === 'admin') fetchAdminLogs(adminPage, adminLimit, selectedCategory, selectedEventFilter, selectedAdminFilter);
    }, [activeTab, ordersPage, ordersLimit, debouncedOrdersSearch, adminPage, adminLimit, selectedCategory, selectedEventFilter, selectedAdminFilter]);

    const fetchOrders = async (page, limit, searchStr = '') => {
        setIsLoadingOrders(true);
        try {
            const searchParam = searchStr ? `&search=${encodeURIComponent(searchStr)}` : '';
            const res = await adminFetch(`/api/admin/orders?page=${page}&limit=${limit}${searchParam}`);
            const data = await res.json();
            if (data.success) {
                setOrders(data.orders || []);
                setOrdersTotalPages(data.pagination?.totalPages || 1);
                setOrdersTotal(data.pagination?.total || 0);
            } else {
                toast.error(data.message || 'Failed to fetch orders');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error fetching orders.');
        } finally {
            setIsLoadingOrders(false);
        }
    };

    const fetchAdminLogs = async (page, limit, categoryFilter = selectedCategory, eventFilter = selectedEventFilter, adminFilter = selectedAdminFilter) => {
        setIsLoadingAdmin(true);
        try {
            let url = `/api/admin/audit-logs?page=${page}&limit=${limit}&actorType=ADMIN`;
            if (categoryFilter !== 'all') {
                url += `&category=${categoryFilter}`;
            }
            if (eventFilter !== 'all') {
                url += `&eventType=${eventFilter}`;
            }
            if (adminFilter !== 'all') {
                url += `&actorId=${adminFilter}`;
            }
            const res = await adminFetch(url);
            const data = await res.json();
            if (data.success) {
                setAdminLogs(data.logs || []);
                setAdminTotalPages(data.totalPages || 1);
                setAdminTotal(data.total || 0);
            } else {
                toast.error(data.message || 'Failed to fetch admin logs');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error fetching admin logs.');
        } finally {
            setIsLoadingAdmin(false);
        }
    };

    const handleViewTimeline = async (order) => {
        setSelectedOrder(order);
        setIsTimelineOpen(true);
        setIsLoadingTimeline(true);
        try {
            // Fetch detailed order info
            const orderRes = await adminFetch(`/api/admin/orders/${order.id}`);
            const orderData = await orderRes.json();
            if (orderData.success && orderData.order) {
                setSelectedOrder(orderData.order);
            }

            const res = await adminFetch(`/api/admin/audit-logs?entity=ORDER&entityId=${order.id}&order=asc`);
            const data = await res.json();
            if (data.success) {
                setTimelineLogs(data.logs || []);
            } else {
                toast.error('Failed to fetch order timeline');
            }
        } catch (err) {
            toast.error('Network error fetching timeline.');
        } finally {
            setIsLoadingTimeline(false);
        }
    };

    const handleViewLogDetails = (log) => {
        setSelectedLog(log);
        setIsLogDetailOpen(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const handleResetFilters = () => {
        setSelectedCategory('all');
        setSelectedEventFilter('all');
        setSelectedAdminFilter('all');
        setAdminPage(1);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Audit Logs</h1>
                <p className="text-muted-foreground">Monitor system events and order history</p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b border-gray-200 bg-transparent p-0 h-auto gap-6 mb-6">
                    <TabsTrigger
                        value="orders"
                        className="flex-none w-auto rounded-none border-b-2 border-x-0 border-t-0 border-transparent bg-transparent px-1 pb-3 pt-2 text-sm font-semibold text-gray-500 hover:text-gray-700 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-indigo-400 dark:data-[state=active]:border-indigo-400"
                    >
                        Orders History
                    </TabsTrigger>
                    <TabsTrigger
                        value="admin"
                        className="flex-none w-auto rounded-none border-b-2 border-x-0 border-t-0 border-transparent bg-transparent px-1 pb-3 pt-2 text-sm font-semibold text-gray-500 hover:text-gray-700 data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-indigo-400 dark:data-[state=active]:border-indigo-400"
                    >
                        Admin Logs
                    </TabsTrigger>
                </TabsList>

                {/* --- ORDERS TAB --- */}
                <TabsContent value="orders">
                    <Card>
                        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Recent Orders</CardTitle>
                                <CardDescription>
                                    Track the complete historical lifecycle of customer orders.
                                </CardDescription>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by order #, name, phone, id..."
                                    value={ordersSearch}
                                    onChange={(e) => setOrdersSearch(e.target.value)}
                                    className="pl-9 w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingOrders && orders.length === 0 ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : orders.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    {ordersSearch ? `No orders found for "${ordersSearch}".` : 'No orders found.'}
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-md border relative max-h-[calc(100vh-320px)] overflow-y-auto">
                                        {isLoadingOrders && (
                                            <div className="absolute inset-0 bg-white/50 dark:bg-gray-950/50 flex items-center justify-center z-10">
                                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                            </div>
                                        )}
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-white z-10 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.1)]">
                                                <TableRow className="bg-gray-50 hover:bg-gray-50">
                                                    <TableHead>Order ID</TableHead>
                                                    <TableHead>Customer Name</TableHead>
                                                    <TableHead>Created At</TableHead>
                                                    <TableHead>Current Status</TableHead>
                                                    <TableHead className="text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {orders.map((order) => (
                                                    <TableRow key={order.id}>
                                                        <TableCell className="font-medium">#{order.orderNumber || order.id.slice(-8).toUpperCase()}</TableCell>
                                                        <TableCell>{order.customer?.name || 'Unknown'}</TableCell>
                                                        <TableCell className="text-muted-foreground text-sm">{formatDate(order.createdAt)}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{order.status === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : order.status.replace(/_/g, ' ')}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" onClick={() => handleViewTimeline(order)}>
                                                                <Eye className="w-4 h-4 mr-2" />
                                                                View Timeline
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {ordersTotal > 0 && (
                                        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                                            <Select
                                                value={ordersLimit.toString()}
                                                onValueChange={(value) => {
                                                    setOrdersLimit(parseInt(value));
                                                    setOrdersPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="h-9 w-auto border-none shadow-none hover:bg-muted/50 transition-colors px-2 gap-2 focus:ring-0">
                                                    <div className="text-sm font-medium flex items-center gap-1">
                                                        <span>{Math.min(ordersTotal, (ordersPage - 1) * ordersLimit + 1)}</span>
                                                        <span>-</span>
                                                        <span>{Math.min(ordersTotal, ordersPage * ordersLimit)}</span>
                                                        <span className="mx-1 font-normal text-muted-foreground">of</span>
                                                        <span>{ordersTotal}</span>
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent align="end">
                                                    {[10, 25, 50, 100].map((val) => (
                                                        <SelectItem key={val} value={val.toString()}>
                                                            {val} per page
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Button variant="outline" size="icon" onClick={() => setOrdersPage(p => Math.max(1, p - 1))} disabled={ordersPage <= 1}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium">
                                                Page {ordersPage} of {ordersTotalPages}
                                            </div>
                                            <Button variant="outline" size="icon" onClick={() => setOrdersPage(p => Math.min(ordersTotalPages, p + 1))} disabled={ordersPage >= ordersTotalPages}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- ADMIN ACTIVITY TAB --- */}
                <TabsContent value="admin">
                    <Card className="border border-gray-100 rounded-2xl shadow-xs overflow-hidden bg-white">
                        <CardContent className="p-6">
                            {/* Filter Header Card */}
                            <div className="flex items-start gap-4 mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Admin Logs</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Refine results by event type and admin.</p>
                                </div>
                            </div>

                            {/* Dropdown Selectors */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <Select
                                    value={selectedCategory}
                                    onValueChange={(value) => {
                                        setSelectedCategory(value);
                                        setSelectedEventFilter('all');
                                        setAdminPage(1);
                                    }}
                                >
                                    <SelectTrigger className="flex !h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-xs transition-colors hover:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left font-normal">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <LayoutGrid className="w-5 h-5 text-gray-400 shrink-0" />
                                            <span className="font-semibold text-gray-700 shrink-0">Resource</span>
                                            <span className="text-gray-600 truncate">{CATEGORIES[selectedCategory] || 'All Resources'}</span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(CATEGORIES).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={selectedEventFilter}
                                    onValueChange={(value) => {
                                        setSelectedEventFilter(value);
                                        setAdminPage(1);
                                    }}
                                    disabled={selectedCategory === 'all'}
                                >
                                    <SelectTrigger className="flex !h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-xs transition-colors hover:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left font-normal disabled:opacity-50 disabled:bg-gray-50/50 disabled:cursor-not-allowed">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <Filter className="w-5 h-5 text-gray-400 shrink-0" />
                                            <span className="font-semibold text-gray-700 shrink-0">Event</span>
                                            <span className="text-gray-600 truncate">
                                                {EVENT_OPTIONS_BY_CATEGORY[selectedCategory]?.[selectedEventFilter] || 'All Events'}
                                            </span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(EVENT_OPTIONS_BY_CATEGORY[selectedCategory] || {}).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={selectedAdminFilter}
                                    onValueChange={(value) => {
                                        setSelectedAdminFilter(value);
                                        setAdminPage(1);
                                    }}
                                >
                                    <SelectTrigger className="flex !h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-xs transition-colors hover:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-left font-normal">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <User className="w-5 h-5 text-gray-400 shrink-0" />
                                            <span className="font-semibold text-gray-700 shrink-0">Admin</span>
                                            <span className="text-gray-600 truncate">
                                                {selectedAdminFilter === 'all'
                                                    ? 'All Admins'
                                                    : (admins.find(a => a.id === selectedAdminFilter)?.name || admins.find(a => a.id === selectedAdminFilter)?.username || 'All Admins')}
                                            </span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Admins</SelectItem>
                                        {admins.map((adm) => (
                                            <SelectItem key={adm.id} value={adm.id}>
                                                {adm.name || adm.username}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Button
                                    variant="outline"
                                    onClick={handleResetFilters}
                                    disabled={selectedCategory === 'all' && selectedEventFilter === 'all' && selectedAdminFilter === 'all'}
                                    className="flex !h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white dark:bg-gray-950 px-4 py-3 text-sm text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/30 font-semibold transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed gap-2"
                                >
                                    <RotateCcw className="w-4 h-4 text-gray-500 shrink-0" />
                                    <span>Reset Filters</span>
                                </Button>
                            </div>

                            {isLoadingAdmin ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : adminLogs.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">No admin activity logs found.</div>
                            ) : (
                                <>
                                    <div className="rounded-xl border border-gray-150 bg-white max-h-[calc(100vh-320px)] overflow-y-auto">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-white z-10 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.1)]">
                                                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                                    <TableHead className="w-[15%] font-bold text-xs text-gray-500 tracking-wider text-center">DATE & TIME</TableHead>
                                                    <TableHead className="w-[15%] font-bold text-xs text-gray-500 tracking-wider text-center">ADMIN</TableHead>
                                                    <TableHead className="w-[15%] font-bold text-xs text-gray-500 tracking-wider text-center">RESOURCE</TableHead>
                                                    <TableHead className="w-[15%] font-bold text-xs text-gray-500 tracking-wider text-center">ACTION</TableHead>
                                                    <TableHead className="w-[35%] font-bold text-xs text-gray-500 tracking-wider text-left">DESCRIPTION</TableHead>
                                                    <TableHead className="w-[5%] font-bold text-xs text-gray-500 tracking-wider text-center">DETAILS</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {adminLogs.map((log) => (
                                                    <TableRow key={log.id} className="hover:bg-gray-50/30 transition-colors">
                                                        <TableCell className="whitespace-nowrap text-sm text-gray-600 font-medium text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                                                                <span>{formatDate(log.createdAt)}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {getInitials(log.adminName || log.actorName || log.actorType)}
                                                                </div>
                                                                <div className="flex flex-col text-left">
                                                                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                                                        {log.adminName || log.actorName || log.actorType}
                                                                    </span>
                                                                    {log.adminUsername ? (
                                                                        <span className="text-xs text-gray-500 dark:text-gray-400">@{log.adminUsername}</span>
                                                                    ) : (
                                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                            {log.actorId ? `ID: ${log.actorId.slice(-8).toUpperCase()}` : 'SYSTEM'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex flex-col gap-1 items-center">
                                                                <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-none">
                                                                    {ENTITY_LABELS[log.entity] || log.entity}
                                                                </Badge>
                                                                {log.targetName && 
                                                                    !isRedistributionEvent(log) && 
                                                                    log.entityId !== 'CUT_OFF_TIME' &&
                                                                    !['SERVICE_ROUTE', 'SERVICE_AREA', 'PRODUCT', 'DELIVERY_BOY', 'NOT_DELIVERED_REASON'].includes(log.entity) && (
                                                                    <span className="text-xs text-gray-700 font-semibold text-center">{log.targetName}</span>
                                                                )}
                                                                {log.orderNumber && (
                                                                    <span className="text-xs text-gray-600 font-medium text-center">
                                                                        #{log.orderNumber}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-none ${getActionBadgeClass(log.action, log)}`}>
                                                                {getActionLabel(log)}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="text-sm text-gray-600 dark:text-gray-300 font-medium max-w-[320px] block break-words leading-relaxed whitespace-pre-line text-left">
                                                                {formatDescriptionText(log) || '—'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button variant="outline" size="sm" onClick={() => handleViewLogDetails(log)} className="h-8 px-3 text-indigo-600 hover:text-indigo-700 border-indigo-200 hover:bg-indigo-50/50 transition-colors mx-auto flex">
                                                                <Eye className="h-4 w-4 mr-2" /> View Details
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {adminTotal > 0 && (
                                        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                                            <Select
                                                value={adminLimit.toString()}
                                                onValueChange={(value) => {
                                                    setAdminLimit(parseInt(value));
                                                    setAdminPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="h-9 w-auto border-none shadow-none hover:bg-muted/50 transition-colors px-2 gap-2 focus:ring-0">
                                                    <div className="text-sm font-medium flex items-center gap-1">
                                                        <span>{Math.min(adminTotal, (adminPage - 1) * adminLimit + 1)}</span>
                                                        <span>-</span>
                                                        <span>{Math.min(adminTotal, adminPage * adminLimit)}</span>
                                                        <span className="mx-1 font-normal text-muted-foreground">of</span>
                                                        <span>{adminTotal}</span>
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent align="end">
                                                    {[10, 25, 50, 100].map((val) => (
                                                        <SelectItem key={val} value={val.toString()}>
                                                            {val} per page
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Button variant="outline" size="icon" onClick={() => setAdminPage(p => Math.max(1, p - 1))} disabled={adminPage <= 1}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium">
                                                Page {adminPage} of {adminTotalPages}
                                            </div>
                                            <Button variant="outline" size="icon" onClick={() => setAdminPage(p => Math.min(adminTotalPages, p + 1))} disabled={adminPage >= adminTotalPages}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* --- ORDER TIMELINE DIALOG --- */}
            <Dialog open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
                <DialogContent className="sm:max-w-[90vw] md:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Order Timeline: #{selectedOrder?.orderNumber || selectedOrder?.id?.slice(-8).toUpperCase()}</DialogTitle>
                        <DialogDescription>
                            Complete history from placement to current status.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingTimeline ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
                    ) : selectedOrder ? (
                        <div className="space-y-6 pt-4">
                            {/* --- ORDER DETAILS UI --- */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Customer & Address Column */}
                                <div className="space-y-6">
                                    {/* Customer Information */}
                                    <div>
                                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                                            <User className="h-4 w-4" />
                                            Customer Information
                                        </h3>
                                        <div className="pl-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                {selectedOrder.customer?.id && (
                                                    <div className="items-center gap-2">
                                                        <p className="text-xs text-muted-foreground mb-1">Customer ID:</p>
                                                        <p className="font-mono text-xs font-medium text-foreground">{selectedOrder.customer.id.slice(-8).toUpperCase()}</p>
                                                    </div>
                                                )}
                                                <div className="items-center gap-2">
                                                    <p className="text-xs text-muted-foreground mb-1">Name:</p>
                                                    <p className="font-medium text-sm text-foreground">{selectedOrder.customer?.name || 'N/A'}</p>
                                                </div>
                                                <div className="items-center gap-2">
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                                        <Phone className="h-3 w-3" />
                                                        Phone:
                                                    </p>
                                                    <p className="font-medium text-sm text-foreground">{selectedOrder.customer?.phone || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Delivery Address */}
                                    {selectedOrder.address && (
                                        <div>
                                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                                                <MapPin className="h-4 w-4" />
                                                Delivery Address & Contact
                                            </h3>
                                            <div className="pl-6 flex flex-col gap-4">
                                                {/* Address Details */}
                                                <div className="space-y-0.5">
                                                    <div className="font-medium text-sm text-foreground flex flex-wrap items-start gap-2">
                                                        <span className="break-words">{selectedOrder.address.line1}{selectedOrder.address.line2 && `, ${selectedOrder.address.line2}`}</span>
                                                        {selectedOrder.address.nickname && (
                                                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                                {selectedOrder.address.nickname}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-muted-foreground text-xs">
                                                        {selectedOrder.address.area}, {selectedOrder.address.city} - {selectedOrder.address.pincode}
                                                    </p>
                                                </div>

                                                {/* Contact Info */}
                                                {(selectedOrder.address.contactName || selectedOrder.address.contactPhone) && (
                                                    <div className="flex flex-col sm:flex-row gap-4 border-t pt-3 border-muted-foreground/20">
                                                        {selectedOrder.address.contactName && (
                                                            <div className="flex items-center gap-3 flex-1">
                                                                <div className="p-2 bg-primary/5 rounded-full">
                                                                    <User className="h-4 w-4 text-primary/70" />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider leading-none mb-1">Contact Person</span>
                                                                    <span className="text-sm font-semibold text-foreground">{selectedOrder.address.contactName}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {selectedOrder.address.contactPhone && (
                                                            <div className="flex items-center gap-3 flex-1">
                                                                <div className="p-2 bg-primary/5 rounded-full">
                                                                    <Phone className="h-4 w-4 text-primary/70" />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider leading-none mb-1">Contact Number</span>
                                                                    <span className="text-sm font-semibold text-foreground">{selectedOrder.address.contactPhone}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Order Breakdown Column */}
                                <div>
                                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                                        <Package className="h-4 w-4" />
                                        Order Breakdown
                                    </h3>
                                    <div className="pl-6">
                                        {selectedOrder.items && selectedOrder.items.length > 0 ? (
                                            <div className="border rounded-lg overflow-hidden mb-4">
                                                <div className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 border-b h-auto">
                                                    <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                                        Item List ({selectedOrder.items.length})
                                                    </span>
                                                </div>

                                                <div className="max-h-[350px] overflow-y-auto">
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-muted text-muted-foreground uppercase font-medium">
                                                            <tr>
                                                                <th className="px-3 py-2">Product</th>
                                                                <th className="px-2 py-2 text-center">Qty</th>
                                                                <th className="px-3 py-2 text-right">Price</th>
                                                                <th className="px-3 py-2 text-right">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {selectedOrder.items.map((item, idx) => {
                                                                const itemPrice = item.price || 0;
                                                                const itemTotal = itemPrice * item.quantity;
                                                                return (
                                                                    <tr key={item.id || idx}>
                                                                        <td className="px-3 py-2 font-medium text-foreground">{item.productName}</td>
                                                                        <td className="px-2 py-2 text-center text-foreground">{item.quantity}</td>
                                                                        <td className="px-3 py-2 text-right text-foreground">₹{itemPrice.toFixed(2)}</td>
                                                                        <td className="px-3 py-2 text-right text-foreground font-semibold">₹{itemTotal.toFixed(2)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Subtotal & GST */}
                                                <div className="border-t p-3 space-y-2 bg-muted/20">
                                                    {(() => {
                                                        const subtotal = selectedOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                                        const totalGst = selectedOrder.items.reduce((sum, item) => sum + ((item.price * item.quantity) * ((item.gst || 5.0) / 100)), 0);
                                                        return (
                                                            <>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-foreground">Subtotal</span>
                                                                    <span>₹{subtotal.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-foreground">Total Tax (GST)</span>
                                                                    <span>₹{totalGst.toFixed(2)}</span>
                                                                </div>
                                                                {selectedOrder.depositAmount > 0 && (
                                                                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                                                        <span>Charged Deposit</span>
                                                                        <span>₹{selectedOrder.depositAmount.toFixed(2)}</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Grand Total */}
                                                <div className="bg-muted/50 font-semibold text-foreground px-3 py-2 flex items-center justify-between border-t">
                                                    <span className="uppercase text-[12px]">Grand Total</span>
                                                    <span>₹{selectedOrder.amount ? Math.ceil(Number(selectedOrder.amount)) : 0}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-muted-foreground">No item details available.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <hr className="my-6 border-muted-foreground/20" />

                            {/* --- TIMELINE HISTORY --- */}
                            <div>
                                <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-foreground">
                                    <Clock className="h-4 w-4" />
                                    Tracking History
                                </h3>
                                {timelineLogs.length === 0 ? (
                                    <div className="text-center p-8 text-muted-foreground">No tracking history found for this order.</div>
                                ) : (
                                    <div className="relative border-l border-border ml-3 space-y-6 pb-2">
                                        {timelineLogs.map((log) => {
                                            const status = log.newData?.status || log.action;
                                            const isSuccess = status === 'DELIVERED' || status === 'COMPLETED';
                                            const isFail = status === 'NOT_DELIVERED' || status === 'CANCELLED';
                                            const dotColor = isSuccess ? 'bg-green-500' : isFail ? 'bg-destructive' : 'bg-blue-500';

                                            return (
                                                <div key={log.id} className="relative pl-6">
                                                    <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border border-background shadow-sm ${dotColor}`}></div>

                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1.5 gap-1 sm:gap-4">
                                                        <span className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                                                            {log.action === 'CREATE' ? 'ORDER RECEIVED' : (log.action === 'UPDATE' && log.newData?.paymentStatus === 'SUCCESS') ? 'PAYMENT METHOD UPDATED' : (log.newData?.status === 'OUT_FOR_DELIVERY' ? 'DELIVERY IN PROGRESS' : (log.newData?.status || 'UPDATED').replace(/_/g, ' '))}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                                            <Clock className="w-3 h-3" /> {formatDate(log.createdAt)}
                                                        </span>
                                                    </div>

                                                    <div className="bg-muted/30 border border-border/50 rounded-md p-3 text-[13px] shadow-sm">
                                                        {log.action !== 'CREATE' && !(log.action === 'UPDATE' && log.newData?.paymentStatus === 'SUCCESS') && (
                                                            <p className="text-foreground whitespace-pre-line">{log.description}</p>
                                                        )}

                                                        {/* Address Update Details */}
                                                        {log.description?.includes('Updated delivery address') && log.oldData?.address && log.newData?.address && (
                                                            <div className="mt-2 bg-background p-2 rounded border border-border/50 text-xs">
                                                                <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-1.5 block">Changed Fields</span>
                                                                <div className="space-y-1">
                                                                    {Object.keys(log.newData.address).map(key => {
                                                                        const oldVal = log.oldData.address[key];
                                                                        const newVal = log.newData.address[key];
                                                                        if (oldVal !== newVal) {
                                                                            return (
                                                                                <div key={key} className="flex gap-2 items-center">
                                                                                    <span className="text-muted-foreground w-20 shrink-0 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                                                                                    <span className="text-muted-foreground truncate max-w-[100px]">{oldVal || 'N/A'}</span>
                                                                                    <span className="text-muted-foreground">→</span>
                                                                                    <span className="text-foreground font-medium truncate max-w-[120px]">{newVal || 'N/A'}</span>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {log.newData?.reason && (
                                                            <p className="mt-2 text-destructive font-medium text-xs">Reason: {log.newData.reason}</p>
                                                        )}

                                                        {log.action === 'UPDATE' && log.newData?.paymentStatus === 'SUCCESS' && (
                                                            <div className="mt-2 flex items-center gap-2 text-xs">
                                                                <CreditCard className="h-3.5 w-3.5 text-green-500" />
                                                                <span className="text-muted-foreground">Payment:</span>
                                                                <span className="font-medium text-foreground uppercase">{log.newData.paymentInstrument || log.newData.paymentMethod || 'Online Payment'}</span>
                                                            </div>
                                                        )}

                                                        {log.action === 'CREATE' && log.newData && (
                                                            <div className="mt-2 flex flex-col sm:flex-row gap-3 text-xs">
                                                                {log.newData.deliveryDate && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Calendar className="h-3.5 w-3.5 text-blue-500" />
                                                                        <span className="text-muted-foreground">Expected:</span>
                                                                        <span className="font-medium text-foreground">{new Date(log.newData.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                                    </div>
                                                                )}
                                                                {log.newData.paymentMethod && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <CreditCard className="h-3.5 w-3.5 text-green-500" />
                                                                        <span className="text-muted-foreground">Payment:</span>
                                                                        <span className="font-medium text-foreground">{log.newData.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online Payment'}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {log.action !== 'CREATE' && !(log.action === 'UPDATE' && log.newData?.paymentStatus === 'SUCCESS') && log.actorType !== 'SYSTEM' && (
                                                            <div className="mt-2.5 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-1">
                                                                <User className="w-3 h-3" />
                                                                <span>By <span className="font-medium text-foreground">{log.adminName || log.actorName || log.actorType}</span></span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            {/* --- ADMIN LOG DETAILS DIALOG --- */}
            <Dialog open={isLogDetailOpen} onOpenChange={setIsLogDetailOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader className="mb-2 pr-6">
                        <DialogTitle className="text-lg text-indigo-900 font-semibold leading-relaxed">
                            {selectedLog ? (formatLogDescription(selectedLog) || 'Audit Log Details') : 'Audit Log Details'}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedLog && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-b pb-4">
                                <div><span className="font-semibold text-gray-700">Admin:</span> {selectedLog.adminName || selectedLog.actorName || selectedLog.actorType}</div>
                                <div><span className="font-semibold text-gray-700">Resource:</span> {ENTITY_LABELS[selectedLog.entity] || selectedLog.entity}</div>
                                <div><span className="font-semibold text-gray-700">Action:</span> {getActionLabel(selectedLog)}</div>
                                <div><span className="font-semibold text-gray-700">Time:</span> {formatDate(selectedLog.createdAt)}</div>

                                {(() => {
                                    const desc = selectedLog.description || '';
                                    const redistributionMatch = desc.match(/(?:redistributed\s+\d+\s+orders|reassigned\s+order)\s+from\s+(Route\s+\d+|[a-zA-Z0-9\s]+)\s+to\s+(Route\s+\d+|[a-zA-Z0-9\s]+)/i);
                                    if (selectedLog.entity === 'ROUTE' && redistributionMatch) {
                                        return (
                                            <>
                                                <div><span className="font-semibold text-gray-700">From Route:</span> {redistributionMatch[1]}</div>
                                                <div><span className="font-semibold text-gray-700">To Route:</span> {redistributionMatch[2]}</div>
                                            </>
                                        );
                                    }
                                    return selectedLog.targetName && selectedLog.entity !== 'ORDER' && selectedLog.entity !== 'CUSTOMER' && selectedLog.entityId !== 'CUT_OFF_TIME' && (
                                        <div>
                                            <span className="font-semibold text-gray-700">
                                                {selectedLog.entity === 'ROUTE' || selectedLog.entity === 'SERVICE_ROUTE' 
                                                    ? 'Route Name' 
                                                    : selectedLog.entity === 'SERVICE_AREA' 
                                                        ? 'Area Name' 
                                                        : 'Target'}
                                                :
                                            </span>{' '}
                                            {selectedLog.targetName}
                                        </div>
                                    );
                                })()}
                                {selectedLog.orderNumber && (
                                    <div><span className="font-semibold text-gray-700">Order Number:</span> #{selectedLog.orderNumber}</div>
                                )}
                                {selectedLog.customerName && (
                                    <div><span className="font-semibold text-gray-700">Customer Name:</span> {selectedLog.customerName}</div>
                                )}
                                {selectedLog.customerPhone && (
                                    <div><span className="font-semibold text-gray-700">Phone Number:</span> {selectedLog.customerPhone.replace(/_deactivated_.*$/, '')}</div>
                                )}
                                {selectedLog.customerId && (
                                    <div className="col-span-2"><span className="font-semibold text-gray-700">Customer ID:</span> <span className="font-mono text-xs">{selectedLog.customerId.slice(-8).toUpperCase()}</span></div>
                                )}
                            </div>

                            {!isLinkEvent(selectedLog) && !['DELETE', 'LOGIN', 'LOGOUT'].includes(selectedLog.action) && (
                                <div className="mt-6">
                                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-indigo-500" /> Data Changes
                                    </h3>
                                    {renderDiff(selectedLog.oldData, selectedLog.newData)}
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
