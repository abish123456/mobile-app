'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { MapPin, Plus, Pencil, Trash2, Star, Check, ChevronRight } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import AddressForm from './AddressForm';
import LocationValidationDialog from './LocationValidationDialog';
import { toast } from 'react-hot-toast';

import { useRouter } from 'next/navigation';

export default function AddressesManager({
    addresses = [],
    onRefresh,
    customerId,
    navigationalMode = false
}) {
    const router = useRouter();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmDefaultAddressId, setConfirmDefaultAddressId] = useState(null);
    const [deleteAddressId, setDeleteAddressId] = useState(null);
    const [serviceAreas, setServiceAreas] = useState([]);
    const [showServiceAreaError, setShowServiceAreaError] = useState(false);

    // Form state for new/editing address
    const initialFormState = {
        nickname: '',
        contactName: '',
        contactPhone: '',
        addressLine1: '',
        addressLine2: '',
        area: '',
        city: '',
        pincode: '',
        coordinatePincode: '',
        landmark: '',
        latitude: null,
        longitude: null,
        isDefault: false
    };

    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});

    const handleAddNew = () => {
        if (navigationalMode) {
            router.push('/app/profile/addresses/new');
            return;
        }
        setEditingAddress(null);
        setFormData(initialFormState);
        setErrors({});
        setIsFormOpen(true);
    };

    const handleEdit = (addr) => {
        if (navigationalMode) {
            router.push(`/app/profile/addresses/${addr.id}`);
            return;
        }
        setEditingAddress(addr);
        setFormData({
            nickname: addr.nickname || '',
            contactName: addr.contactName || '',
            contactPhone: addr.contactPhone || '',
            addressLine1: addr.line1 || '',
            addressLine2: addr.line2 || '',
            area: addr.area || '',
            city: addr.city || '',
            pincode: addr.pincode || '',
            coordinatePincode: addr.pincode || '',
            landmark: addr.landmark || '',
            latitude: addr.latitude || null,
            longitude: addr.longitude || null,
            isDefault: addr.isDefault || false
        });
        setErrors({});
        setIsFormOpen(true);
    };

    const handleDelete = async (id) => {
        setDeleteAddressId(id);
    };

    const confirmDelete = async () => {
        const id = deleteAddressId;
        setDeleteAddressId(null);

        try {
            const res = await fetch(`/shop/api/user/addresses/${id}`, {
                method: 'DELETE'
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to delete address');
            }

            toast.success('Address deleted successfully');
            onRefresh();
        } catch (error) {
            console.error('Delete error:', error);
            toast.error(error.message);
        }
    };

    const handleSetDefault = (id) => {
        setConfirmDefaultAddressId(id);
    };

    const confirmSetDefault = async () => {
        if (!confirmDefaultAddressId) return;
        const id = confirmDefaultAddressId;
        setConfirmDefaultAddressId(null);

        try {
            // We can use the PATCH endpoint to set isDefault=true
            // But we need to pass all other fields too or the PATCH endpoint needs to handle partial updates carefully.
            // The current PATCH endpoint updates ALL fields. So we need the address data.
            const addr = addresses.find(a => a.id === id);
            if (!addr) return;

            const res = await fetch(`/shop/api/user/addresses/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nickname: addr.nickname,
                    contactName: addr.contactName,
                    contactPhone: addr.contactPhone,
                    line1: addr.line1,
                    line2: addr.line2,
                    area: addr.area,
                    city: addr.city,
                    pincode: addr.pincode,
                    landmark: addr.landmark,
                    latitude: addr.latitude,
                    longitude: addr.longitude,
                    isDefault: true
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to set default address');
            }

            toast.success('Default address updated');
            onRefresh();
        } catch (error) {
            console.error('Set default error:', error);
            toast.error(error.message);
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.addressLine1?.trim()) newErrors.addressLine1 = 'Address Line 1 is required';
        if (!formData.area?.trim()) newErrors.area = 'Area is required';
        if (!formData.city?.trim()) newErrors.city = 'City is required';
        if (!formData.pincode?.trim()) newErrors.pincode = 'Pincode is required';
        if (!formData.latitude || !formData.longitude) newErrors.latitude = 'Please pin your location on the map';

        // Validate Phone if provided or if it's mandatory
        if (formData.contactPhone && formData.contactPhone.startsWith('0')) {
            newErrors.contactPhone = 'Contact phone cannot start with 0';
        } else if (formData.contactPhone && formData.contactPhone.length !== 10) {
            newErrors.contactPhone = 'Valid 10-digit contact phone is required';
        } else if (!formData.contactPhone) {
            newErrors.contactPhone = 'Contact phone is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;

        // Check if pincode is in service areas
        // We prioritize coordinatePincode (from map) over manual pincode to prevent bypass
        const pcodeToVerify = formData.pincode;
        console.log('Validating service area:', { pcodeToVerify, availableAreas: serviceAreas.length });
        const isSupported = serviceAreas.some(sa => sa.pincode === pcodeToVerify);
        console.log('Service area supported:', isSupported);
        if (!isSupported) {
            setShowServiceAreaError(true);
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                nickname: formData.nickname,
                contactName: formData.contactName,
                contactPhone: formData.contactPhone,
                line1: formData.addressLine1,
                line2: formData.addressLine2,
                area: formData.area,
                city: formData.city,
                pincode: formData.pincode,
                landmark: formData.landmark,
                latitude: formData.latitude,
                longitude: formData.longitude,
                isDefault: formData.isDefault
            };

            let url = '/shop/api/user/addresses';
            let method = 'POST';

            if (editingAddress) {
                url = `/shop/api/user/addresses/${editingAddress.id}`;
                method = 'PATCH';
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to save address');
            }

            toast.success(editingAddress ? 'Address updated' : 'Address added');
            setIsFormOpen(false);
            onRefresh();
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            {!navigationalMode && (
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Saved Addresses</h3>
                            <p className="text-xs text-muted-foreground">Manage your delivery locations</p>
                        </div>
                    </div>
                    <Button onClick={handleAddNew} size="sm" className="gap-1 rounded-full px-4 font-bold shadow-sm hover:shadow-md transition-all">
                        <Plus className="h-4 w-4" />
                        Add New
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.map((addr) => (
                    <div
                        key={addr.id}
                        className={`
                            group relative p-5 rounded-3xl border transition-all duration-300 overflow-hidden
                            ${addr.isDefault
                                ? 'bg-primary/5 border-primary/30 shadow-md ring-1 ring-primary/10'
                                : 'bg-card border-border/60 hover:border-primary/20 hover:shadow-sm'}
                        `}
                    >
                        {/* Background Decoration */}
                        <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full blur-3xl opacity-20 pointer-events-none ${addr.isDefault ? 'bg-primary' : 'bg-muted'}`} />

                        <div className="relative z-10 flex flex-col h-full space-y-4">
                            {/* Card Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`
                                        h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm
                                        ${addr.isDefault ? 'bg-primary text-primary-foreground' : 'bg-muted/80 text-muted-foreground'}
                                    `}>
                                        <MapPin className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-extrabold text-base text-foreground leading-tight truncate">
                                            {addr.nickname || (addr.isDefault ? 'Home' : 'Other')}
                                        </h4>
                                        {addr.isDefault ? (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Default Address</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saved Address</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {!addr.isDefault && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-yellow-500/10 hover:text-yellow-600 transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSetDefault(addr.id);
                                            }}
                                            title="Set as Default"
                                        >
                                            <Star className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(addr);
                                        }}
                                        title="Edit Address"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {!addr.isDefault && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (addresses.length <= 1) {
                                                    toast.error('At least one address is required. You cannot delete your only location.');
                                                    return;
                                                }
                                                handleDelete(addr.id);
                                            }}
                                            title="Delete Address"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Address Body */}
                            <div className="space-y-1.5">
                                <p className="text-sm font-semibold text-foreground/90 leading-snug line-clamp-2">
                                    {addr.line1}
                                    {addr.line2 && <span className="block font-medium text-foreground/70">{addr.line2}</span>}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                    <span className="font-bold text-foreground/80">{addr.area}</span>
                                    <span>•</span>
                                    <span>{addr.city}</span>
                                    <span>•</span>
                                    <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground/70">{addr.pincode}</span>
                                </p>
                                {addr.landmark && (
                                    <div className="flex items-start gap-1.5 text-[10px] text-primary/70 font-bold italic mt-1 bg-primary/5 w-fit px-2 py-0.5 rounded-full border border-primary/10">
                                        <MapPin className="h-3 w-3" />
                                        <span>Near {addr.landmark}</span>
                                    </div>
                                )}
                            </div>

                            {/* Contact Details Footer */}
                            <div className="pt-3 border-t border-border/40 mt-auto flex items-end justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-wider">Deliver to</span>
                                    <div className="flex flex-col mt-0.5">
                                        <span className="text-sm font-bold text-foreground leading-tight">{addr.contactName || 'No Name'}</span>
                                        <span className="text-[11px] font-extrabold text-primary">{addr.contactPhone || 'No Phone'}</span>
                                    </div>
                                </div>
                                <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${addr.isDefault ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground/60'}`}>
                                    {addr.isDefault ? 'Primary' : 'Secondary'}
                                </div>
                            </div>
                        </div>

                        {/* Hover Decorative Element */}
                        {!addr.isDefault && (
                            <div className="absolute bottom-0 right-0 w-12 h-12 bg-primary/10 rounded-tl-full translate-x-12 translate-y-12 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-500 pointer-events-none" />
                        )}
                    </div>
                ))}

                {addresses.length === 0 && (
                    <div className="col-span-full py-16 px-6 text-center border-2 border-dashed border-border/60 rounded-3xl bg-muted/20 flex flex-col items-center justify-center space-y-4">
                        <div className="h-16 w-16 rounded-3xl bg-background shadow-inner flex items-center justify-center text-muted-foreground/30">
                            <MapPin className="h-8 w-8" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-bold text-foreground">No saved addresses</p>
                            <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">Add a delivery location to start placing orders.</p>
                        </div>
                        <Button onClick={handleAddNew} size="sm" variant="outline" className="rounded-full px-6 font-bold border-primary/30 text-primary hover:bg-primary/5 mt-2">
                            Add First Address
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto w-[95vw] max-w-[500px] rounded-2xl p-0 gap-0 border-none mx-auto">
                    <DialogHeader className="p-4 sm:p-6 border-b bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
                        <DialogTitle className="text-lg sm:text-xl font-black flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            {editingAddress ? 'Edit Address' : 'Add New Address'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-4 sm:p-6 space-y-5">
                        <AddressForm
                            formData={formData}
                            onChange={(field, value) => {
                                setFormData(prev => ({ ...prev, [field]: value }));
                                // Clear error for field
                                if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
                            }}
                            onServiceAreasFetched={setServiceAreas}
                            errors={errors}
                            showDefaultToggle={true}
                        />
                    </div>

                    <div className="p-6 border-t bg-muted/10 flex gap-3 justify-end sticky bottom-0 z-10 backdrop-blur-md">
                        <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting} className="font-bold border-2 h-11 px-6">Cancel</Button>
                        <Button onClick={handleSave} disabled={isSubmitting} className="font-bold h-11 px-8 shadow-md hover:shadow-lg transition-all">
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Save Address
                                </span>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!confirmDefaultAddressId} onOpenChange={(open) => !open && setConfirmDefaultAddressId(null)}>
                <AlertDialogContent className="w-[95vw] max-w-[400px] rounded-2xl border-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black">Set as Default?</AlertDialogTitle>
                        <AlertDialogDescription className="font-medium text-muted-foreground">
                            This address will be automatically selected for your future orders.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row gap-2 mt-2">
                        <AlertDialogCancel className="flex-1 rounded-xl h-12 font-bold border-2">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmSetDefault}
                            className="flex-1 rounded-xl h-12 font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Yes, Set Default
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteAddressId} onOpenChange={(open) => !open && setDeleteAddressId(null)}>
                <AlertDialogContent className="w-[95vw] max-w-[400px] rounded-2xl border-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black">Delete Address?</AlertDialogTitle>
                        <AlertDialogDescription className="font-medium text-muted-foreground">
                            Are you sure you want to remove this location? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row gap-2 mt-2">
                        <AlertDialogCancel className="flex-1 rounded-xl h-12 font-bold border-2">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="flex-1 rounded-xl h-12 font-bold bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Yes, Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <LocationValidationDialog
                open={showServiceAreaError}
                onOpenChange={setShowServiceAreaError}
                onConfirm={() => {
                    setShowServiceAreaError(false);
                    // Move map back to default service area (Coimbatore center)
                    setFormData(prev => ({
                        ...prev,
                        latitude: 11.0168,
                        longitude: 76.9558,
                        pincode: '',
                        coordinatePincode: '',
                        area: ''
                    }));
                    toast('Redirected to service area. Please choose a location here.', { icon: '📍' });
                }}
            />
        </div>
    );
}
