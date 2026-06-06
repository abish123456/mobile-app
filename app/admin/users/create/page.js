'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2, UserPlus, Phone, User } from 'lucide-react';
import { adminFetch } from '../../../../lib/admin-api';
import toast from 'react-hot-toast';

export default function CreateUserPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        phone: '',
        name: '',
        cansInHand: 0,
        depositWalletBalance: 0,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [depositRate, setDepositRate] = useState(200);

    useEffect(() => {
        // Fetch products to get dynamic deposit rate
        const fetchProducts = async () => {
            try {
                const res = await adminFetch('/api/admin/products');
                const data = await res.json();
                if (data.success && Array.isArray(data.products)) {
                    // Find first product with deposit amount
                    const rate = data.products.find(p => p.depositAmount > 0)?.depositAmount || 200;
                    setDepositRate(rate);
                }
            } catch (err) {
                console.error('Failed to fetch products for deposit rate', err);
            }
        };
        fetchProducts();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        // For phone, only allow numbers and limit to 10 digits
        if (name === 'phone') {
            const numericValue = value.replace(/\D/g, '').slice(0, 10);
            setFormData(prev => ({ ...prev, [name]: numericValue }));
        } else if (name === 'cansInHand') {
            const cans = parseInt(value) || 0;
            setFormData(prev => ({
                ...prev,
                cansInHand: cans,
                depositWalletBalance: cans * depositRate // Auto-calculate balance with dynamic rate
            }));
        } else if (name === 'depositWalletBalance') {
            // Read-only now, but keeping for safety if removed later
            setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }

        // Clear errors on change
        if (error) setError('');
        if (success) setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validation
        if (!formData.phone || formData.phone.length !== 10) {
            setError('Please enter a valid 10-digit phone number.');
            return;
        }

        setIsLoading(true);

        try {
            const response = await adminFetch('/api/admin/users/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess('User created successfully!');
                toast.success(`User ${formData.phone} created!`);
                // Reset form
                setFormData({ phone: '', name: '', cansInHand: 0, depositWalletBalance: 0 });
            } else {
                setError(data.message || 'Failed to create user');
            }
        } catch (err) {
            console.error('Error creating user:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-full">
                    <UserPlus className="h-8 w-8 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">Create User</h1>
                    <p className="text-muted-foreground">Manually register a new customer</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>User Details</CardTitle>
                    <CardDescription>
                        Add a new user to the system. They will be able to login using this phone number via OTP.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Error & Success Messages */}
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {success && (
                            <Alert className="bg-green-50 text-green-800 border-green-200">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <AlertDescription>{success}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
                                <div className="flex gap-2">
                                    <div className="flex items-center justify-center px-4 py-1 border rounded-md bg-muted text-muted-foreground w-[60px]">
                                        +91
                                    </div>
                                    <Input
                                        id="phone"
                                        name="phone"
                                        placeholder="Enter 10-digit mobile number"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="flex-1"
                                        required
                                        maxLength={10}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    The user will receive OTPs on this number for login.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="Enter customer name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="pl-9"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="cansInHand">Cans In Hand (Count)</Label>
                                    <Input
                                        id="cansInHand"
                                        name="cansInHand"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={formData.cansInHand}
                                        onChange={handleChange}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Number of empty cans customer holds.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="depositWalletBalance">Deposit Balance (₹)</Label>
                                    <Input
                                        id="depositWalletBalance"
                                        name="depositWalletBalance"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={formData.depositWalletBalance}
                                        onChange={handleChange}
                                        readOnly
                                        className="bg-muted opacity-80 cursor-not-allowed font-semibold text-primary"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        Create User
                                    </>
                                )}
                            </Button>
                        </div>

                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
