'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Checkbox } from '../../../components/ui/checkbox';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { 
  Loader2, Plus, Edit, Trash2, ShieldCheck, ShieldAlert, Search, 
  User, Phone, Mail, Calendar, MapPin, CheckCircle, XCircle, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
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
} from '../../../components/ui/alert-dialog';

export default function EmployeesPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState([]);
    const [roles, setRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [adminPermissions, setAdminPermissions] = useState([]);
    const [isPermsLoading, setIsPermsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Search and filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Form Data State
    const [formData, setFormData] = useState({
        id: '',
        employeeCode: '',
        name: '',
        mobile: '',
        email: '',
        address: '',
        dateOfJoining: '',
        active: true,
        enableLogin: true,
        username: '',
        password: '',
        roleIds: []
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
        fetchEmployees();
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

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch('/api/admin/employees');
            const data = await res.json();
            if (data.success) {
                setEmployees(data.employees || []);
            } else {
                toast.error(data.message || 'Failed to load employees');
            }
        } catch (err) {
            console.error('Error fetching employees:', err);
            toast.error('Network error loading employees');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteEmployee = async (id) => {
        setDeletingId(id);
        try {
            const res = await adminFetch(`/api/admin/employees/${id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Employee deleted successfully');
                fetchEmployees();
            } else {
                toast.error(data.message || 'Failed to delete employee');
            }
        } catch (err) {
            console.error('Error deleting employee:', err);
            toast.error('Network error deleting employee');
        } finally {
            setDeletingId(null);
        }
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        
        if (!formData.employeeCode || !formData.name || !formData.mobile || !formData.email || !formData.dateOfJoining) {
            toast.error('Required fields are missing');
            return;
        }

        if (formData.mobile.trim().length !== 10) {
            toast.error('Please enter a valid 10-digit mobile number');
            return;
        }

        if (!formData.username) {
            toast.error('Software Login ID is required');
            return;
        }

        if (!formData.id && !formData.password) {
            toast.error('Password is required for new logins');
            return;
        }

        if (formData.roleIds.length === 0) {
            toast.error('Please assign a role to the employee');
            return;
        }

        setIsSaving(true);
        try {
            const payload = { ...formData, enableLogin: true };
            const isEdit = !!formData.id;
            const url = isEdit ? `/api/admin/employees/${formData.id}` : '/api/admin/employees';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await adminFetch(url, {
                method: method,
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) {
                toast.success(isEdit ? 'Employee updated successfully' : 'Employee created successfully');
                setShowCreateDialog(false);
                resetForm();
                fetchEmployees();
            } else {
                toast.error(data.message || 'Failed to save employee');
            }
        } catch (err) {
            console.error('Error saving employee:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setFormData({
            id: '',
            employeeCode: '',
            name: '',
            mobile: '',
            email: '',
            address: '',
            dateOfJoining: '',
            active: true,
            enableLogin: true,
            username: '',
            password: '',
            roleIds: []
        });
    };

    const handleOpenEdit = (employee) => {
        setFormData({
            id: employee.id,
            employeeCode: employee.employeeCode,
            name: employee.name,
            mobile: employee.mobile,
            email: employee.email,
            address: employee.address || '',
            dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining).toISOString().split('T')[0] : '',
            active: employee.active !== false,
            enableLogin: true,
            username: employee.softwareLoginId || '',
            password: '',
            roleIds: employee.roles ? employee.roles.map(r => r.id) : []
        });
        setShowCreateDialog(true);
    };

    // Filter employees locally
    const filteredEmployees = employees.filter(emp => {
        const matchesSearch = 
            (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (emp.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (emp.mobile || '').includes(searchTerm);

        const matchesStatus = 
            statusFilter === 'all' || 
            (statusFilter === 'active' && emp.active) || 
            (statusFilter === 'inactive' && !emp.active);

        return matchesSearch && matchesStatus;
    });

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    if (isPermsLoading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!hasPermission('view_employees')) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <ShieldAlert className="h-16 w-16 text-rose-500 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view the Employee Master.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 w-full animate-in fade-in duration-500 pb-12">
            <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
                <CardHeader className="border-b flex flex-col xl:flex-row xl:items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <CardTitle className="text-lg font-semibold text-slate-800">Employees ({filteredEmployees.length})</CardTitle>
                    </div>

                    {/* Filters & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full xl:w-auto justify-end">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            {/* Search Input */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                <Input 
                                    id="search" 
                                    placeholder="Search by name, code, phone..." 
                                    className="pl-8 h-9 text-xs"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            {/* Status Filter */}
                            <div className="relative w-full sm:w-44">
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-full text-xs h-9 bg-white border-slate-200 shadow-sm">
                                        <SelectValue placeholder="All Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Employees</SelectItem>
                                        <SelectItem value="active">Active Only</SelectItem>
                                        <SelectItem value="inactive">Inactive Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Reset Button */}
                        {(searchTerm || statusFilter !== 'all') && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('all');
                                }}
                                className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 text-xs h-9 shrink-0 px-3"
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                            </Button>
                        )}

                        {/* Add Employee Button */}
                        {hasPermission('create_employees') && (
                            <Button 
                                onClick={() => {
                                    resetForm();
                                    setShowCreateDialog(true);
                                }}
                                size="sm"
                                className="flex items-center gap-1.5 cursor-pointer shrink-0 h-9 text-xs"
                            >
                                <Plus className="h-4 w-4" /> Add Employee
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/20">
                            <User className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-semibold text-foreground">No employees found</h3>
                            <p className="text-muted-foreground mt-1">Try adjusting your filters or create a new employee master record.</p>
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-x-auto">
                            <Table className="min-w-max w-full">
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead className="font-bold text-gray-900">Employee ID</TableHead>
                                        <TableHead className="font-bold text-gray-900">Name</TableHead>
                                        <TableHead className="font-bold text-gray-900">Contact Info</TableHead>
                                        <TableHead className="font-bold text-gray-900">Date of Joining</TableHead>
                                        <TableHead className="font-bold text-gray-900 text-center">Status</TableHead>
                                        <TableHead className="font-bold text-gray-900">Software Login</TableHead>
                                        {(hasPermission('edit_employees') || hasPermission('delete_employees')) && (
                                            <TableHead className="font-bold text-gray-900 text-right">Actions</TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEmployees.map((emp) => (
                                        <TableRow key={emp.id} className={!emp.active ? 'opacity-70' : ''}>
                                            <TableCell className="font-mono font-medium text-blue-600">{emp.employeeCode}</TableCell>
                                            <TableCell className="font-medium text-foreground">{emp.name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {emp.mobile}</span>
                                                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {emp.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDate(emp.dateOfJoining)}</span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`inline-flex text-xs font-semibold px-2 py-1 rounded-md ${emp.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                    {emp.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {emp.adminId ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            {emp.softwareLoginId?.includes('@') ? emp.softwareLoginId : `@${emp.softwareLoginId}`}
                                                        </span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {emp.roles && emp.roles.length > 0 ? (
                                                                emp.roles.map(r => (
                                                                    <span key={r.id} className="inline-flex items-center text-xs font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-md">
                                                                        <ShieldCheck className="w-3 h-3 mr-1" />
                                                                        {r.name}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="inline-flex items-center text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-md">
                                                                    <ShieldAlert className="w-3 h-3 mr-1" />
                                                                    Super Admin
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Disabled</span>
                                                )}
                                            </TableCell>
                                            {(hasPermission('edit_employees') || hasPermission('delete_employees')) && (
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {hasPermission('edit_employees') && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon-xs" 
                                                                onClick={() => handleOpenEdit(emp)}
                                                                title="Edit"
                                                            >
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                        {hasPermission('delete_employees') && (
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon-xs" 
                                                                        className="text-destructive hover:bg-destructive/10 cursor-pointer"
                                                                        title="Delete"
                                                                    >
                                                                        {deletingId === emp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Delete Employee Record</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Are you sure you want to delete the employee record "{emp.name}" ({emp.employeeCode})? This action cannot be undone. Any linked software login accounts will also be deleted.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction 
                                                                            onClick={() => handleDeleteEmployee(emp.id)} 
                                                                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                                        >
                                                                            Delete Employee
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

            {/* Add / Edit Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={(open) => {
                if(!open) resetForm();
                setShowCreateDialog(open);
            }}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{formData.id ? 'Edit Employee Details' : 'Add New Employee'}</DialogTitle>
                        <DialogDescription>
                            {formData.id ? 'Modify details, login status, or roles for this employee' : 'Register a new employee and configure their software login credentials.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveEmployee} className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <Label htmlFor="employeeCode">Employee Code / ID <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="employeeCode" 
                                    value={formData.employeeCode}
                                    onChange={(e) => setFormData({...formData, employeeCode: e.target.value.toUpperCase()})}
                                    placeholder="e.g. EMP001"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Employee Full Name <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="name" 
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. Rajkumar P."
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mobile">Mobile Number <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="mobile" 
                                    value={formData.mobile}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) {
                                            setFormData({...formData, mobile: val});
                                        }
                                    }}
                                    placeholder="10-digit number"
                                    maxLength={10}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email ID <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="email" 
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    placeholder="email@company.com"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="dateOfJoining">Date of Joining <span className="text-destructive">*</span></Label>
                                <Input 
                                    id="dateOfJoining" 
                                    type="date"
                                    value={formData.dateOfJoining}
                                    onChange={(e) => setFormData({...formData, dateOfJoining: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="space-y-2 flex flex-col justify-center">
                                <div className="flex items-center space-x-3 mt-4">
                                    <Checkbox 
                                        id="active" 
                                        checked={formData.active}
                                        onCheckedChange={(checked) => setFormData({...formData, active: checked === true})}
                                    />
                                    <Label htmlFor="active" className="cursor-pointer font-medium">
                                        Employee is Active
                                    </Label>
                                </div>
                            </div>
                            <div className="space-y-2 col-span-1 md:col-span-2">
                                <Label htmlFor="address">Residential Address</Label>
                                <Textarea 
                                    id="address" 
                                    value={formData.address}
                                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                                    placeholder="Enter complete residential address details..."
                                    className="min-h-[80px]"
                                />
                            </div>
                        </div>

                        {/* Software Login Assignment Section (Shown by default) */}
                        <div className="border-t pt-6 mt-6">
                            <h3 className="text-base font-semibold mb-4 text-foreground">
                                Software Login Details
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 border rounded-xl bg-muted/20">
                                <div className="space-y-2">
                                    <Label htmlFor="username" className="font-medium">Software Login ID / Username <span className="text-destructive">*</span></Label>
                                    <Input 
                                        id="username" 
                                        value={formData.username}
                                        onChange={(e) => setFormData({...formData, username: e.target.value})}
                                        placeholder="e.g. rajkumar.p"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="font-medium">
                                        Password 
                                        {!formData.id && <span className="text-destructive"> *</span>}
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
                                <div className="space-y-2 col-span-1 md:col-span-2">
                                    <Label className="font-medium">Role Assignment <span className="text-destructive">*</span></Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2 p-4 border bg-background rounded-lg">
                                        {roles.map(role => (
                                            <div key={role.id} className="flex items-center space-x-2.5">
                                                <Checkbox 
                                                    id={`role-${role.id}`}
                                                    checked={formData.roleIds.includes(role.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setFormData({...formData, roleIds: [role.id]});
                                                        } else {
                                                            setFormData({...formData, roleIds: []});
                                                        }
                                                    }}
                                                />
                                                <Label htmlFor={`role-${role.id}`} className="cursor-pointer text-sm">
                                                    {role.name}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="border-t pt-4 mt-6">
                            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {formData.id ? 'Save Changes' : 'Create Employee'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
