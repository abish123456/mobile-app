'use client';

import { useState, useEffect } from 'react';
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
} from '../../../components/ui/alert-dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Loader2, Plus, Edit, Trash2, AlertCircle, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function NotDeliveredReasonsPage() {
  const [reasons, setReasons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedReason, setSelectedReason] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
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
    reason: '',
    isActive: true,
    autoReassign: false,
    hideFromExceptions: false,
  });

  useEffect(() => {
    fetchReasons();
  }, []);

  const fetchReasons = async () => {
    setIsLoading(true);
    try {
      const response = await adminFetch('/api/admin/not-delivered-reasons');
      const data = await response.json();
      if (data.success) {
        setReasons(data.reasons || []);
      } else {
        toast.error(data.message || 'Failed to fetch reasons');
      }
    } catch (err) {
      console.error('Error fetching reasons:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setSelectedReason(null);
    setFormData({
      reason: '',
      isActive: true,
      autoReassign: false,
      hideFromExceptions: false,
    });
    setShowDialog(true);
  };

  const handleEdit = (reason) => {
    setSelectedReason(reason);
    setFormData({
      reason: reason.reason,
      isActive: reason.isActive,
      autoReassign: reason.autoReassign || false,
      hideFromExceptions: reason.hideFromExceptions || false,
    });
    setShowDialog(true);
  };

  const handleDelete = (reason) => {
    setSelectedReason(reason);
    setShowDeleteDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = selectedReason
        ? `/api/admin/not-delivered-reasons/${selectedReason.id}`
        : '/api/admin/not-delivered-reasons';
      const method = selectedReason ? 'PATCH' : 'POST';

      const response = await adminFetch(url, {
        method,
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(selectedReason ? 'Reason updated!' : 'Reason added!');
        setShowDialog(false);
        fetchReasons();
      } else {
        toast.error(data.message || 'Failed to save reason');
      }
    } catch (err) {
      console.error('Error saving reason:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsSaving(true);
    try {
      const response = await adminFetch(`/api/admin/not-delivered-reasons/${selectedReason.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        toast.success('Reason deleted!');
        setShowDeleteDialog(false);
        fetchReasons();
      } else {
        toast.error(data.message || 'Failed to delete reason');
      }
    } catch (err) {
      console.error('Error deleting reason:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Not Delivered Reasons</h1>
          <p className="text-muted-foreground">Manage the list of reasons delivery staff can choose from</p>
        </div>
        {hasPermission('create_not_delivered_reasons') && (
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Reason
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : reasons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4" />
              <p>No reasons found. Add your first reason to get started.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Sl No.</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto Reassign</TableHead>
                    <TableHead>Hide Exceptions</TableHead>
                    {(hasPermission('edit_not_delivered_reasons') || hasPermission('delete_not_delivered_reasons')) && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reasons.map((r, index) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{r.reason}</TableCell>
                      <TableCell>
                        <Badge variant={r.isActive ? 'default' : 'secondary'}>
                          {r.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.autoReassign ? 'success' : 'secondary'} className={r.autoReassign ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                          {r.autoReassign ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.hideFromExceptions ? 'secondary' : 'default'} className={r.hideFromExceptions ? "bg-gray-100 text-gray-700 hover:bg-gray-100" : ""}>
                          {r.hideFromExceptions ? 'Hidden' : 'Visible'}
                        </Badge>
                      </TableCell>
                      {(hasPermission('edit_not_delivered_reasons') || hasPermission('delete_not_delivered_reasons')) && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {hasPermission('edit_not_delivered_reasons') && (
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(r)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {hasPermission('delete_not_delivered_reasons') && (
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(r)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
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
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedReason ? 'Edit Reason' : 'Add Reason'}</DialogTitle>
            <DialogDescription>
              This reason will be visible to delivery staff when marking an order as Not Delivered.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason Text</Label>
              <Input
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Customer Not Available"
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive" className="cursor-pointer">Active Status</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoReassign"
                checked={formData.autoReassign}
                onChange={(e) => setFormData({ ...formData, autoReassign: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="autoReassign" className="cursor-pointer">Auto Reassign to Next Working Day</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hideFromExceptions"
                checked={formData.hideFromExceptions}
                onChange={(e) => setFormData({ ...formData, hideFromExceptions: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hideFromExceptions" className="cursor-pointer">Hide from Exceptions Dashboard</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the reason from the management list. Past orders will still keep their recorded reason text.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
