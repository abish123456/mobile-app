'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../../../components/ui/button';
import { ArrowLeft, Save, MapPin, Loader2 } from 'lucide-react';
import AddressForm from '../../../../../components/app/AddressForm';
import LocationValidationDialog from '../../../../../components/app/LocationValidationDialog';
import { toast } from 'react-hot-toast';

export default function NewAddressPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
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

    const [errors, setErrors] = useState({});

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

            const res = await fetch('/shop/api/user/addresses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to save address');
            }

            toast.success('Address added successfully');
            router.replace('/app/profile/addresses');
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Header - Glassmorphism */}
            <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 rounded-full hover:bg-muted/50">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-lg font-bold flex-1 truncate">
                    Add New Address
                </h1>
            </header>

            <main className="p-4 sm:p-6 max-w-lg mx-auto space-y-6">
                {/* <div className="space-y-1.5 px-1 pb-2">
                    <h2 className="text-2xl font-black text-primary tracking-tight">Location Details</h2>
                    <p className="text-muted-foreground text-sm font-medium">Where should we deliver your water cans?</p>
                </div> */}

                <div className="bg-card/0 sm:bg-card sm:border sm:rounded-2xl sm:p-6 sm:shadow-sm">
                    <AddressForm
                        formData={formData}
                        onChange={(field, value) => {
                            setFormData(prev => ({ ...prev, [field]: value }));
                            if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
                        }}
                        onServiceAreasFetched={(areas) => {
                            console.log('NewAddressPage: Received service areas:', areas.length);
                            setServiceAreas(areas);
                        }}
                        errors={errors}
                    />
                </div>
            </main>

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
                                Save Address
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
