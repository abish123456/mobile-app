'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { Checkbox } from '../../../../../components/ui/checkbox';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../../lib/admin-api';
import { useRouter } from 'next/navigation';

const PERMISSION_GROUPS = [
    {
        name: 'Dashboard',
        permissions: [
            { id: 'view_dashboard', label: 'View Dashboard' },
        ]
    },
    {
        name: 'Orders & Deliveries',
        permissions: [
            { id: 'view_orders', label: 'View Orders' },
            { id: 'view_order_count', label: 'View Order Count' },
            { id: 'cancel_order', label: 'Cancel Order' },
            { id: 'edit_order_address', label: 'Edit Order Address' },
            { id: 'reschedule_order', label: 'Reschedule Order' },
            { id: 'view_order_log', label: 'View Order Log' },
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
        permissions: [
            { id: 'view_routes', label: 'View Routes' },
            { id: 'create_routes', label: 'Create Routes' },
            { id: 'edit_routes', label: 'Edit Routes' },
            { id: 'delete_routes', label: 'Delete Routes' },
            { id: 'view_service_areas', label: 'View Service Areas' },
            { id: 'create_service_areas', label: 'Create Service Areas' },
            { id: 'edit_service_areas', label: 'Edit Service Areas' },
            { id: 'view_products', label: 'View Products' },
            { id: 'create_products', label: 'Create Products' },
            { id: 'edit_products', label: 'Edit Products' },
            { id: 'adjust_product_cutoff', label: 'Adjust Cut-off' },
            { id: 'view_delivery_staff', label: 'View Delivery Staff' },
            { id: 'create_delivery_staff', label: 'Create Delivery Staff' },
            { id: 'edit_delivery_staff', label: 'Edit Delivery Staff' },
            { id: 'delete_delivery_staff', label: 'Delete Delivery Staff' },
            { id: 'view_not_delivered_reasons', label: 'View Not Delivered Reasons' },
            { id: 'create_not_delivered_reasons', label: 'Create Not Delivered Reasons' },
            { id: 'edit_not_delivered_reasons', label: 'Edit Not Delivered Reasons' },
            { id: 'delete_not_delivered_reasons', label: 'Delete Not Delivered Reasons' },
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
        permissions: [
            { id: 'view_general_reports_count', label: 'View General Reports Count' },
            { id: 'view_order_amount_reports_count', label: 'View Order Amount Reports Count' },
            { id: 'view_cumulative_reports_count', label: 'View Cumulative Reports Count' },
            { id: 'view_cod_collection_reports_count', label: 'View COD Collection Reports Count' },
            { id: 'view_reassigned_orders_reports_count', label: 'View Reassigned Orders Reports Count' },
            { id: 'view_route_wise_reports_count', label: 'View Route-wise Reports Count' },
            { id: 'view_general_reports', label: 'View General Reports' },
            { id: 'export_general_reports', label: 'Export General Reports' },
            { id: 'view_order_amount_reports', label: 'View Order Amount Reports' },
            { id: 'export_order_amount_reports', label: 'Export Order Amount Reports' },
            { id: 'view_cumulative_reports', label: 'View Cumulative Reports' },
            { id: 'export_cumulative_reports', label: 'Export Cumulative Reports' },
            { id: 'view_cod_collection_reports', label: 'View COD Collection Reports' },
            { id: 'export_cod_collection_reports', label: 'Export COD Collection Reports' },
            { id: 'view_reassigned_orders_reports', label: 'View Reassigned Orders Reports' },
            { id: 'export_reassigned_orders_reports', label: 'Export Reassigned Orders Reports' },
            { id: 'view_route_wise_reports', label: 'View Route-wise Report' },
            { id: 'export_route_wise_reports', label: 'Export Route-wise Report' },
            { id: 'view_deposit_reports', label: 'View Deposit Reports' },
            { id: 'export_deposit_reports', label: 'Export Deposit Reports' },
            { id: 'view_deposit_reports_count', label: 'View Deposit Reports Count' },
            { id: 'view_product_sales_reports', label: 'View Product Sales Reports' },
            { id: 'export_product_sales_reports', label: 'Export Product Sales Reports' },
            { id: 'view_product_sales_reports_count', label: 'View Product Sales Reports Count' },
            { id: 'view_cash_settlement_reports', label: 'View Cash Settlement' },
            { id: 'export_cash_settlement_reports', label: 'Export Cash Settlement' },
        ]
    },
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
];

export default function RoleFormPage({ params }) {
    const router = useRouter();
    
    const [isEditMode, setIsEditMode] = useState(false);
    const [roleId, setRoleId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        permissions: []
    });

    const [adminPermissions, setAdminPermissions] = useState([]);
    const [isPermsLoading, setIsPermsLoading] = useState(true);

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
        const path = window.location.pathname;
        if (path.includes('/create')) {
            setIsEditMode(false);
            setIsLoading(false);
        } else {
            setIsEditMode(true);
            const id = path.split('/').pop();
            setRoleId(id);
            fetchRole(id);
        }
    }, []);

    const fetchRole = async (id) => {
        setIsLoading(true);
        try {
            const res = await adminFetch(`/api/admin/roles/${id}`);
            const data = await res.json();
            if (data.success) {
                setFormData({
                    name: data.role.name || '',
                    description: data.role.description || '',
                    permissions: data.role.permissions || []
                });
            } else {
                toast.error(data.message || 'Failed to load role');
                router.push('/admin/settings/team');
            }
        } catch (err) {
            console.error('Error fetching role:', err);
            toast.error('Network error loading role');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePermissionChange = (permId, checked) => {
        setFormData(prev => {
            if (checked) {
                return { ...prev, permissions: [...prev.permissions, permId] };
            } else {
                return { ...prev, permissions: prev.permissions.filter(p => p !== permId) };
            }
        });
    };

    const handleGroupToggle = (group, checked) => {
        setFormData(prev => {
            let newPerms = [...prev.permissions];
            if (checked) {
                // Add all from group
                group.permissions.forEach(p => {
                    if (!newPerms.includes(p.id)) newPerms.push(p.id);
                });
            } else {
                // Remove all from group
                const groupIds = group.permissions.map(p => p.id);
                newPerms = newPerms.filter(id => !groupIds.includes(id));
            }
            return { ...prev, permissions: newPerms };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name) {
            toast.error('Role name is required');
            return;
        }

        setIsSaving(true);
        try {
            const url = isEditMode ? `/api/admin/roles/${roleId}` : '/api/admin/roles';
            const method = isEditMode ? 'PUT' : 'POST';
            
            const res = await adminFetch(url, {
                method,
                body: JSON.stringify(formData)
            });
            
            const data = await res.json();
            if (data.success) {
                toast.success(isEditMode ? 'Role updated successfully' : 'Role created successfully');
                router.push('/admin/settings/team');
            } else {
                toast.error(data.message || 'Failed to save role');
            }
        } catch (err) {
            console.error('Error saving role:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || isPermsLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const hasAccess = isEditMode ? hasPermission('edit_roles') : hasPermission('create_roles');
    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to {isEditMode ? 'edit' : 'create'} roles.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.push('/admin/settings/team')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Role' : 'Create New Role'}</h1>
                    <p className="text-muted-foreground">Configure the granular permissions for this role</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card className="border-2 shadow-sm">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle>Role Details</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Role Name <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="name" 
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. Supervisor, Route Manager"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input 
                                    id="description" 
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    placeholder="Brief description of the role"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Granular Permissions</h3>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setFormData(prev => ({ ...prev, permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id)) }))}
                                >
                                    Select All
                                </Button>
                            </div>
                            
                            <div className="space-y-6">
                                {PERMISSION_GROUPS.map((group) => {
                                    const allChecked = group.permissions.every(p => formData.permissions.includes(p.id));
                                    const someChecked = group.permissions.some(p => formData.permissions.includes(p.id));
                                    
                                    return (
                                        <div key={group.name} className="border rounded-md overflow-hidden">
                                            <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
                                                <h4 className="font-medium text-sm text-primary">{group.name}</h4>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`group-${group.name}`}
                                                        checked={allChecked}
                                                        onCheckedChange={(checked) => handleGroupToggle(group, checked)}
                                                        className={someChecked && !allChecked ? "opacity-50" : ""}
                                                    />
                                                    <Label htmlFor={`group-${group.name}`} className="text-xs cursor-pointer">
                                                        {allChecked ? "Unselect All" : "Select All"}
                                                    </Label>
                                                </div>
                                            </div>
                                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-card">
                                                {group.permissions.map((perm) => (
                                                    <div key={perm.id} className="flex items-start space-x-2">
                                                        <Checkbox 
                                                            id={`perm-${perm.id}`}
                                                            checked={formData.permissions.includes(perm.id)}
                                                            onCheckedChange={(checked) => handlePermissionChange(perm.id, checked)}
                                                            className="mt-1"
                                                        />
                                                        <div className="space-y-1 leading-none">
                                                            <Label htmlFor={`perm-${perm.id}`} className="cursor-pointer text-sm font-medium">
                                                                {perm.label}
                                                            </Label>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t py-4 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/settings/team')}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            {isEditMode ? 'Save Changes' : 'Create Role'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
