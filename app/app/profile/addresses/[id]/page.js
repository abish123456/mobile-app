'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '../../../../../components/ui/button';
import { ArrowLeft, Save, MapPin, Trash2, Loader2, Star } from 'lucide-react';
import AddressForm from '../../../../../components/app/AddressForm';
import LocationValidationDialog from '../../../../../components/app/LocationValidationDialog';
import { toast } from 'react-hot-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../../../../components/ui/alert-dialog';

export default function EditAddressPage() {
    const router = useRouter();
    const params = useParams(); // params is a promise in Next.js 15, but we can unwrap it or use useParams
    // In current Next.js app directory structure with client components, useParams returns the params object directly.
    const { id } = params;

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [serviceAreas, setServiceAreas] = useState([]);
    const [showServiceAreaError, setShowServiceAreaError] = useState(false);

    const [formData, setFormData] = useState({
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
    });
    const [totalAddresses, setTotalAddresses] = useState(0);

    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchAddressDetails();
    }, [id]);

    const fetchAddressDetails = async () => {
        try {
            // We need to fetch the specific address details.
            // Since we don't have a direct "get single address" endpoint that returns just one,
            // we'll fetch the profile to get all addresses and find the one we need.
            // OR we can rely on the fact that we can pass data via state, but a fresh fetch is safer.
            const response = await fetch('/shop/api/user/profile');
            const data = await response.json();

            if (response.ok && data.profile && data.profile.addresses) {
                const addrs = data.profile.addresses;
                setTotalAddresses(addrs.length);
                const addr = addrs.find(a => a.id === id);
                if (addr) {
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
                } else {
                    toast.error('Address not found');
                    router.push('/app/profile');
                }
            }
        } catch (error) {
            console.error('Error fetching address:', error);
            toast.error('Failed to load address details');
        } finally {
            setIsLoading(false);
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.addressLine1?.trim()) newErrors.addressLine1 = 'Address Line 1 is required';
        if (!formData.area?.trim()) newErrors.area = 'Area is required';
        if (!formData.city?.trim()) newErrors.city = 'City is required';
        if (!formData.pincode?.trim()) newErrors.pincode = 'Pincode is required';
        if (!formData.latitude || !formData.longitude) newErrors.latitude = 'Please pin your location on the map';

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

            const res = await fetch(`/shop/api/user/addresses/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to update address');
            }

            toast.success('Address updated successfully');
            router.replace('/app/profile/addresses');
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (totalAddresses <= 1) {
            toast.error('At least one address is required. You cannot delete your only location.');
            return;
        }

        if (formData.isDefault) {
            toast.error('Cannot delete the default address. Please set another address as default first.');
            return;
        }

        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        setShowDeleteConfirm(false);
        try {
            const res = await fetch(`/shop/api/user/addresses/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to delete address');
            }

            toast.success('Address deleted successfully');
            router.replace('/app/profile');
        } catch (error) {
            console.error('Delete error:', error);
            toast.error(error.message);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Header - Glassmorphism */}
            <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 rounded-full hover:bg-muted/50">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-lg font-bold truncate">
                        Edit Address
                    </h1>
                </div>
                {!formData.isDefault && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDelete}
                        className="text-destructive hover:bg-destructive/10 rounded-full h-8 w-8"
                        title="Delete Address"
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                )}
            </header>

            <main className="p-4 sm:p-6 max-w-lg mx-auto space-y-6">
                {/* <div className="space-y-1.5 px-1 pb-2">
                    <h2 className="text-2xl font-black text-primary tracking-tight">Update Details</h2>
                    <p className="text-muted-foreground text-sm font-medium">Modify your delivery location information.</p>
                </div> */}

                <div className="bg-card/0 sm:bg-card sm:border sm:rounded-2xl sm:p-6 sm:shadow-sm">
                    <AddressForm
                        formData={formData}
                        onChange={(field, value) => {
                            setFormData(prev => ({ ...prev, [field]: value }));
                            if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
                        }}
                        onServiceAreasFetched={(areas) => {
                            console.log('EditAddressPage: Received service areas:', areas.length);
                            setServiceAreas(areas);
                        }}
                        errors={errors}
                    />
                </div>

                {!formData.isDefault && (
                    <div className="px-1 sm:px-0">
                        <Button
                            variant="ghost"
                            onClick={handleDelete}
                            className="w-full h-12 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/5 font-bold flex items-center justify-center gap-2 border border-destructive/20"
                        >
                            <Trash2 className="h-5 w-5" />
                            Delete Address
                        </Button>
                    </div>
                )}
            </main>

            {/* Sticky Bottom Footer - Offset to sit above BottomNav */}
            <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-border/40 z-30">
                <div className="max-w-lg mx-auto">
                    <Button
                        onClick={handleSave}
                        className="w-full shadow-lg shadow-primary/20 h-12 text-base font-bold rounded-xl gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-5 w-5" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
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
