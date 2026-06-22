'use client';

import { useState } from 'react';
import { Label } from '../ui/label';
import { MapPin, Plus, Pencil, ChevronRight, Check } from 'lucide-react';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../ui/dialog';

/**
 * Premium Address Selector component (Mobile-First)
 * Replaces a simple dropdown with a high-quality card + selection modal
 */
export default function AddressSelector({
    addresses = [],
    customAddress = null,
    selectedAddressId,
    onSelect,
    onAddNew,
    onEdit,
    errors = {},
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedAddr = selectedAddressId === null ? customAddress : addresses.find(a => a.id === selectedAddressId);

    const handleSelect = (id, addr) => {
        onSelect(id, addr);
        setIsOpen(false);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <MapPin className="h-4 w-4" />
                    </div>
                    <Label className="text-sm font-bold text-foreground/80 lowercase tracking-tight first-letter:uppercase">Delivery Address</Label>
                </div>
                {(selectedAddressId || customAddress) && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-primary text-xs font-bold hover:bg-transparent"
                        onClick={() => onEdit(selectedAddressId)}
                    >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                    </Button>
                )}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <div className={`
            group relative p-4 rounded-2xl border-2 transition-all cursor-pointer bg-card
            ${errors.address ? 'border-destructive shadow-sm' : 'border-primary/10 hover:border-primary/30 hover:shadow-md'}
          `}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 overflow-hidden">
                                {selectedAddr ? (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-[#1a1a1a] text-base">
                                                {selectedAddressId === null ? 'New Address' : (selectedAddr.nickname || (selectedAddr.isDefault ? 'Primary' : 'Saved Address'))}
                                            </span>
                                            {selectedAddr.isDefault && (
                                                <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">Default</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-1 font-medium italic">
                                            {selectedAddressId === null
                                                ? `${selectedAddr.addressLine1}, ${selectedAddr.city}`
                                                : `${selectedAddr.line1}, ${selectedAddr.area}, ${selectedAddr.city}`}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <span className="text-sm font-bold text-muted-foreground">Tap to select or add address</span>
                                    </div>
                                )}
                            </div>
                            <div className="bg-primary/5 p-1 rounded-full group-hover:bg-primary/20 transition-colors">
                                <ChevronRight className="h-5 w-5 text-primary" />
                            </div>
                        </div>

                        {/* Premium background accent */}
                        <div className="absolute bottom-0 right-0 w-24 h-24 bg-primary/5 rounded-tl-[100px] -z-10 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                </DialogTrigger>

                <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none bg-background rounded-b-none sm:rounded-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader className="p-6 border-b bg-muted/30">
                        <DialogTitle className="text-xl font-black flex items-center gap-3">
                            <MapPin className="h-6 w-6 text-primary" />
                            Your Addresses
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {addresses.map((addr) => {
                            const isSelected = selectedAddressId === addr.id;
                            return (
                                <div
                                    key={addr.id}
                                    onClick={() => handleSelect(addr.id, addr)}
                                    className={`
                    group relative p-4 rounded-xl border-2 transition-all cursor-pointer
                    ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-card'}
                  `}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold text-sm ${isSelected ? 'text-primary' : ''}`}>
                                                    {addr.nickname || (addr.isDefault ? 'Primary' : 'Saved Address')}
                                                </span>
                                                {addr.isDefault && (
                                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase">Default</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                                                {addr.line1}, {addr.area}, {addr.city} - {addr.pincode}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                                <Check className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {customAddress && (
                            <div
                                onClick={() => handleSelect(null, customAddress)}
                                className={`
                    group relative p-4 rounded-xl border-2 transition-all cursor-pointer
                    ${selectedAddressId === null ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-card'}
                  `}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm ${selectedAddressId === null ? 'text-primary' : ''}`}>
                                                New Address
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground font-medium">
                                            {customAddress.addressLine1}, {customAddress.city}
                                        </p>
                                    </div>
                                    {selectedAddressId === null && (
                                        <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                            <Check className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            className="w-full h-14 border-dashed border-2 rounded-xl flex items-center justify-center gap-2 text-primary font-bold hover:bg-primary/5"
                            onClick={() => {
                                onAddNew();
                                setIsOpen(false);
                            }}
                        >
                            <Plus className="h-5 w-5" />
                            Add New Address
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {errors.address && (
                <p className="text-sm text-destructive px-1 font-bold italic animate-pulse">{errors.address}</p>
            )}
        </div>
    );
}
