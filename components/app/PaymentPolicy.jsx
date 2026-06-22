'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Info, CreditCard, ShieldCheck, RefreshCcw, Truck, Ban } from 'lucide-react';

export default function PaymentPolicy({ trigger }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <button className="text-primary hover:underline font-medium text-sm">
                        Terms & Conditions
                    </button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        Terms & Conditions
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-2">
                    <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
                        {/* Payment Methods */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                Accepted Payment Methods
                            </h3>
                            <p>
                                Customers can pay online via UPI using apps like Google Pay, PhonePe, or Paytm. Online payments are processed through our payment partner <span className="font-medium text-foreground">Razorpay</span> (for payment confirmation and receipts).
                            </p>
                        </section>

                        {/* Order Confirmation */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Order Confirmation Rule
                            </h3>
                            <p>
                                An order is treated as confirmed only when payment is marked <span className="font-medium text-green-600">"Paid/Success"</span> in your order status. If payment is not confirmed, the order remains "Payment Pending" and may not be dispatched until confirmed (or switched to COD if enabled).
                            </p>
                        </section>

                        {/* Payment Failures */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                Payment Failures / Pending Payments
                            </h3>
                            <p>
                                If a UPI payment fails or is stuck processing, your order will show <span className="font-medium text-destructive">Payment Failed</span> or <span className="font-medium text-yellow-600">Processing</span>. Please wait a few minutes and use "Check Status" before trying again. Avoid paying twice.
                            </p>
                            <p className="bg-muted/50 p-2 rounded-md italic">
                                Duplicate payments: If you accidentally pay twice, we will either refund the extra amount or adjust it as credit in your next order (your choice). Keep your transaction reference/UTR for faster help.
                            </p>
                        </section>

                        {/* COD Policy */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                Cash on Delivery (COD) Policy
                            </h3>
                            <p>
                                COD may be available for select areas/customers. For repeated non-availability or cancellations, we may require prepaid orders only for future deliveries.
                            </p>
                        </section>

                        {/* Can Deposit */}
                        <section className="space-y-2 border-l-2 border-primary/20 pl-4 py-1">
                            <h3 className="text-base font-semibold text-foreground">
                                Security Deposit for Cans
                            </h3>
                            <p>
                                A refundable can deposit is recorded in your account. Deposit is refundable when:
                            </p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>All cans are returned in acceptable condition.</li>
                                <li>All dues are cleared.</li>
                            </ul>
                            <p>Damaged or lost cans may be adjusted against the deposit.</p>
                        </section>

                        {/* Cancellations */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Ban className="h-4 w-4" />
                                Cancellations
                            </h3>
                            <p>
                                <span className="font-medium text-foreground underline decoration-primary/30">Prepaid orders:</span> Cancellation is allowed only <span className="font-bold text-foreground">before 11:00 AM</span> on the day of delivery (or before route assignment).
                            </p>
                            <p>
                                <span className="font-medium text-foreground underline decoration-primary/30">After dispatch:</span> Cancellation may not be possible; if approved, delivery charges (if any) may be deducted.
                            </p>
                        </section>



                        {/* Receipts & Disputes */}
                        <section className="space-y-2">
                            <h3 className="text-base font-semibold text-foreground">
                                Receipts, Billing & Disputes
                            </h3>
                            <p>
                                A digital receipt/status is available in your order history. If you face a dispute (“debited but not updated”), contact support with your <span className="font-medium text-foreground">Order ID + UTR/transaction reference</span>.
                            </p>
                        </section>
                    </div>
                </div>

                <DialogFooter className="p-4 border-t bg-muted/20">
                    <Button type="button" onClick={() => document.querySelector('[data-state="open"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} className="w-full sm:w-auto">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
