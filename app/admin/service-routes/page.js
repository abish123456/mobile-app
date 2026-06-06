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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../../components/ui/popover';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { Map, Plus, Edit, Trash2, Loader2, Search, X, Check, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '../../../components/ui/calendar';
import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function ServiceRoutesPage() {
    const [serviceRoutes, setServiceRoutes] = useState([]);
    const [activeServiceAreas, setActiveServiceAreas] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Dialogs
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [confirmImpact, setConfirmImpact] = useState({ added: [], removed: [] });

    // Selections
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form Data for Route (Create/Edit)
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        assignedPincodes: [],
    });

    // Popover state for pincode selection
    const [isPostalCodePopoverOpen, setIsPostalCodePopoverOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                fetchServiceRoutes(),
                fetchServiceAreas(),
            ]);
        } catch (err) {
            console.error('Error fetching data:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchServiceRoutes = async () => {
        const response = await adminFetch(`/api/admin/service-routes`);
        const data = await response.json();
        if (data.success) {
            setServiceRoutes(data.serviceRoutes || []);
        } else {
            toast.error(data.message || 'Failed to fetch routes');
        }
    };

    const fetchServiceAreas = async () => {
        const response = await adminFetch('/api/admin/service-areas');
        const data = await response.json();
        if (data.success) {
            setActiveServiceAreas(data.serviceAreas?.filter(sa => sa.active) || []);
        }
    };

    const handleOpenDialog = (route = null) => {
        setSelectedRoute(route);
        if (route) {
            const pincodes = route.serviceAreas
                ? route.serviceAreas.map(sa => sa.pincode)
                : [];

            setFormData({
                name: route.name,
                description: route.description || '',
                assignedPincodes: pincodes,
            });
        } else {
            setFormData({
                name: '',
                description: '',
                assignedPincodes: [],
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setSelectedRoute(null);
        setSearchTerm('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // If editing an existing route, check for pincode changes
        if (selectedRoute) {
            const originalPincodes = selectedRoute.serviceAreas?.map(sa => sa.pincode) || [];
            const newPincodes = formData.assignedPincodes;

            const added = newPincodes.filter(p => !originalPincodes.includes(p));
            const removed = originalPincodes.filter(p => !newPincodes.includes(p));

            if (added.length > 0 || removed.length > 0) {
                setConfirmImpact({ added, removed });
                setIsConfirmDialogOpen(true);
                return;
            }
        }

        executeSubmit();
    };

    const executeSubmit = async () => {
        setIsSubmitting(true);
        setIsConfirmDialogOpen(false);

        try {
            const url = selectedRoute
                ? `/api/admin/service-routes/${selectedRoute.id}`
                : '/api/admin/service-routes';
            const method = selectedRoute ? 'PUT' : 'POST';

            const payload = {
                name: formData.name,
                description: formData.description,
                assignedPincodes: formData.assignedPincodes,
            };

            const response = await adminFetch(url, { method, body: JSON.stringify(payload) });
            const data = await response.json();

            if (data.success) {
                toast.success(data.message || (selectedRoute ? 'Route updated!' : 'Route created!'));
                handleCloseDialog();
                fetchData();
            } else {
                toast.error(data.message || 'Operation failed');
            }
        } catch (err) {
            console.error('Error saving route:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setIsSubmitting(true);
        try {
            const response = await adminFetch(`/api/admin/service-routes/${selectedRoute.id}`, {
                method: 'DELETE',
            });
            const data = await response.json();

            if (data.success) {
                setIsDeleteDialogOpen(false);
                setSelectedRoute(null);
                fetchData();
                toast.success('Route deleted successfully!');
            } else {
                toast.error(data.message || 'Failed to delete route');
            }
        } catch (err) {
            console.error('Error deleting route:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Routes</h1>
                    <p className="text-muted-foreground">Manage routes</p>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={() => handleOpenDialog(null)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Route
                    </Button>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-lg">
                            <DialogHeader>
                                <DialogTitle>
                                    {selectedRoute ? 'Edit Route' : 'Create New Route'}
                                </DialogTitle>
                                <DialogDescription>
                                    {selectedRoute ? 'Update route details and pincodes' : 'Define a new route endpoint'}
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Route Name *</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. North Zone"
                                            required
                                            disabled={isSubmitting}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Input
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Optional description"
                                            disabled={isSubmitting}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Assigned Pincodes</Label>
                                        <div className="space-y-3">
                                            <Popover open={isPostalCodePopoverOpen} onOpenChange={setIsPostalCodePopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between font-normal">
                                                        {formData.assignedPincodes.length > 0 ? `${formData.assignedPincodes.length} selected` : "Select pincodes..."}
                                                        <Plus className="ml-2 h-4 w-4 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0" align="start">
                                                    <div className="flex items-center border-b px-3 py-2">
                                                        <Search className="mr-2 h-4 w-4 opacity-50" />
                                                        <input className="flex h-9 w-full bg-transparent outline-none" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                                    </div>
                                                    <div
                                                        className="max-h-[300px] overflow-y-auto p-1"
                                                        onWheel={(e) => e.stopPropagation()}
                                                    >
                                                        {activeServiceAreas.filter(a => a.pincode.includes(searchTerm) || a.areaName.toLowerCase().includes(searchTerm.toLowerCase())).map(area => {
                                                            const isAssignedToOther = area.serviceRouteId && area.serviceRouteId !== selectedRoute?.id;
                                                            const isSelected = formData.assignedPincodes.includes(area.pincode);

                                                            return (
                                                                <div
                                                                    key={area.id}
                                                                    className={cn(
                                                                        "flex select-none items-center rounded-sm px-2 py-1.5 text-sm transition-colors",
                                                                        isAssignedToOther ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-accent"
                                                                    )}
                                                                    onClick={() => {
                                                                        if (isAssignedToOther) return;
                                                                        const exists = formData.assignedPincodes.includes(area.pincode);
                                                                        const newPins = exists
                                                                            ? formData.assignedPincodes.filter(p => p !== area.pincode)
                                                                            : [...formData.assignedPincodes, area.pincode];
                                                                        setFormData({ ...formData, assignedPincodes: newPins });
                                                                    }}
                                                                >
                                                                    <div className={cn(
                                                                        "mr-2 flex h-4 w-4 items-center justify-center border rounded-sm transition-colors",
                                                                        isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/30",
                                                                        isAssignedToOther && "bg-muted"
                                                                    )}>
                                                                        {isSelected && <Check className="h-3 w-3" />}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span>{area.pincode} - {area.areaName}</span>
                                                                        {isAssignedToOther && (
                                                                            <span className="text-[10px] text-destructive font-medium">
                                                                                Assigned to: {area.serviceRouteName || 'Another Route'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="flex items-center justify-between border-t p-2 bg-gray-50">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setFormData({ ...formData, assignedPincodes: [] })}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                                                        >
                                                            Clear All
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => setIsPostalCodePopoverOpen(false)}
                                                            className="h-8 px-4"
                                                        >
                                                            Done
                                                        </Button>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>

                                            <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-md bg-muted/20">
                                                {formData.assignedPincodes.length === 0 ? (
                                                    <span className="text-sm text-muted-foreground py-1 px-2">No pincodes selected</span>
                                                ) : (
                                                    formData.assignedPincodes.map((pincode) => {
                                                        const area = activeServiceAreas.find(a => a.pincode === pincode);
                                                        return (
                                                            <Badge key={pincode} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 group">
                                                                {pincode} {area ? `- ${area.areaName}` : ''}
                                                                <button type="button" className="ml-1 rounded-full hover:bg-muted-foreground/20" onClick={() => {
                                                                    setFormData({ ...formData, assignedPincodes: formData.assignedPincodes.filter(p => p !== pincode) });
                                                                }}>
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </Badge>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>Cancel</Button>
                                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 custom-spin" /> : (selectedRoute ? 'Update' : 'Create')}</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Routes</CardTitle>
                    <CardDescription>
                        Manage your delivery territories and pincode groupings.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {(isLoading && serviceRoutes.length === 0) ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : serviceRoutes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Map className="h-16 w-16 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No routes found</h3>
                            <p className="text-muted-foreground mb-4">
                                Create your first route to grouping service areas.
                            </p>
                            <Button onClick={() => handleOpenDialog(null)}>
                                <Plus className="h-4 w-4 mr-2" />
                                create Route
                            </Button>
                        </div>
                    ) : (
                        <Table className={cn("rounded-md border transition-opacity", isLoading && "opacity-50 pointer-events-none")}>
                            <TableHeader className="bg-gray-50">
                                <TableRow>
                                    <TableHead>Route Name</TableHead>
                                    <TableHead>Assigned Pincodes</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {serviceRoutes.map((route) => (
                                    <TableRow key={route.id}>
                                        <TableCell className="font-medium align-top w-[200px] whitespace-normal break-words">
                                            <div>
                                                {route.name}
                                                {route.description && <p className="text-xs text-muted-foreground">{route.description}</p>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top w-[400px] whitespace-normal break-words">
                                            <div className="flex flex-wrap gap-1">
                                                {(route.serviceAreas && route.serviceAreas.length > 0) ? (
                                                    route.serviceAreas.map((sa, i) => (
                                                        <Badge key={i} variant="outline" className="text-xs">
                                                            {sa.pincode}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-muted-foreground text-xs italic">No pincodes</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top w-[100px]">
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleOpenDialog(route)}
                                                    title="Edit Route"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-black"
                                                    onClick={() => {
                                                        setSelectedRoute(route);
                                                        setIsDeleteDialogOpen(true);
                                                    }}
                                                    title="Delete Route"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Route?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete "{selectedRoute?.name}". All assigned pincodes will become unassigned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apply Changes?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>You have changed the pincode assignments. This will affect delivery orders for these areas:</p>

                                <div className="space-y-3">
                                    {confirmImpact.added.length > 0 && (
                                        <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                                            <p className="text-sm font-semibold text-blue-800 mb-1">Moving Orders:</p>
                                            <p className="text-sm text-blue-700">
                                                Orders for <strong>{confirmImpact.added.join(', ')}</strong> will be moved to this route.
                                            </p>
                                        </div>
                                    )}

                                    {confirmImpact.removed.length > 0 && (
                                        <div className="bg-amber-50 p-3 rounded-md border border-amber-100">
                                            <p className="text-sm font-semibold text-amber-800 mb-1">Unassigning Orders:</p>
                                            <p className="text-sm text-amber-700">
                                                Orders for <strong>{confirmImpact.removed.join(', ')}</strong> will become <strong>unassigned</strong> and must be mapped to a new route later.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <p className="text-xs text-muted-foreground pt-2">
                                    Note: This only affects orders that are not yet out for delivery.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                executeSubmit();
                            }}
                            disabled={isSubmitting}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & Update'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
