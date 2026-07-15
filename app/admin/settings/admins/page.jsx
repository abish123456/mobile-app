'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Loader2, Plus, Users, Edit, Trash2, ShieldCheck, ShieldAlert, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
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

export default function AdminsPage() {
    const router = useRouter();
    const [admins, setAdmins] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [adminPermissions, setAdminPermissions] = useState([]);
    const [isPermsLoading, setIsPermsLoading] = useState(true);
    const [roles, setRoles] = useState([]);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        name: '',
        phone: '',
        roleIds: [],
        active: true,
        employeeCode: '',
        dateOfJoining: '',
        residentialAddress: ''
    });

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
        fetchAdmins();
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await adminFetch('/api/admin/roles');
            const data = await res.json();
            if (data.success) {
                setRoles(data.roles || []);
            }
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    const fetchAdmins = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch('/api/admin/admins');
            const data = await res.json();
            if (data.success) {
                setAdmins(data.admins || []);
            } else {
                toast.error(data.message || 'Failed to load admins');
            }
        } catch (err) {
            console.error('Error fetching admins:', err);
            toast.error('Network error loading admins');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAdmin = async (id) => {
        setDeletingId(id);
        try {
            const res = await adminFetch(`/api/admin/admins/${id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Admin deleted successfully');
                fetchAdmins();
            } else {
                toast.error(data.message || 'Failed to delete admin');
            }
        } catch (err) {
            console.error('Error deleting admin:', err);
            toast.error('Network error deleting admin');
        } finally {
            setDeletingId(null);
        }
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        
        if (!formData.employeeCode) {
            toast.error('Employee Code / ID is required');
            return;
        }

        if (!formData.username || !formData.email) {
            toast.error('Username and email are required');
            return;
        }

        if (!formData.phone || formData.phone.trim().length !== 10) {
            toast.error('A valid 10-digit phone number is required');
            return;
        }

        if (!formData.id && !formData.password) {
            toast.error('Password is required for new admins');
            return;
        }

        setIsSaving(true);
        try {
            const payload = { ...formData };
            
            const isEdit = !!formData.id;
            const url = isEdit ? `/api/admin/admins/${formData.id}` : '/api/admin/admins';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await adminFetch(url, {
                method: method,
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) {
                toast.success(isEdit ? 'Admin updated successfully' : 'Admin created successfully');
                setShowCreateDialog(false);
                setFormData({
                    id: '',
                    username: '',
                    email: '',
                    password: '',
                    name: '',
                    phone: '',
                    roleIds: [],
                    active: true,
                    employeeCode: '',
                    dateOfJoining: '',
                    residentialAddress: ''
                });
                fetchAdmins();
            } else {
                toast.error(data.message || 'Failed to save admin');
            }
        } catch (err) {
            console.error('Error saving admin:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isPermsLoading) {
        return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!hasPermission('view_admins')) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view Admin Users.</p>
            </div>
        );
    }

    return (
        <div className="w-full animate-in fade-in duration-500">

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{formData.id ? 'Edit Admin' : 'Add New Admin'}</DialogTitle>
                        <DialogDescription>{formData.id ? 'Configure the admin\'s details and role' : 'Add a new admin to the system'}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateAdmin} className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Employee Code / ID */}
                            <div className="space-y-2">
                                <Label htmlFor="employeeCode">Employee Code / ID <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="employeeCode" 
                                    value={formData.employeeCode || ''}
                                    onChange={(e) => setFormData({...formData, employeeCode: e.target.value})}
                                    placeholder="e.g. EMP-101"
                                    required
                                />
                            </div>

                            {/* Full Name */}
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input 
                                    id="name" 
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. John Doe"
                                />
                            </div>

                            {/* Email Address */}
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="email" 
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    placeholder="admin@example.com"
                                    required
                                />
                            </div>

                            {/* Phone Number */}
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="phone" 
                                    value={formData.phone || ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) {
                                            setFormData({...formData, phone: val});
                                        }
                                    }}
                                    placeholder="e.g. 9876543210"
                                    maxLength={10}
                                    required
                                />
                            </div>

                            {/* Date of Joining */}
                            <div className="space-y-2">
                                <Label htmlFor="dateOfJoining">Date of Joining</Label>
                                <Input 
                                    id="dateOfJoining" 
                                    type="date"
                                    value={formData.dateOfJoining || ''}
                                    onChange={(e) => setFormData({...formData, dateOfJoining: e.target.value})}
                                />
                            </div>

                            {/* Account is Active Checkbox */}
                            <div className="flex items-center h-full pt-6">
                                <div className="flex items-center space-x-2">
                                    <Checkbox 
                                        id="active" 
                                        checked={formData.active}
                                        onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                                    />
                                    <Label htmlFor="active" className="cursor-pointer text-sm font-medium text-slate-700">
                                        Account is Active
                                    </Label>
                                </div>
                            </div>

                            {/* Residential Address */}
                            <div className="space-y-2 col-span-1 md:col-span-2">
                                <Label htmlFor="residentialAddress">Residential Address</Label>
                                <Input 
                                    id="residentialAddress" 
                                    value={formData.residentialAddress || ''}
                                    onChange={(e) => setFormData({...formData, residentialAddress: e.target.value})}
                                    placeholder="Enter complete residential address"
                                />
                            </div>

                            {/* Login Details Heading */}
                            <div className="col-span-1 md:col-span-2 border-t pt-4 mt-2">
                                <h3 className="text-base font-semibold text-slate-800">Login Details</h3>
                                <p className="text-xs text-slate-500">Set the username and password for dashboard access</p>
                            </div>

                            {/* Username */}
                            <div className="space-y-2">
                                <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="username" 
                                    value={formData.username}
                                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                                    placeholder="e.g. johndoe"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    Password {!formData.id && <span className="text-destructive">*</span>}
                                    {formData.id && <span className="text-muted-foreground text-xs ml-2">(Leave blank to keep current)</span>}
                                </Label>
                                <Input 
                                    id="password" 
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    placeholder="••••••••"
                                    required={!formData.id}
                                />
                            </div>

                            {/* Access Control / Role Assignment */}
                            <div className="space-y-2 col-span-1 md:col-span-2 border-t pt-4 mt-2">
                                <Label className="text-base font-semibold text-slate-800">Role Assignment</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2 p-4 border rounded-md">
                                    <div className="flex items-center space-x-2">
                                        <input 
                                            type="radio"
                                            id="role-super-admin" 
                                            name="admin-role"
                                            checked={formData.roleIds.length === 0}
                                            onChange={() => setFormData({...formData, roleIds: []})}
                                            className="h-4 w-4 rounded-full border border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <Label htmlFor="role-super-admin" className="cursor-pointer font-semibold text-slate-700">
                                            Super Admin (All Access)
                                        </Label>
                                    </div>
                                    {roles.map(role => (
                                        <div key={role.id} className="flex items-center space-x-2">
                                            <input 
                                                type="radio"
                                                id={`role-${role.id}`}
                                                name="admin-role"
                                                checked={formData.roleIds.includes(role.id) && formData.roleIds.length === 1}
                                                onChange={() => setFormData({...formData, roleIds: [role.id]})}
                                                className="h-4 w-4 rounded-full border border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <Label htmlFor={`role-${role.id}`} className="cursor-pointer text-slate-600">
                                                {role.name}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {formData.id ? 'Save Changes' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Card className="border-2 shadow-sm">
                <CardHeader className="bg-muted/30 border-b pb-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-xl">Employees</CardTitle>
                    {hasPermission('create_admins') && (
                        <Button 
                            onClick={() => {
                                setFormData({ id: '', username: '', email: '', password: '', name: '', phone: '', roleIds: [], active: true, employeeCode: '', dateOfJoining: '', residentialAddress: '' });
                                setShowCreateDialog(true);
                            }} 
                            variant="outline" 
                            className="border-blue-500 text-blue-500 hover:bg-blue-50 bg-transparent shadow-sm px-3 py-1.5 h-auto text-sm flex items-center"
                            title="Add Employee"
                        >
                            <Plus className="h-4 w-4 mr-1.5" />
                            Add Employee
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : admins.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                            <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-semibold text-foreground">No admin users found</h3>
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Emp ID</TableHead>
                                        <TableHead>User Details</TableHead>
                                        <TableHead>Phone No</TableHead>
                                        <TableHead>Email & Address</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        {(hasPermission('edit_admins') || hasPermission('delete_admins')) && (
                                            <TableHead className="text-right">Actions</TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {admins.map((admin) => (
                                        <TableRow key={admin.id} className={!admin.active ? 'opacity-70' : ''}>
                                            <TableCell className="font-semibold text-slate-800 text-xs">
                                                {admin.employeeCode || <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium text-slate-900">{admin.name || admin.username}</div>
                                                <div className="text-xs text-muted-foreground">@{admin.username}</div>
                                                {admin.dateOfJoining && (
                                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                                        Joined: {new Date(admin.dateOfJoining).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-medium text-slate-700">
                                                {admin.employeePhone || admin.deliveryBoyPhone || <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs text-slate-700">{admin.email}</div>
                                                {admin.residentialAddress && (
                                                    <div className="text-[11px] text-slate-400 italic max-w-[200px] truncate mt-0.5" title={admin.residentialAddress}>
                                                        {admin.residentialAddress}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {admin.roles && admin.roles.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {admin.roles.map(role => (
                                                            <span key={role.id} className="inline-flex items-center text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-md">
                                                                <ShieldCheck className="w-3 h-3 mr-1" />
                                                                {role.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md">
                                                        <ShieldAlert className="w-3 h-3 mr-1" />
                                                        Super Admin
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className={`inline-flex text-xs font-semibold px-2 py-1 rounded-md ${admin.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                    {admin.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </TableCell>
                                            {(hasPermission('edit_admins') || hasPermission('delete_admins')) && (
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {hasPermission('edit_admins') && (
                                                            <Button variant="outline" size="sm" onClick={() => {
                                                                setFormData({
                                                                    id: admin.id,
                                                                    username: admin.username,
                                                                    email: admin.email,
                                                                    password: '',
                                                                    name: admin.name || '',
                                                                    phone: (admin.employeePhone || admin.deliveryBoyPhone || '').replace(/^\+91/, ''),
                                                                    roleIds: admin.roles ? admin.roles.map(r => r.id) : [],
                                                                    active: admin.active !== false,
                                                                    employeeCode: admin.employeeCode || '',
                                                                    dateOfJoining: admin.dateOfJoining ? new Date(admin.dateOfJoining).toISOString().split('T')[0] : '',
                                                                    residentialAddress: admin.residentialAddress || ''
                                                                });
                                                                setShowCreateDialog(true);
                                                            }}>
                                                                <Edit className="h-4 w-4 mr-1" /> Edit
                                                            </Button>
                                                        )}
                                                        {hasPermission('delete_admins') && (
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                                                                        {deletingId === admin.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Delete Admin</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Are you sure you want to delete the admin "{admin.username}"? This action cannot be undone.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeleteAdmin(admin.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                                            Delete
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
