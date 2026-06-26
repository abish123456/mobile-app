'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Loader2, Plus, Shield, Edit, Trash2, Save, Check, X, ChevronDown, ChevronRight, MoreHorizontal, CheckSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../../../components/ui/dialog';
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
} from '../../../../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import AdminsPage from '../admins/page';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";

const PERMISSION_GROUPS = [
    {
        name: 'Dashboard',
        permissions: [
            { id: 'view_dashboard', label: 'View Dashboard' },
        ]
    },
    {
        name: 'Orders & Deliveries',
        subgroups: [
            {
                name: 'Orders',
                permissions: [
                    { id: 'view_orders', label: 'View Orders' },
                    { id: 'view_order_count', label: 'View Order Count' },
                    { id: 'cancel_order', label: 'Cancel Order' },
                    { id: 'edit_order_address', label: 'Edit Order Address' },
                    { id: 'reschedule_order', label: 'Reschedule Order' },
                ]
            },
            {
                name: 'Order Log',
                permissions: [
                    { id: 'view_order_log', label: 'View Order Log' }
                ]
            }
        ]
    },
    {
        name: 'Assign Routes & Deliveries',
        permissions: [
            { id: 'view_assign_routes', label: 'View Page' },
            { id: 'generate_route_links', label: 'Generate Route Links' },
            { id: 'copy_route_links', label: 'Copy Route Links' },
            { id: 'change_order_route', label: 'Change Order Route' },
            { id: 'set_hub_location', label: 'Set Hub Location' },
        ]
    },
    {
        name: 'Master Settings',
        subgroups: [
            {
                name: 'Routes',
                permissions: [
                    { id: 'view_routes', label: 'View Routes' },
                    { id: 'create_routes', label: 'Create Routes' },
                    { id: 'edit_routes', label: 'Edit Routes' },
                    { id: 'delete_routes', label: 'Delete Routes' },
                ]
            },
            {
                name: 'Service Areas',
                permissions: [
                    { id: 'view_service_areas', label: 'View Service Areas' },
                    { id: 'create_service_areas', label: 'Create Service Areas' },
                    { id: 'edit_service_areas', label: 'Edit Service Areas' },
                ]
            },
            {
                name: 'Products',
                permissions: [
                    { id: 'view_products', label: 'View Products' },
                    { id: 'create_products', label: 'Create Products' },
                    { id: 'edit_products', label: 'Edit Products' },
                    { id: 'adjust_product_cutoff', label: 'Adjust Cut-off' },
                ]
            },
            {
                name: 'Delivery Staff',
                permissions: [
                    { id: 'view_delivery_staff', label: 'View Delivery Staff' },
                    { id: 'create_delivery_staff', label: 'Create Delivery Staff' },
                    { id: 'edit_delivery_staff', label: 'Edit Delivery Staff' },
                    { id: 'delete_delivery_staff', label: 'Delete Delivery Staff' },
                ]
            },
            {
                name: 'Not Delivered Reasons',
                permissions: [
                    { id: 'view_not_delivered_reasons', label: 'View Not Delivered Reasons' },
                    { id: 'create_not_delivered_reasons', label: 'Create Not Delivered Reasons' },
                    { id: 'edit_not_delivered_reasons', label: 'Edit Not Delivered Reasons' },
                    { id: 'delete_not_delivered_reasons', label: 'Delete Not Delivered Reasons' },
                ]
            }
        ]
    },
    {
        name: 'Delivery Exceptions',
        permissions: [
            { id: 'view_delivery_exceptions', label: 'View Delivery Exceptions' },
            { id: 'reassign_delivery_exceptions', label: 'Reassign Deliveries' },
        ]
    },
    {
        name: 'Delivery Performance',
        permissions: [
            { id: 'view_delivery_performance', label: 'View Delivery Performance' },
        ]
    },
    {
        name: 'Customers',
        permissions: [
            { id: 'view_customers', label: 'View Customers' },
            { id: 'view_customer_count', label: 'View Customer Count' },
            { id: 'edit_customer_details', label: 'Edit Customer Details' },
        ]
    },
    {
        name: 'Deposit Refunds',
        permissions: [
            { id: 'view_deposit_refunds', label: 'View Deposit Refunds' },
            { id: 'approve_refunds', label: 'Approve Refunds' },
            { id: 'reject_refunds', label: 'Reject Refunds' },
        ]
    },
    {
        name: 'Reports',
        subgroups: [
            {
                name: 'General Report',
                permissions: [
                    { id: 'view_general_reports', label: 'View General Reports' },
                    { id: 'export_general_reports', label: 'Export General Reports' },
                    { id: 'view_general_reports_count', label: 'View General Reports Count' },
                ]
            },
            {
                name: 'Order Amount',
                permissions: [
                    { id: 'view_order_amount_reports', label: 'View Order Amount Reports' },
                    { id: 'export_order_amount_reports', label: 'Export Order Amount Reports' },
                    { id: 'view_order_amount_reports_count', label: 'View Order Amount Reports Count' },
                ]
            },
            {
                name: 'Cumulative',
                permissions: [
                    { id: 'view_cumulative_reports', label: 'View Cumulative Reports' },
                    { id: 'export_cumulative_reports', label: 'Export Cumulative Reports' },
                    { id: 'view_cumulative_reports_count', label: 'View Cumulative Reports Count' },
                ]
            },
            {
                name: 'COD Collection',
                permissions: [
                    { id: 'view_cod_collection_reports', label: 'View COD Collection Reports' },
                    { id: 'export_cod_collection_reports', label: 'Export COD Collection Reports' },
                    { id: 'view_cod_collection_reports_count', label: 'View COD Collection Reports Count' },
                ]
            },
            {
                name: 'Reassigned Orders',
                permissions: [
                    { id: 'view_reassigned_orders_reports', label: 'View Reassigned Orders Reports' },
                    { id: 'export_reassigned_orders_reports', label: 'Export Reassigned Orders Reports' },
                    { id: 'view_reassigned_orders_reports_count', label: 'View Reassigned Orders Reports Count' },
                ]
            },
            {
                name: 'Route Wise',
                permissions: [
                    { id: 'view_route_wise_reports', label: 'View Route-wise Report' },
                    { id: 'export_route_wise_reports', label: 'Export Route-wise Report' },
                    { id: 'view_route_wise_reports_count', label: 'View Route-wise Reports Count' },
                ]
            },
            {
                name: 'Deposit Report',
                permissions: [
                    { id: 'view_deposit_reports', label: 'View Deposit Reports' },
                    { id: 'export_deposit_reports', label: 'Export Deposit Reports' },
                    { id: 'view_deposit_reports_count', label: 'View Deposit Reports Count' },
                ]
            },
            {
                name: 'Product Sales Report',
                permissions: [
                    { id: 'view_product_sales_reports', label: 'View Product Sales Reports' },
                    { id: 'export_product_sales_reports', label: 'Export Product Sales Reports' },
                    { id: 'view_product_sales_reports_count', label: 'View Product Sales Reports Count' },
                ]
            },
            {
                name: 'Cash Settlement',
                permissions: [
                    { id: 'view_cash_settlement_reports', label: 'View Cash Settlement' },
                    { id: 'export_cash_settlement_reports', label: 'Export Cash Settlement' },
                ]
            }
        ]
    },
    {
        name: 'Settings',
        subgroups: [
            {
                name: 'Delivery Settings',
                permissions: [
                    { id: 'view_delivery_settings', label: 'View Settings' },
                    { id: 'edit_delivery_settings', label: 'Edit Settings' },
                    { id: 'delete_delivery_settings', label: 'Delete Settings' },
                ]
            },
            {
                name: 'Support Contacts',
                permissions: [
                    { id: 'view_support_contacts', label: 'View Contacts' },
                    { id: 'create_support_contacts', label: 'Create Contacts' },
                    { id: 'edit_support_contacts', label: 'Edit Contacts' },
                    { id: 'delete_support_contacts', label: 'Delete Contacts' },
                ]
            },
            {
                name: 'Roles & Permissions',
                permissions: [
                    { id: 'view_roles', label: 'View Roles' },
                    { id: 'create_roles', label: 'Create Roles' },
                    { id: 'edit_roles', label: 'Edit Roles' },
                    { id: 'delete_roles', label: 'Delete Roles' },
                ]
            },
            {
                name: 'Admin Users',
                permissions: [
                    { id: 'view_admins', label: 'View Admin Users' },
                    { id: 'create_admins', label: 'Create Admin Users' },
                    { id: 'edit_admins', label: 'Edit Admin Users' },
                    { id: 'delete_admins', label: 'Delete Admin Users' },
                ]
            }
        ]
    }
];

const getGroupPermIds = (group) => {
    let ids = [];
    if (group.permissions) ids.push(...group.permissions.map(p => p.id));
    if (group.subgroups) group.subgroups.forEach(sg => ids.push(...sg.permissions.map(p => p.id)));
    return ids;
};

const getAllPermIds = () => PERMISSION_GROUPS.flatMap(getGroupPermIds);

export default function RolesPermissionsPage() {
    const router = useRouter();
    const [roles, setRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [adminPermissions, setAdminPermissions] = useState([]);
    const [isPermsLoading, setIsPermsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        permissions: []
    });
    const [modifiedRoleIds, setModifiedRoleIds] = useState(new Set());
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState(new Set([PERMISSION_GROUPS[0].name]));
    const [roleToDelete, setRoleToDelete] = useState(null);

    const [expandedSubGroups, setExpandedSubGroups] = useState(new Set());

    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => {
            if (prev.has(groupName)) {
                return new Set();
            } else {
                return new Set([groupName]);
            }
        });
    };

    const toggleSubGroup = (subGroupName) => {
        setExpandedSubGroups(prev => {
            if (prev.has(subGroupName)) {
                return new Set();
            } else {
                return new Set([subGroupName]);
            }
        });
    };

    useEffect(() => {
        const perms = localStorage.getItem('adminPermissions');
        if (perms) {
            setAdminPermissions(JSON.parse(perms));
        }
        setIsPermsLoading(false);
    }, []);

    const hasPermission = (perm) => {
        return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch('/api/admin/roles');
            const data = await res.json();
            if (data.success) {
                setRoles(data.roles || []);
            } else {
                toast.error(data.message || 'Failed to load roles');
            }
        } catch (err) {
            console.error('Error fetching roles:', err);
            toast.error('Network error loading roles');
        } finally {
            setIsLoading(false);
            setDeletingId(null);
            setRoleToDelete(null);
        }
    };

    const handleDeleteRole = async (id) => {
        setDeletingId(id);
        try {
            const res = await adminFetch(`/api/admin/roles/${id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Role deleted successfully');
                fetchRoles();
            } else {
                toast.error(data.message || 'Failed to delete role');
            }
        } catch (err) {
            console.error('Error deleting role:', err);
            toast.error('Network error deleting role');
        } finally {
            setDeletingId(null);
        }
    };



    const handleCreateRole = async (e) => {
        e.preventDefault();
        
        if (!formData.name) {
            toast.error('Role name is required');
            return;
        }

        setIsSaving(true);
        try {
            const res = await adminFetch('/api/admin/roles', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Role created successfully');
                setFormData({ name: '', description: '', permissions: [] });
                fetchRoles();
                setIsCreateDialogOpen(false);
            } else {
                toast.error(data.message || 'Failed to create role');
            }
        } catch (err) {
            console.error('Error creating role:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRolePermissionToggle = (roleId, permId, checked) => {
        setRoles(prevRoles => prevRoles.map(role => {
            if (role.id === roleId) {
                const newPermissions = checked 
                    ? [...(role.permissions || []), permId] 
                    : (role.permissions || []).filter(p => p !== permId);
                return { ...role, permissions: newPermissions };
            }
            return role;
        }));
        setModifiedRoleIds(prev => new Set(prev).add(roleId));
    };

    const handleGroupRoleToggle = (roleId, group, checked) => {
        const permIds = getGroupPermIds(group);
        setRoles(prevRoles => prevRoles.map(role => {
            if (role.id === roleId) {
                let updatedPerms = role.permissions ? [...role.permissions] : [];
                permIds.forEach(id => {
                    if (checked) {
                        if (!updatedPerms.includes(id)) {
                            updatedPerms.push(id);
                        }
                    } else {
                        updatedPerms = updatedPerms.filter(pid => pid !== id);
                    }
                });
                return { ...role, permissions: updatedPerms };
            }
            return role;
        }));
        setModifiedRoleIds(prev => new Set(prev).add(roleId));
    };

    const handleSubGroupRoleToggle = (roleId, subgroup, checked) => {
        setRoles(prevRoles => prevRoles.map(role => {
            if (role.id === roleId) {
                let updatedPerms = role.permissions ? [...role.permissions] : [];
                subgroup.permissions.forEach(p => {
                    if (checked) {
                        if (!updatedPerms.includes(p.id)) {
                            updatedPerms.push(p.id);
                        }
                    } else {
                        updatedPerms = updatedPerms.filter(pid => pid !== p.id);
                    }
                });
                return { ...role, permissions: updatedPerms };
            }
            return role;
        }));
        setModifiedRoleIds(prev => new Set(prev).add(roleId));
    };

    const handleSelectAllRole = (roleId, checked) => {
        setRoles(prevRoles => prevRoles.map(role => {
            if (role.id === roleId) {
                if (checked) {
                    return { ...role, permissions: getAllPermIds() };
                } else {
                    return { ...role, permissions: [] };
                }
            }
            return role;
        }));
        setModifiedRoleIds(prev => new Set(prev).add(roleId));
    };

    const handleSaveAllRoles = async () => {
        if (modifiedRoleIds.size === 0) return;
        setIsSavingAll(true);
        try {
            const rolesToUpdate = roles.filter(r => modifiedRoleIds.has(r.id));
            const promises = rolesToUpdate.map(role => 
                adminFetch(`/api/admin/roles/${role.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: role.name,
                        description: role.description,
                        permissions: role.permissions
                    })
                })
            );
            
            const results = await Promise.all(promises);
            const allSuccess = results.every(res => res.ok);
            
            if (allSuccess) {
                toast.success('Roles updated successfully');
                setModifiedRoleIds(new Set());
                fetchRoles();
            } else {
                toast.error('Failed to update some roles');
            }
        } catch (error) {
            console.error('Error updating roles:', error);
            toast.error('Network error while updating roles');
        } finally {
            setIsSavingAll(false);
        }
    };

    if (isPermsLoading) {
        return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!hasPermission('view_roles')) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view Roles & Permissions.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-lg md:text-3xl font-bold tracking-tight text-foreground">Team</h1>
                <p className="text-muted-foreground">Manage admin users and their access levels</p>
            </div>
            
            <Tabs defaultValue="admins" className="w-full">
                <TabsList className="h-12 w-full sm:w-[250px] mb-5">
                    <TabsTrigger value="admins" className="w-1/2 text-base">Users</TabsTrigger>
                    <TabsTrigger value="roles" className="w-1/2 text-base">Roles</TabsTrigger>
                </TabsList>
                
                <TabsContent value="roles">

            <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the "{roleToDelete?.name}" role? This action cannot be undone. 
                            Ensure no admins are currently assigned to this role before deleting.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            if (roleToDelete) handleDeleteRole(roleToDelete.id);
                        }} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            {deletingId === roleToDelete?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card className="border-2 shadow-sm">
                <CardHeader className="bg-muted/30 border-b pb-4 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        
                        <div>
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-xl">Roles & Permissions</CardTitle>
                                {hasPermission('create_roles') && (
                                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button 
                                                size="icon" 
                                                variant="outline" 
                                                className="h-7 w-7 rounded-full border-blue-500 text-blue-500 hover:bg-blue-50 bg-transparent shadow-none"
                                                title="Create Role"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create New Role</DialogTitle>
                                    <DialogDescription>Enter the role name and description. You can configure its permissions from the table.</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleCreateRole} className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Role Name <span className="text-destructive">*</span></Label>
                                        <Input 
                                            id="name" 
                                            value={formData.name}
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                            placeholder="e.g. Supervisor"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Input 
                                            id="description" 
                                            value={formData.description}
                                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                                            placeholder="Brief description"
                                        />
                                    </div>
                                    <DialogFooter className="pt-4">
                                        <Button type="button" variant="outline" onClick={() => {
                                            setIsCreateDialogOpen(false);
                                            setFormData({ name: '', description: '', permissions: [] });
                                        }}>Cancel</Button>
                                        <Button type="submit" disabled={isSaving}>
                                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Create Role
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                            </div>
                           
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    {isLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : roles.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                                    <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                                    <h3 className="text-lg font-semibold text-foreground">No roles configured</h3>
                                    <p className="text-muted-foreground mt-1">Create your first role to start managing access.</p>
                                </div>
                            ) : (
                                <div className="rounded-md border overflow-x-auto">
                                    <Table className="min-w-max w-full">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow>
                                                <TableHead className="w-[250px] md:w-[350px] font-bold text-gray-900 sticky left-0 bg-gray-50 z-20 border-r text-center shadow-[1px_0_0_0_#e5e7eb] px-4 py-4 align-middle">Permissions</TableHead>
                                                {roles.map((role) => {
                                                    const totalPermissionsCount = getAllPermIds().length;
                                                    const rolePermsCount = role.permissions?.length || 0;
                                                    const allChecked = rolePermsCount === totalPermissionsCount && totalPermissionsCount > 0;
                                                    const someChecked = rolePermsCount > 0;

                                                    return (
                                                    <TableHead key={role.id} className="text-center min-w-[140px] px-2 py-4 align-middle border-r border-gray-200 last:border-r-0">
                                                        <div className="flex items-center justify-center gap-1 relative group w-full">
                                                            <span className="font-bold text-gray-900 text-base">{role.name}</span>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-gray-900 focus-visible:ring-0">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="start" className="w-40">
                                                                    <DropdownMenuItem onClick={() => handleSelectAllRole(role.id, !allChecked)} className="cursor-pointer">
                                                                        <CheckSquare className="h-4 w-4 mr-2" /> {allChecked ? 'Deselect All' : 'Select All'}
                                                                    </DropdownMenuItem>
                                                                    {hasPermission('delete_roles') && (
                                                                        <DropdownMenuItem onClick={() => setRoleToDelete(role)} className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer">
                                                                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </TableHead>
                                                );
                                                })}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {PERMISSION_GROUPS.map((group) => {
                                                const isExpanded = expandedGroups.has(group.name);
                                                return (
                                                <React.Fragment key={group.name}>
                                                    <TableRow className="hover:bg-gray-50 transition-colors">
                                                        <TableCell 
                                                            className="font-bold text-gray-900 py-3 px-4 border-y border-r border-gray-200 sticky left-0 z-10 bg-white w-full inline-block md:table-cell md:w-auto md:bg-transparent md:static select-none cursor-pointer"
                                                            onClick={() => toggleGroup(group.name)}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                {group.name}
                                                            </div>
                                                        </TableCell>
                                                        {roles.map((role) => {
                                                            const groupPermIds = getGroupPermIds(group);
                                                            const rolePerms = role.permissions || [];
                                                            const allChecked = groupPermIds.length > 0 && groupPermIds.every(id => rolePerms.includes(id));
                                                            const someChecked = groupPermIds.some(id => rolePerms.includes(id));
                                                            
                                                            return (
                                                                <TableCell key={role.id} className="text-center p-0 align-middle border-y border-r border-gray-200 last:border-r-0">
                                                                    <div className="flex items-center justify-center w-full h-full py-3">
                                                                        <Checkbox 
                                                                            checked={allChecked} 
                                                                            onCheckedChange={(checked) => handleGroupRoleToggle(role.id, group, checked)}
                                                                            className="h-5 w-5 rounded-[4px] cursor-pointer" 
                                                                        />
                                                                    </div>
                                                                </TableCell>
                                                            );
                                                        })}
                                                    </TableRow>
                                                    {isExpanded && group.permissions && group.permissions.map((perm) => (
                                                        <TableRow key={perm.id} className="hover:bg-gray-50/50 transition-colors">
                                                            <TableCell className="font-medium text-gray-700 py-3 px-6 pl-10 sticky left-0 bg-white z-10 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] align-middle">
                                                                {perm.label}
                                                            </TableCell>
                                                            {roles.map((role) => {
                                                                const hasPerm = role.permissions?.includes(perm.id);
                                                                return (
                                                                    <TableCell key={role.id} className="text-center p-0 align-middle border-r border-gray-200 last:border-r-0">
                                                                        <div className="flex items-center justify-center w-full h-full py-3">
                                                                            <Checkbox 
                                                                                checked={hasPerm} 
                                                                                onCheckedChange={(checked) => handleRolePermissionToggle(role.id, perm.id, checked)}
                                                                                className="h-5 w-5 rounded-[4px] cursor-pointer" 
                                                                            />
                                                                        </div>
                                                                    </TableCell>
                                                                );
                                                            })}
                                                        </TableRow>
                                                    ))}
                                                    {isExpanded && group.subgroups && group.subgroups.map((subgroup) => {
                                                        const isSubExpanded = expandedSubGroups.has(subgroup.name);
                                                        return (
                                                            <React.Fragment key={subgroup.name}>
                                                                <TableRow className="bg-gray-50/30 hover:bg-gray-50 transition-colors">
                                                                    <TableCell 
                                                                        className="font-semibold text-gray-800 py-2 px-4 pl-10 border-y border-r border-gray-200 sticky left-0 z-10 bg-white w-full inline-block md:table-cell md:w-auto md:bg-transparent md:static select-none cursor-pointer"
                                                                        onClick={() => toggleSubGroup(subgroup.name)}
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            {isSubExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                            {subgroup.name}
                                                                        </div>
                                                                    </TableCell>
                                                                    {roles.map((role) => {
                                                                        const subGroupPermIds = subgroup.permissions.map(p => p.id);
                                                                        const rolePerms = role.permissions || [];
                                                                        const allChecked = subGroupPermIds.length > 0 && subGroupPermIds.every(id => rolePerms.includes(id));
                                                                        
                                                                        return (
                                                                            <TableCell key={role.id} className="text-center p-0 align-middle border-y border-r border-gray-200 last:border-r-0">
                                                                                <div className="flex items-center justify-center w-full h-full py-2">
                                                                                        <Checkbox 
                                                                                        checked={allChecked} 
                                                                                        onCheckedChange={(checked) => handleSubGroupRoleToggle(role.id, subgroup, checked)}
                                                                                        className="h-5 w-5 rounded-[4px] cursor-pointer" 
                                                                                    />
                                                                                </div>
                                                                            </TableCell>
                                                                        );
                                                                    })}
                                                                </TableRow>
                                                                {isSubExpanded && subgroup.permissions.map((perm) => (
                                                                    <TableRow key={perm.id} className="hover:bg-gray-50/50 transition-colors">
                                                                        <TableCell className="font-medium text-gray-600 py-2 px-6 pl-16 sticky left-0 bg-white z-10 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] align-middle">
                                                                            {perm.label}
                                                                        </TableCell>
                                                                        {roles.map((role) => {
                                                                            const hasPerm = role.permissions?.includes(perm.id);
                                                                            return (
                                                                                <TableCell key={role.id} className="text-center p-0 align-middle border-r border-gray-200 last:border-r-0">
                                                                                    <div className="flex items-center justify-center w-full h-full py-2">
                                                                                        <Checkbox 
                                                                                            checked={hasPerm} 
                                                                                            onCheckedChange={(checked) => handleRolePermissionToggle(role.id, perm.id, checked)}
                                                                                            className="h-5 w-5 rounded-[4px] cursor-pointer" 
                                                                                        />
                                                                                    </div>
                                                                                </TableCell>
                                                                            );
                                                                        })}
                                                                    </TableRow>
                                                                ))}
                                                            </React.Fragment>
                                                        )
                                                    })}
                                                </React.Fragment>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                            
                            {roles.length > 0 && modifiedRoleIds.size > 0 && (
                                <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
                                    <Button onClick={handleSaveAllRoles} disabled={isSavingAll} className="min-w-[150px]">
                                        {isSavingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                        Save Changes
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="admins">
                    <AdminsPage />
                </TabsContent>
            </Tabs>
        </div>
    );
}
