'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../../components/ui/select';

import { Checkbox } from '../../../../../components/ui/checkbox';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../../lib/admin-api';
import { useRouter } from 'next/navigation';

export default function AdminFormPage({ params }) {
    const router = useRouter();
    
    const [isEditMode, setIsEditMode] = useState(false);
    const [adminId, setAdminId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [roles, setRoles] = useState([]);
    
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        name: '',
        password: '',
        roleIds: [],
        active: true
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
        
        const path = window.location.pathname;
        if (path.includes('/create')) {
            setIsEditMode(false);
            setIsLoading(false);
        } else {
            setIsEditMode(true);
            const id = path.split('/').pop();
            setAdminId(id);
            fetchAdmin(id);
        }
    };

    const fetchAdmin = async (id) => {
        setIsLoading(true);
        try {
            const res = await adminFetch(`/api/admin/admins/${id}`);
            const data = await res.json();
            if (data.success) {
                setFormData({
                    username: data.admin.username || '',
                    email: data.admin.email || '',
                    name: data.admin.name || '',
                    password: '', // Don't populate password
                    roleIds: data.admin.roles ? data.admin.roles.map(r => r.id) : [],
                    active: data.admin.active
                });
            } else {
                toast.error(data.message || 'Failed to load admin');
                router.push('/admin/settings/admins');
            }
        } catch (err) {
            console.error('Error fetching admin:', err);
            toast.error('Network error loading admin');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.username || !formData.email) {
            toast.error('Username and email are required');
            return;
        }

        if (!isEditMode && !formData.password) {
            toast.error('Password is required for new admins');
            return;
        }

        setIsSaving(true);
        try {
            const url = isEditMode ? `/api/admin/admins/${adminId}` : '/api/admin/admins';
            const method = isEditMode ? 'PUT' : 'POST';
            
            const payload = { ...formData };
            
            const res = await adminFetch(url, {
                method,
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) {
                toast.success(isEditMode ? 'Admin updated successfully' : 'Admin created successfully');
                router.push('/admin/settings/admins');
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

    if (isLoading || isPermsLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const hasAccess = isEditMode ? hasPermission('edit_admins') : hasPermission('create_admins');
    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to {isEditMode ? 'edit' : 'create'} admin users.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full max-w-4xl animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.push('/admin/settings/admins')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Admin' : 'Create New Admin'}</h1>
                    <p className="text-muted-foreground">Configure the admin's details and role</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card className="border-2 shadow-sm">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle>Admin Details</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input 
                                    id="name" 
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. John Doe"
                                />
                            </div>
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
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    Password {isEditMode ? '(Leave blank to keep current)' : <span className="text-destructive">*</span>}
                                </Label>
                                <Input 
                                    id="password" 
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    placeholder="••••••••"
                                    required={!isEditMode}
                                />
                            </div>
                            
                            <div className="space-y-2 col-span-1 md:col-span-2">
                                <Label>Role Assignment</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2 p-4 border rounded-md">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="role-super-admin" 
                                            checked={formData.roleIds.length === 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) setFormData({...formData, roleIds: []});
                                            }}
                                        />
                                        <Label htmlFor="role-super-admin" className="cursor-pointer font-semibold">
                                            Super Admin (All Access)
                                        </Label>
                                    </div>
                                    {roles.map(role => (
                                        <div key={role.id} className="flex items-center space-x-2">
                                            <Checkbox 
                                                id={`role-${role.id}`}
                                                checked={formData.roleIds.includes(role.id)}
                                                onCheckedChange={(checked) => {
                                                    let newRoles = [...formData.roleIds];
                                                    if (checked) {
                                                        newRoles.push(role.id);
                                                    } else {
                                                        newRoles = newRoles.filter(id => id !== role.id);
                                                    }
                                                    setFormData({...formData, roleIds: newRoles});
                                                }}
                                            />
                                            <Label htmlFor={`role-${role.id}`} className="cursor-pointer">
                                                {role.name}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="space-y-2 flex flex-col justify-center mt-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox 
                                        id="active" 
                                        checked={formData.active}
                                        onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                                    />
                                    <Label htmlFor="active" className="cursor-pointer font-medium">
                                        Account Active
                                    </Label>
                                </div>
                                <p className="text-xs text-muted-foreground ml-6">
                                    Inactive admins cannot log in to the dashboard.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t py-4 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/settings/admins')}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            {isEditMode ? 'Save Changes' : 'Create Admin'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
