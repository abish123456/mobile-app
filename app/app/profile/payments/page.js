'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../../components/ui/button';
import { ArrowLeft, Loader2, Save, CreditCard } from 'lucide-react';
import PaymentMethodsManager from '../../../../components/app/PaymentMethodsManager';
import { toast } from 'react-hot-toast';

export default function PaymentMethodsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // State matching ProfilePage logic
    const [paymentMethods, setPaymentMethods] = useState({ upi: [], card: [] });
    const [originalPaymentMethods, setOriginalPaymentMethods] = useState({ upi: [], card: [] });
    const [paymentMethodChanges, setPaymentMethodChanges] = useState([]);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/shop/api/user/profile');
            const data = await response.json();

            if (response.ok && data.profile) {
                const loadedMethods = data.profile.paymentMethods || { upi: [], card: [] };
                setPaymentMethods(loadedMethods);
                setOriginalPaymentMethods(JSON.parse(JSON.stringify(loadedMethods)));
            } else {
                toast.error('Failed to load profile');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            toast.error('Failed to load payment methods');
        } finally {
            setIsLoading(false);
        }
    };

    // Reused logic from ProfilePage
    const handlePaymentMethodChange = (change) => {
        // ... (Logic to update paymentMethodChanges and local state)
        // If setting as default, we need to unset other defaults of the same type
        if (change.action === 'update' && change.isDefault === true) {
            setPaymentMethodChanges((prev) => {
                const filtered = prev.filter(
                    (c) => !(c.action === 'update' && c.type === change.type && c.id !== change.id)
                );
                const otherDefaults = paymentMethods[change.type]
                    .filter((pm) => pm.id !== change.id && pm.isDefault)
                    .map((pm) => ({
                        action: 'update',
                        id: pm.id,
                        type: change.type,
                        details: pm.details,
                        isDefault: false,
                    }));

                const existingIndex = filtered.findIndex(
                    (c) => c.id === change.id && c.action === 'update'
                );

                if (existingIndex >= 0) {
                    const updated = [...filtered, ...otherDefaults];
                    updated[existingIndex] = change;
                    return updated;
                } else {
                    return [...filtered, change, ...otherDefaults];
                }
            });
        } else {
            setPaymentMethodChanges((prev) => {
                const existingIndex = prev.findIndex(
                    (c) => c.id === change.id && c.action === change.action
                );
                if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = change;
                    return updated;
                } else {
                    return [...prev, change];
                }
            });
        }

        // Update local UI
        if (change.action === 'add') {
            const newPm = {
                id: change.id || `temp-${Date.now()}-${Math.random()}`,
                type: change.type,
                details: change.details,
                isDefault: change.isDefault || false,
                verified: change.verified || false,
                cardBrand: change.cardBrand || null,
                cardLast4: change.cardLast4 || null,
                razorpayTokenId: change.razorpayTokenId || null,
            };
            setPaymentMethods((prev) => ({
                ...prev,
                [change.type]: [...prev[change.type], newPm],
            }));
        } else if (change.action === 'remove') {
            setPaymentMethods((prev) => ({
                ...prev,
                [change.type]: prev[change.type].filter((pm) => pm.id !== change.id),
            }));
        } else if (change.action === 'update') {
            setPaymentMethods((prev) => ({
                ...prev,
                [change.type]: prev[change.type].map((pm) =>
                    pm.id === change.id
                        ? { ...pm, isDefault: change.isDefault }
                        : { ...pm, isDefault: false }
                ),
            }));
        }
    };

    const handleSave = async () => {
        if (paymentMethodChanges.length === 0) {
            toast('No changes to save');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                // We only send payment methods changes
                paymentMethods: paymentMethodChanges
            };

            // Reuse profile update endpoint - it should handle partial updates if designed well, 
            // but ProfilePage usually sends everything. 
            // We need to make sure we don't accidentally wipe other fields if the API expects them.
            // Let's check api/user/profile. Based on typical implementation, it likely updates only provided fields or merges.
            // If it expects full profile, we might need to fetch and send back valid existing data, 
            // BUT usually patch/post for profile updates is merging.
            // Safe bet: The current ProfilePage sends a BIG payload. 
            // Let's try sending just paymentMethods. If the backend requires other fields (validation), it might fail.
            // Assuming the backend handles optional fields for update.

            const response = await fetch('/shop/api/user/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (response.ok) {
                toast.success('Payment methods updated successfully');
                setPaymentMethodChanges([]);
                setOriginalPaymentMethods(JSON.parse(JSON.stringify(paymentMethods)));
                router.refresh(); // Refresh to ensure data consistency
            } else {
                toast.error(data.message || 'Failed to update payment methods');
            }
        } catch (error) {
            console.error('Error saving payments:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges = paymentMethodChanges.length > 0;

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 rounded-full hover:bg-muted/50">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-lg font-bold flex items-center gap-2">
                        Payment Methods
                    </h1>
                </div>
            </header>

            <main className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground text-sm">Loading payment methods...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* <div className="space-y-1 px-1">
                            <h2 className="text-2xl font-black text-primary">Manage Payments</h2>
                            <p className="text-muted-foreground text-sm">Add or remove UPI IDs and Cards.</p>
                        </div> */}

                        <div className="bg-card/50 sm:bg-card sm:border sm:rounded-2xl sm:p-6 sm:shadow-sm">
                            <PaymentMethodsManager
                                paymentMethods={paymentMethods}
                                onChange={handlePaymentMethodChange}
                                errors={errors}
                            />
                        </div>
                    </div>
                )}
            </main>

            {/* Sticky Save Button - Offset to sit above BottomNav (only if changes) */}
            {hasChanges && (
                <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-border/40 z-30 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className="max-w-2xl mx-auto">
                        <Button
                            onClick={handleSave}
                            className="w-full shadow-lg shadow-primary/20 h-12 text-base font-bold rounded-xl gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            disabled={isSaving}
                        >
                            {isSaving ? (
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
            )}
        </div>
    );
}
