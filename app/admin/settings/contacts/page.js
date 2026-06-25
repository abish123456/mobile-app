'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
} from '../../../../components/ui/alert-dialog';
import { Phone, Mail, Plus, Edit, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import { cn } from '../../../../lib/utils';

export default function SupportContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
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

  const [formData, setFormData] = useState({
    type: 'PHONE',
    label: '',
    value: '',
  });

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch('/api/admin/support-contacts');
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts || []);
      } else {
        toast.error(data.message || 'Failed to load support contacts');
      }
    } catch (err) {
      console.error('Error fetching support contacts:', err);
      toast.error('Network error loading support contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (contact = null) => {
    setSelectedContact(contact);
    if (contact) {
      setFormData({ type: contact.type, label: contact.label, value: contact.value });
    } else {
      setFormData({ type: 'PHONE', label: '', value: '' });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedContact(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.label.trim() || !formData.value.trim()) {
      toast.error('Please enter both label and value');
      return;
    }
    if (formData.type === 'PHONE' && formData.value.length !== 10) {
      toast.error('Phone number must be exactly 10 digits');
      return;
    }
    setIsSubmitting(true);
    try {
      const method = selectedContact ? 'PUT' : 'POST';
      const body = selectedContact
        ? { id: selectedContact.id, ...formData }
        : { ...formData };

      const res = await adminFetch('/api/admin/support-contacts', {
        method,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(selectedContact ? 'Contact updated successfully!' : 'Contact added successfully!');
        handleCloseDialog();
        fetchContacts();
      } else {
        toast.error(data.message || 'Failed to save contact');
      }
    } catch (err) {
      console.error('Error saving support contact:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedContact) return;
    setIsSubmitting(true);
    try {
      const res = await adminFetch(`/api/admin/support-contacts?id=${selectedContact.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Contact deleted successfully!');
        setIsDeleteDialogOpen(false);
        setSelectedContact(null);
        fetchContacts();
      } else {
        toast.error(data.message || 'Failed to delete contact');
      }
    } catch (err) {
      console.error('Error deleting support contact:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (contact) => {
    setTogglingId(contact.id);
    try {
      const res = await adminFetch('/api/admin/support-contacts', {
        method: 'PUT',
        body: JSON.stringify({ id: contact.id, active: !contact.active }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(contact.active ? 'Contact deactivated' : 'Contact activated');
        setContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, active: !contact.active } : c))
        );
      } else {
        toast.error(data.message || 'Failed to update status');
      }
    } catch (err) {
      console.error('Error toggling contact status:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setTogglingId(null);
    }
  };

  if (isPermsLoading) {
    return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!hasPermission('view_support_contacts')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view Support Contacts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Support Contacts</h1>
          <p className="text-muted-foreground">Manage phone numbers and emails shown to customers</p>
        </div>

        {hasPermission('create_support_contacts') && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Support Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedContact ? 'Edit Support Contact' : 'Add Support Contact'}
              </DialogTitle>
              <DialogDescription>
                {selectedContact
                  ? 'Update the support contact details'
                  : 'Add a new phone number or email for customer support'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2 ">
                  <Label htmlFor="contact-type">Type</Label>
                  <select
                    id="contact-type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value, value: '' })}
                    disabled={isSubmitting}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="PHONE">Phone Number</option>
                    <option value="EMAIL">Email Address</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-label">Label / Name *</Label>
                  <Input
                    id="contact-label"
                    type="text"
                    placeholder={formData.type === 'PHONE' ? 'e.g. Support Line 1' : 'e.g. Email Support'}
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="contact-value">
                      {formData.type === 'PHONE' ? 'Phone Number *' : 'Email Address *'}
                    </Label>
                    
                  </div>
                  <Input
                    id="contact-value"
                    type={formData.type === 'PHONE' ? 'tel' : 'text'}
                    placeholder={formData.type === 'PHONE' ? 'e.g. 9841230202' : 'e.g. support@example.com'}
                    value={formData.value}
                    onChange={(e) => {
                      if (formData.type === 'PHONE') {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setFormData({ ...formData, value: digits });
                      } else {
                        setFormData({ ...formData, value: e.target.value });
                      }
                    }}
                    maxLength={formData.type === 'PHONE' ? 10 : undefined}
                    inputMode={formData.type === 'PHONE' ? 'numeric' : undefined}
                    required
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
                    selectedContact ? 'Update' : 'Add Contact'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Contacts Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Support Contacts</CardTitle>
            <CardDescription>
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''} configured
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && contacts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Phone className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No support contacts</h3>
              <p className="text-muted-foreground mb-4">
                Add your first support contact to get started
              </p>
              {hasPermission('create_support_contacts') && (
                <Button onClick={() => handleOpenDialog(null)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Support Contact
                </Button>
              )}
            </div>
          ) : (
            <div className={`rounded-md border transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-[140px] pl-8">Type</TableHead>
                    <TableHead className="w-[170px]">Label</TableHead>
                    <TableHead className="w-[180px]">Phone / Email</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    {(hasPermission('edit_support_contacts') || hasPermission('delete_support_contacts')) && (
                      <TableHead className="w-[120px] pl-7">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} className={cn(!contact.active && 'opacity-50')}>
                      <TableCell className="w-[140px] pl-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
                            contact.type === 'PHONE'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-blue-50 text-blue-600'
                          )}>
                            {contact.type === 'PHONE'
                              ? <Phone className="h-4 w-4" />
                              : <Mail className="h-4 w-4" />
                            }
                          </div>
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {contact.type === 'PHONE' ? 'Phone' : 'Email'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px] font-medium">{contact.label}</TableCell>
                      <TableCell className="min-w-[180px] font-mono text-sm">{contact.value}</TableCell>
                      <TableCell className="w-[120px]">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                          contact.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-600'
                        )}>
                          {contact.active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      {(hasPermission('edit_support_contacts') || hasPermission('delete_support_contacts')) && (
                        <TableCell className="w-[120px]">
                          <div className="flex items-center gap-1 flex-nowrap">
                            {/* Edit */}
                            {hasPermission('edit_support_contacts') && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDialog(contact)}
                                  disabled={isSubmitting || togglingId === contact.id}
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {/* Deactivate / Activate */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleActive(contact)}
                                  disabled={togglingId === contact.id || isSubmitting}
                                  title={contact.active ? 'Deactivate' : 'Activate'}
                                  className="text-muted-foreground hover:text-primary"
                                >
                                  {togglingId === contact.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : contact.active ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            )}
                            {/* Delete */}
                            {hasPermission('delete_support_contacts') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedContact(contact);
                                  setIsDeleteDialogOpen(true);
                                }}
                                disabled={isSubmitting || togglingId === contact.id}
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
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the support contact &quot;{selectedContact?.label}&quot;
              ({selectedContact?.value}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
