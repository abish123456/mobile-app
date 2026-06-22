'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../../components/ui/button';
import { ArrowLeft, Loader2, Plus, MapPin } from 'lucide-react';
import AddressesManager from '../../../../components/app/AddressesManager';
import { toast } from 'react-hot-toast';

export default function AddressesPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [addresses, setAddresses] = useState([]);
    const [customerId, setCustomerId] = useState(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/shop/api/user/profile');
            const data = await response.json();

            if (response.ok && data.profile) {
                setAddresses(data.profile.addresses || []);
                setCustomerId(data.profile.id);
            } else {
                toast.error('Failed to load profile');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            toast.error('Failed to load addresses');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header - Glassmorphism */}
            <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 rounded-full hover:bg-muted/50">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-lg font-bold flex items-center gap-2">
                        My Addresses
                    </h1>
                </div>
                <Button
                    size="sm"
                    onClick={() => router.push('/app/profile/addresses/new')}
                    className="rounded-full shadow-sm gap-1 h-8"
                >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add New</span>
                </Button>
            </header>

            <main className="p-4 sm:p-6 max-w-3xl mx-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground text-sm font-medium">Loading your addresses...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <AddressesManager
                            addresses={addresses}
                            onRefresh={fetchProfile}
                            customerId={customerId}
                            navigationalMode={true}
                        />

                        {/* {addresses.length > 0 && (
                            <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em] pt-4 opacity-50">
                                End of saved locations
                            </p>
                        )} */}
                    </div>
                )}
            </main>
        </div>
    );
}
