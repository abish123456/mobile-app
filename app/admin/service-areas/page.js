'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
} from '../../../components/ui/alert-dialog';
import { MapPin, Plus, Edit, Trash2, Loader2, AlertCircle, CheckCircle2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';
import { cn } from '../../../lib/utils';

export default function ServiceAreasPage() {
    const [serviceAreas, setServiceAreas] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
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
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedArea, setSelectedArea] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Pagination and Search
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;


    const [formData, setFormData] = useState({
        pincode: '',
        areaName: '',
        active: true,
    });

    useEffect(() => {
        fetchServiceAreas();
    }, []);

    const fetchServiceAreas = async () => {
        setIsLoading(true);
        try {
            const response = await adminFetch('/api/admin/service-areas');
            const data = await response.json();
            if (data.success) {
                setServiceAreas(data.serviceAreas || []);
            } else {
                setError(data.message || 'Failed to fetch service areas');
            }
        } catch (err) {
            console.error('Error fetching service areas:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenDialog = (area = null) => {
        setSelectedArea(area);
        if (area) {
            setFormData({
                pincode: area.pincode,
                areaName: area.areaName,
                active: area.active,
            });
        } else {
            setFormData({
                pincode: '',
                areaName: '',
                active: true,
            });
        }
        setIsDialogOpen(true);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.pincode.length !== 6) {
            setError('Pincode must be exactly 6 digits');
            return;
        }

        setIsSubmitting(true);

        try {
            const url = selectedArea
                ? `/api/admin/service-areas/${selectedArea.id}`
                : '/api/admin/service-areas';
            const method = selectedArea ? 'PUT' : 'POST';

            const response = await adminFetch(url, {
                method,
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(selectedArea ? 'Service area updated!' : 'Service area added!');
                setIsDialogOpen(false);
                fetchServiceAreas();
            } else {
                setError(data.message || 'Failed to save service area');
            }
        } catch (err) {
            console.error('Error saving service area:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredAreas = serviceAreas.filter(area =>
        area.pincode.includes(searchTerm) ||
        area.areaName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredAreas.length / itemsPerPage);
    const paginatedAreas = filteredAreas.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleDelete = async () => {
        if (!selectedArea) return;
        setIsSubmitting(true);
        try {
            const response = await adminFetch(`/api/admin/service-areas/${selectedArea.id}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                toast.success('Service area deleted!');
                setIsDeleteDialogOpen(false);
                fetchServiceAreas();
            } else {
                toast.error(data.message || 'Failed to delete service area');
            }
        } catch (err) {
            console.error('Error deleting service area:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Service Areas</h1>
                    <p className="text-muted-foreground">Manage pincodes where you provide delivery</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search pincode or area..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    {hasPermission('create_service_areas') && (
                        <Button onClick={() => handleOpenDialog(null)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Service Area
                        </Button>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Supported Pincodes</CardTitle>
                    <CardDescription>
                        Only addresses with these pincodes will be able to place orders.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : serviceAreas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold">No service areas defined</h3>
                            <p className="text-muted-foreground max-w-xs">
                                Add your first pincode to start accepting orders from that area.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50">
                                            <TableHead>Pincode</TableHead>
                                            <TableHead>Area Name</TableHead>
                                            <TableHead>Status</TableHead>
                                            {(hasPermission('edit_service_areas') || hasPermission('delete_service_areas')) && (
                                                <TableHead>Actions</TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedAreas.map((area) => (
                                            <TableRow key={area.id}>
                                                <TableCell className="font-medium">{area.pincode}</TableCell>
                                                <TableCell>{area.areaName}</TableCell>
                                                <TableCell>
                                                    {area.active ? (
                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                                            Active
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
                                                            Inactive
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                {(hasPermission('edit_service_areas') || hasPermission('delete_service_areas')) && (
                                                    <TableCell >
                                                        <div>
                                                            {hasPermission('edit_service_areas') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleOpenDialog(area)}
                                                                    className="h-8 w-8"
                                                                >
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {hasPermission('delete_service_areas') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-destructive hover:text-black"
                                                                    onClick={() => {
                                                                        setSelectedArea(area);
                                                                        setIsDeleteDialogOpen(true);
                                                                    }}
                                                                >
                                                                    {/* <Trash2 className="h-4 w-4" /> */}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                                    <span className="text-sm text-muted-foreground mr-2">
                                        Showing {Math.min(filteredAreas.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredAreas.length, currentPage * itemsPerPage)} of {filteredAreas.length}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage <= 1}
                                        className="h-8 w-8"
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
                                        className="h-8 w-8"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{selectedArea ? 'Edit Service Area' : 'Add Service Area'}</DialogTitle>
                        <DialogDescription>
                            Enter the pincode and a descriptive name for the area.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4 py-4">
                            {error && (
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="pincode">Pincode *</Label>
                                <Input
                                    id="pincode"
                                    placeholder="e.g. 560001"
                                    value={formData.pincode}
                                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                    maxLength={6}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="areaName">Area Name *</Label>
                                    <span className={`text-[10px] ${formData.areaName.length >= 30 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                                        {formData.areaName.length}/30
                                    </span>
                                </div>
                                <Input
                                    id="areaName"
                                    value={formData.areaName}
                                    onChange={(e) => setFormData({ ...formData, areaName: e.target.value })}
                                    maxLength={30}
                                    required
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="active"
                                    checked={formData.active}
                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <Label htmlFor="active">Active (Clients can select this pincode)</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {selectedArea ? 'Update' : 'Add'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove {selectedArea?.pincode} from your service areas.
                            Customers with this pincode will no longer be able to place new orders.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
}
