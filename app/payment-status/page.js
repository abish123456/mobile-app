'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

function PaymentStatusContent() {
    const searchParams = useSearchParams();
    const status = searchParams.get('status');
    const paymentId = searchParams.get('payment_id');
    const [countdown, setCountdown] = useState(5);

    const isSuccess = status === 'success';
    const isFailed = status === 'failed';
    const isError = status === 'error';

    useEffect(() => {
        // Optional: Auto-close or redirect after some time
        // For now we just show the message
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full shadow-lg">
                <CardContent className="pt-8 pb-8 text-center space-y-6">
                    {isSuccess && (
                        <>
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="h-10 w-10 text-green-600" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl font-bold text-gray-900">Payment Successful!</h1>
                                <p className="text-gray-600">
                                    Your payment has been processed successfully.
                                </p>
                                {paymentId && (
                                    <p className="text-xs text-gray-400 font-mono">Ref: {paymentId}</p>
                                )}
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-700">
                                Please show this screen to the delivery partner.
                            </div>
                        </>
                    )}

                    {isFailed && (
                        <>
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <XCircle className="h-10 w-10 text-red-600" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl font-bold text-gray-900">Payment Failed</h1>
                                <p className="text-gray-600">
                                    The payment transaction failed or was cancelled.
                                </p>
                            </div>
                        </>
                    )}

                    {isError && (
                        <>
                            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                                <AlertCircle className="h-10 w-10 text-orange-600" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
                                <p className="text-gray-600">
                                    We verify the payment status. Please check with the delivery partner.
                                </p>
                            </div>
                        </>
                    )}

                    <div className="pt-4">
                        <p className="text-sm text-gray-500">You can close this window now.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function PaymentStatusPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <PaymentStatusContent />
        </Suspense>
    );
}
