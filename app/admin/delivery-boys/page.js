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
import { Users, Plus, Edit, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function DeliveryBoysPage() {
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
  });

  useEffect(() => {
    fetchDeliveryBoys();
  }, []);

  const fetchDeliveryBoys = async () => {
    setIsLoading(true);
    try {
      const response = await adminFetch('/api/admin/delivery-boys');
      const data = await response.json();
      if (data.success) {
        setDeliveryBoys(data.deliveryBoys || []);
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        toast.error(data.message || 'Failed to fetch delivery staff');
      }
    } catch (err) {
      console.error('Error fetching delivery staff:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (deliveryBoy = null) => {
    setSelectedDeliveryBoy(deliveryBoy);
    if (deliveryBoy) {
      setFormData({
        name: deliveryBoy.name,
        phone: deliveryBoy.phone,
      });
    } else {
      setFormData({
        name: '',
        phone: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedDeliveryBoy(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (formData.phone.length !== 10) {
      toast.error('Phone number must be exactly 10 digits');
      return;
    }

    setIsSubmitting(true);

    try {
      const url = selectedDeliveryBoy
        ? `/api/admin/delivery-boys/${selectedDeliveryBoy.id}`
        : '/api/admin/delivery-boys';
      const method = selectedDeliveryBoy ? 'PUT' : 'POST';

      const payload = { ...formData };

      const response = await adminFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          selectedDeliveryBoy
            ? 'Delivery staff updated successfully!'
            : 'Delivery staff created successfully!'
        );
        handleCloseDialog();
        fetchDeliveryBoys();
      } else {
        toast.error(data.message || 'Failed to save delivery Staff');
      }
    } catch (err) {
      console.error('Error saving delivery Staff:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const response = await adminFetch(`/api/admin/delivery-boys/${selectedDeliveryBoy.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setIsDeleteDialogOpen(false);
        setSelectedDeliveryBoy(null);
        fetchDeliveryBoys();
        toast.success('Delivery staff deleted successfully!');
      } else {
        toast.error(data.message || 'Failed to delete delivery staff');
      }
    } catch (err) {
      console.error('Error deleting delivery staff:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPages = Math.ceil(deliveryBoys.length / itemsPerPage);
  const paginatedDeliveryBoys = deliveryBoys.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Delivery Staff</h1>
          <p className="text-muted-foreground">Manage delivery personnel profiles</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            {hasPermission('create_delivery_staff') && (
              <Button onClick={() => handleOpenDialog(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Delivery Staff
              </Button>
            )}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedDeliveryBoy ? 'Edit Delivery staff' : 'Add New Delivery staff'}
              </DialogTitle>
              <DialogDescription>
                {selectedDeliveryBoy
                  ? 'Update delivery staff information'
                  : 'Add a new delivery staff to the system'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.replace(/[0-9]/g, '') })}
                    placeholder="Enter name"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    placeholder="Enter phone number"
                    required
                    maxLength={10}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    selectedDeliveryBoy ? 'Update' : 'Create'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Delivery Staff List</CardTitle>
            <CardDescription>
              {deliveryBoys.length} delivery staff{deliveryBoys.length !== 1 ? 's' : ''} total
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {(isLoading && deliveryBoys.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : deliveryBoys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No delivery staff</h3>
              <p className="text-muted-foreground mb-4">
                Add your first delivery staff to get started
              </p>
              {hasPermission('create_delivery_staff') && (
                <Button onClick={() => handleOpenDialog(null)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Delivery Staff
                </Button>
              )}
            </div>
          ) : (
            <div className={`rounded-md border transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    {(hasPermission('edit_delivery_staff') || hasPermission('delete_delivery_staff')) && (
                      <TableHead>Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeliveryBoys.map((deliveryBoy) => (
                    <TableRow key={deliveryBoy.id}>
                      <TableCell className="font-medium">{deliveryBoy.name}</TableCell>
                      <TableCell>{deliveryBoy.phone}</TableCell>
                      {(hasPermission('edit_delivery_staff') || hasPermission('delete_delivery_staff')) && (
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {hasPermission('edit_delivery_staff') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDialog(deliveryBoy)}
                                disabled={isSubmitting}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {hasPermission('delete_delivery_staff') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedDeliveryBoy(deliveryBoy);
                                  setIsDeleteDialogOpen(true);
                                }}
                                disabled={isSubmitting}
                                className="text-destructive hover:text-black"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
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
          )}

          {/* Pagination Controls */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground mr-2">
                Showing {Math.min(deliveryBoys.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(deliveryBoys.length, currentPage * itemsPerPage)} of {deliveryBoys.length}
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
      </Card >

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will delete the delivery staff "{selectedDeliveryBoy?.name}". They will no
                  longer appear in active lists.
                </p>
                {selectedDeliveryBoy?.assignedRouteNames && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                    
                    <p className="mt-1">
                      <strong>{selectedDeliveryBoy.name}</strong> assigned to <strong>{selectedDeliveryBoy.assignedRouteNames}</strong>. After removing this staff, please assign another staff to this <strong>{selectedDeliveryBoy.assignedRouteNames}</strong>
                    </p>
                  </div>
                )}
              </div>
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
    </div >
  );
}
