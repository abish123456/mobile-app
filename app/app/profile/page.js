'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import AddressesManager from '../../../components/app/AddressesManager';
import AddressForm from '../../../components/app/AddressForm';
import LocationValidationDialog from '../../../components/app/LocationValidationDialog';
import {
  User,
  MapPin,
  CreditCard,
  ShoppingBag,
  History,
  LogOut,
  ChevronRight,
  Wallet,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Minus,
  Plus,
  Save,
  Hash,
  Copy,
  Pencil,
  Camera,
  Mail,
  Phone,
} from 'lucide-react';
import toast from 'react-hot-toast';

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    area: '',
    city: '',
    pincode: '',
    coordinatePincode: '',
    landmark: '',
    nickname: '',
    contactName: '',
    contactPhone: '',
    latitude: null,
    longitude: null,
    pendingOrdered: 0,
    pendingReturned: 0,
  });

  const [originalFormData, setOriginalFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    area: '',
    city: '',
    pincode: '',
    coordinatePincode: '',
    landmark: '',
    nickname: '',
    contactName: '',
    contactPhone: '',
    latitude: null,
    longitude: null,
  });

  const [paymentMethods, setPaymentMethods] = useState({ upi: [], card: [] });
  const [originalPaymentMethods, setOriginalPaymentMethods] = useState({ upi: [], card: [] });
  const [paymentMethodChanges, setPaymentMethodChanges] = useState([]); // Track add/update/remove operations
  const [customerId, setCustomerId] = useState(''); // Customer ID for admin reference
  const [copyFeedback, setCopyFeedback] = useState(''); // Lightweight copy confirmation
  const [addresses, setAddresses] = useState([]); // List of addresses

  // Check for new user flag from URL
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsEditing(true);
      setIsNewProfile(true);
    }
  }, [searchParams]);

  // Existing deposit customers flow
  const [hasExistingDeposit, setHasExistingDeposit] = useState(''); // '' | 'yes' | 'no'
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [depositProducts, setDepositProducts] = useState([]);
  const [isLoadingDepositProducts, setIsLoadingDepositProducts] = useState(false);
  const [selectedDepositProductId, setSelectedDepositProductId] = useState('');
  const [depositQuantity, setDepositQuantity] = useState(1);
  const [depositDialogError, setDepositDialogError] = useState('');

  const [serviceAreas, setServiceAreas] = useState([]);
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);
  const [errors, setErrors] = useState({});
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportContacts, setSupportContacts] = useState([]);
  const [isLoadingSupport, setIsLoadingSupport] = useState(false);


  // Deposit Refund Flow
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [depositRefunds, setDepositRefunds] = useState([]);
  const [isRefundSubmitting, setIsRefundSubmitting] = useState(false);
  const [refundDialogError, setRefundDialogError] = useState('');
  const [refundBankDetails, setRefundBankDetails] = useState({
    type: '', // Initialized as empty string
    upiId: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    accountHolderName: ''
  });

  const fetchRefundHistory = async () => {
    try {
      const res = await fetch('/shop/api/user/deposit-refund', {
        headers: {}
      });
      if (res.ok) {
        const data = await res.json();
        setDepositRefunds(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to fetch refund history", err);
    }
  };

  const handleRefundSubmit = async () => {
    setRefundDialogError('');

    if (!refundAmount || Number(refundAmount) <= 0) {
      setRefundDialogError("Invalid quantity");
      return;
    }
    if (Number(refundAmount) > (originalFormData.cansInHand || 0)) {
      setRefundDialogError(`Cannot return more than ${originalFormData.cansInHand || 0} cans`);
      return;
    }

    if (!refundBankDetails.type) {
      setRefundDialogError("Please select a preferred refund method");
      return;
    }

    if (refundBankDetails.type === 'upi' && !refundBankDetails.upiId) {
      setRefundDialogError("UPI ID is required");
      return;
    }
    if (refundBankDetails.type === 'account' && (!refundBankDetails.accountNumber || !refundBankDetails.ifscCode)) {
      setRefundDialogError("Account Number and IFSC Code are required");
      return;
    }

    setIsRefundSubmitting(true);
    try {
      // Use deposit-refund endpoint with Quantity
      const res = await fetch('/shop/api/user/deposit-refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quantity: Number(refundAmount), // refundAmount state holds the quantity input
          refundMethod: refundBankDetails.type === 'cod' ? 'COD' : 'ONLINE',
          bankDetails: refundBankDetails.type === 'cod' ? null : refundBankDetails
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Refund request submitted successfully");
        setShowRefundDialog(false);
        setRefundAmount('');
        fetchRefundHistory(); // Refresh history
      } else {
        setRefundDialogError(data.message || "Failed to submit request");
      }
    } catch (e) {
      setRefundDialogError("Network error");
    } finally {
      setIsRefundSubmitting(false);
    }
  };


  // Get phone number from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const phone = localStorage.getItem('userPhone');
      setPhoneNumber(phone || '');
    }
  }, []);


  // Fetch existing profile data
  const fetchProfile = async () => {
    setIsFetching(true);
    try {
      const response = await fetch('/shop/api/user/profile', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          // ... (existing success logic)
          const loadedForm = {
            name: data.profile.name || '',
            addressLine1: data.profile.addressLine1 || '',
            addressLine2: data.profile.addressLine2 || '',
            area: data.profile.area || '',
            city: data.profile.city || '',
            pincode: data.profile.pincode || '',
            landmark: data.profile.landmark || '',
            nickname: data.profile.nickname || '',
            contactName: data.profile.contactName || '',
            contactPhone: data.profile.contactPhone || '',
            depositWalletBalance: data.profile.depositWalletBalance || 0,
            cansInHand: data.profile.cansInHand || 0,
            totalCansCount: data.profile.totalCansCount || 0,
            pendingOrdered: data.profile.pendingOrdered || 0,
            pendingReturned: data.profile.pendingReturned || 0,
            pendingDeposit: data.profile.pendingDeposit || 0,
            latitude: data.profile.latitude || null,
            longitude: data.profile.longitude || null,
            coordinatePincode: data.profile.pincode || '',
          };
          const loadedPaymentMethods = data.profile.paymentMethods || { upi: [], card: [] };

          setFormData(loadedForm);
          setOriginalFormData(loadedForm);
          setPaymentMethods(loadedPaymentMethods);
          setOriginalPaymentMethods(JSON.parse(JSON.stringify(loadedPaymentMethods))); // Deep copy
          setCustomerId(data.profile.id || ''); // Store customer ID
          setAddresses(data.profile.addresses || []); // Set addresses

          // Check if wallet balance is low
          if (data.profile.depositWalletBalance < 0) {
            setError('Your deposit wallet balance is negative. Please reach out to support.');
          }

          // Check if profile has actual data (not just empty strings)
          const hasBasicInfo =
            loadedForm.name ||
            loadedForm.addressLine1 ||
            loadedForm.area ||
            loadedForm.city ||
            loadedForm.pincode;

          // If no basic info exists, this is a new profile (even though customer record exists)
          const isNewProfile = !hasBasicInfo;
          setIsNewProfile(isNewProfile);
          setIsEditing(!hasBasicInfo);

          // Pre-fetch deposit products if it's a new profile
          if (isNewProfile) {
            loadDepositProducts();
          }

          // Clear new user flow flag only if profile already has data
          if (hasBasicInfo) {
            localStorage.removeItem('isNewUserFlow');
            // Dispatch event to notify components
            window.dispatchEvent(new Event('newUserFlowChanged'));
          }
        } else {
          // No profile yet -> go straight into edit mode and mark as new
          setIsEditing(true);
          setIsNewProfile(true);
        }
      } else {
        if (response.status === 401) {
          // Token invalid or user deactivated
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        }
        // In case of error, allow user to try entering profile
        setIsEditing(true);
        setIsNewProfile(true);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setIsFetching(false);
    }
  };

  const fetchConfig = async () => {
    setIsLoadingSupport(true);
    try {
      const res = await fetch('/shop/api/config', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.config?.supportContacts) {
        setSupportContacts(data.config.supportContacts);
      }
    } catch (err) {
      console.error('Error fetching support config:', err);
    } finally {
      setIsLoadingSupport(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchRefundHistory();
    fetchConfig();
  }, [router]);

  // Check if there are any changes from the original data
  const hasChanges = () => {
    // Check form data changes
    const formChanged = Object.keys(formData).some((key) => {
      const val1 = formData[key];
      const val2 = originalFormData[key];

      // If both are strings, trim and compare
      if (typeof val1 === 'string' && typeof val2 === 'string') {
        return val1.trim() !== val2.trim();
      }

      // Otherwise compare directly (e.g. for numeric fields)
      return val1 !== val2;
    });

    // Check payment method changes
    const paymentMethodsChanged = paymentMethodChanges.length > 0;

    return formChanged || paymentMethodsChanged;
  };

  const validateForm = () => {
    const newErrors = {};

    // Import validation functions (using inline for now, can be imported at top)
    const validateName = (name) => {
      if (!name || !name.trim()) return { valid: false, message: 'Name is required' };
      const trimmed = name.trim();
      if (trimmed.length < 2) return { valid: false, message: 'Name must be at least 2 characters' };
      if (trimmed.length > 100) return { valid: false, message: 'Name must not exceed 100 characters' };
      if (!/^[a-zA-Z\s\-'\.]+$/.test(trimmed)) return { valid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
      return { valid: true };
    };

    const validateAddressLine = (line, fieldName = 'Address') => {
      if (!line || !line.trim()) return { valid: false, message: `${fieldName} is required` };
      const trimmed = line.trim();
      if (trimmed.length < 5) return { valid: false, message: `${fieldName} must be at least 5 characters` };
      if (trimmed.length > 200) return { valid: false, message: `${fieldName} must not exceed 200 characters` };
      return { valid: true };
    };

    const validateArea = (area) => {
      if (!area || !area.trim()) return { valid: false, message: 'Area/Zone is required' };
      const trimmed = area.trim();
      if (trimmed.length < 2) return { valid: false, message: 'Area/Zone must be at least 2 characters' };
      if (trimmed.length > 100) return { valid: false, message: 'Area/Zone must not exceed 100 characters' };
      return { valid: true };
    };

    const validateCity = (city) => {
      if (!city || !city.trim()) return { valid: false, message: 'City is required' };
      const trimmed = city.trim();
      if (trimmed.length < 2) return { valid: false, message: 'City must be at least 2 characters' };
      if (trimmed.length > 100) return { valid: false, message: 'City must not exceed 100 characters' };
      if (!/^[a-zA-Z\s\-]+$/.test(trimmed)) return { valid: false, message: 'City can only contain letters, spaces, and hyphens' };
      return { valid: true };
    };

    const validatePincode = (pincode) => {
      if (!pincode || !pincode.trim()) return { valid: false, message: 'Pincode is required' };
      const trimmed = pincode.trim();
      if (!/^\d{6}$/.test(trimmed)) return { valid: false, message: 'Pincode must be exactly 6 digits' };
      const pincodeNum = parseInt(trimmed, 10);
      if (pincodeNum < 100000 || pincodeNum > 999999) return { valid: false, message: 'Pincode must be between 100000 and 999999' };
      return { valid: true };
    };

    // Name validation
    const nameValidation = validateName(formData.name);
    if (!nameValidation.valid) {
      newErrors.name = nameValidation.message;
    }

    // Address validation
    const addressValidation = validateAddressLine(formData.addressLine1, 'Address Line 1');
    if (!addressValidation.valid) {
      newErrors.addressLine1 = addressValidation.message;
    }

    const areaValidation = validateArea(formData.area);
    if (!areaValidation.valid) {
      newErrors.area = areaValidation.message;
    }

    const cityValidation = validateCity(formData.city);
    if (!cityValidation.valid) {
      newErrors.city = cityValidation.message;
    }

    const pincodeValidation = validatePincode(formData.pincode);
    if (!pincodeValidation.valid) {
      newErrors.pincode = pincodeValidation.message;
    }

    if (isNewProfile && (!formData.latitude || !formData.longitude)) {
      newErrors.latitude = 'Please pin your location on the map';
    }

    // Contact Phone validation
    if (formData.contactPhone && formData.contactPhone.startsWith('0')) {
      newErrors.contactPhone = 'Contact phone cannot start with 0';
    } else if (!formData.contactPhone || formData.contactPhone.length !== 10) {
      newErrors.contactPhone = 'Valid 10-digit contact phone is required';
    }

    // Existing customer validation
    if (isNewProfile && !hasExistingDeposit) {
      newErrors.hasExistingDeposit = 'Please select if you are an existing customer';
    }

    // Payment methods are saved automatically via Razorpay - no validation needed

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;

    if (!isValid) {
      // Priority order for scrolling based on UI layout
      const fieldPriority = [
        { field: 'hasExistingDeposit', id: 'existing-customer-question' },
        { field: 'name', id: 'name' },
        { field: 'contactPhone', id: 'contactPhone' },
        { field: 'addressLine1', id: 'addressLine1' },
        { field: 'city', id: 'city' },
        { field: 'pincode', id: 'pincode' },
        { field: 'area', id: 'area' },
        { field: 'latitude', id: 'map-section' }
      ];

      const firstError = fieldPriority.find(p => newErrors[p.field]);
      if (firstError) {
        const element = document.getElementById(firstError.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    return isValid;
  };

  const handleFieldChange = (field, value) => {
    // For name field, only allow alphabets and spaces
    if (field === 'name') {
      // Remove any characters that are not letters or spaces
      value = value.replace(/[^a-zA-Z\s]/g, '');
    }

    if (field === 'contactPhone') {
      value = value.replace(/\D/g, '');
      if (value.startsWith('0')) {
        value = value.replace(/^0+/, '');
      }
      value = value.slice(0, 10);
    }

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const loadDepositProducts = async () => {
    if (isLoadingDepositProducts || depositProducts.length > 0) return;

    try {
      setIsLoadingDepositProducts(true);
      const res = await fetch('/shop/api/products?forDeposit=true', {
        headers: {},
      });
      const data = await res.json();

      if (data?.success && Array.isArray(data.products)) {
        setDepositProducts(data.products);
        if (data.products.length > 0 && !selectedDepositProductId) {
          setSelectedDepositProductId(data.products[0].id);
        }
      } else {
        toast.error(data?.message || 'Failed to load deposit products');
      }
    } catch (err) {
      console.error('Error loading deposit products:', err);
      toast.error('Failed to load deposit products');
    } finally {
      setIsLoadingDepositProducts(false);
    }
  };

  // Handle payment method changes (add, update, remove)
  const handlePaymentMethodChange = (change) => {
    // If setting as default, we need to unset other defaults of the same type
    if (change.action === 'update' && change.isDefault === true) {
      setPaymentMethodChanges((prev) => {
        // Remove any existing update actions for other payment methods of the same type
        const filtered = prev.filter(
          (c) => !(c.action === 'update' && c.type === change.type && c.id !== change.id)
        );

        // Add update actions to unset defaults for other payment methods of the same type
        const otherDefaults = paymentMethods[change.type]
          .filter((pm) => pm.id !== change.id && pm.isDefault)
          .map((pm) => ({
            action: 'update',
            id: pm.id,
            type: change.type,
            details: pm.details,
            isDefault: false,
          }));

        // Check if this change already exists
        const existingIndex = filtered.findIndex(
          (c) => c.id === change.id && c.action === 'update'
        );

        if (existingIndex >= 0) {
          // Update existing change
          const updated = [...filtered, ...otherDefaults];
          updated[existingIndex] = change;
          return updated;
        } else {
          // Add new change along with unset actions
          return [...filtered, change, ...otherDefaults];
        }
      });
    } else {
      setPaymentMethodChanges((prev) => {
        // Check if this change already exists (for updates/removes)
        const existingIndex = prev.findIndex(
          (c) => c.id === change.id && c.action === change.action
        );

        if (existingIndex >= 0) {
          // Update existing change
          const updated = [...prev];
          updated[existingIndex] = change;
          return updated;
        } else {
          // Add new change
          return [...prev, change];
        }
      });
    }

    // Update local payment methods state for immediate UI feedback
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
      // Update default status
      setPaymentMethods((prev) => ({
        ...prev,
        [change.type]: prev[change.type].map((pm) =>
          pm.id === change.id
            ? { ...pm, isDefault: change.isDefault }
            : { ...pm, isDefault: false } // Unset other defaults of same type
        ),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    // Check if pincode is in service areas
    // We prioritize coordinatePincode (from map) over manual pincode to prevent bypass
    if (isNewProfile) {
      const pcodeToVerify = formData.pincode;
      console.log('Validating service area:', { pcodeToVerify, availableAreas: serviceAreas.length });
      const isSupported = serviceAreas.some(sa => sa.pincode === pcodeToVerify);
      console.log('Service area supported:', isSupported);
      if (!isSupported) {
        setShowServiceAreaError(true);
        return;
      }
    }

    // Validate deposit fields if "Yes" is selected
    if (isNewProfile && hasExistingDeposit === 'yes') {
      if (!selectedDepositProductId) {
        setError('Please select a product for your existing deposit.');
        return;
      }
      if (!depositQuantity || Number.isNaN(Number(depositQuantity)) || Number(depositQuantity) <= 0) {
        setError('Please enter a valid quantity (at least 1) for your existing deposit.');
        return;
      }
      if (Number(depositQuantity) > 50) {
        setError('The maximum number of existing deposit cans allowed is 50.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        addressLine1: formData.addressLine1.trim(),
        addressLine2: formData.addressLine2.trim(),
        area: formData.area.trim(),
        city: formData.city.trim(),
        pincode: formData.pincode.trim(),
        landmark: formData.landmark.trim(),
        nickname: formData.nickname.trim(),
        contactName: formData.contactName.trim(),
        contactPhone: formData.contactPhone.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        paymentMethods: paymentMethodChanges.length > 0 ? paymentMethodChanges : undefined,
      };

      // Add deposit data if applicable
      if (isNewProfile && hasExistingDeposit === 'yes') {
        payload.hasExistingDeposit = true;
        payload.depositProducts = [
          {
            productId: selectedDepositProductId,
            quantity: Number(depositQuantity),
          },
        ];
      }

      const response = await fetch('/shop/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        // setSuccess('Profile saved successfully!'); // Optional: keep or remove inline
        toast.success('Profile saved successfully');

        setPaymentMethodChanges([]); // Clear changes after successful save

        // Update original data to current data so we can detect future changes
        setOriginalFormData({ ...formData });
        setOriginalPaymentMethods(JSON.parse(JSON.stringify(paymentMethods)));

        // For a brand-new customer, go to Items page after first save
        if (isNewProfile) {
          // Clear the new user flow flag
          localStorage.removeItem('isNewUserFlow');
          // Dispatch event to notify components
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/items');
        }
      } else {
        setError(data.message || 'Failed to save profile. Please try again.');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userPhone');
    localStorage.removeItem('isNewUserFlow');
    // Dispatch event to notify components
    window.dispatchEvent(new Event('newUserFlowChanged'));
    router.push('/app/login');
  };

  return (
    <div className="h-full">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="max-w-3xl mx-auto">
          <Card className="border-primary/10 shadow-md overflow-hidden">
            <CardContent className="p-0">
              {/* Only show Header if NOT editing AND NOT fetching (to avoid flash of empty state) */}
              {!isEditing && !isFetching && (
                <div className="relative bg-[#f8fafc] pt-8 pb-6 px-6 overflow-hidden border-b">
                  {/* Backdrop mesh/gradient for premium feel */}
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-70" />

                  <div className="relative flex flex-col items-center text-center space-y-4">
                    {/* Centered Hero Avatar */}
                    <div className="relative">
                      <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-background bg-muted/20 flex items-center justify-center overflow-hidden shadow-xl">
                        <User className="h-12 w-12 sm:h-14 sm:w-14 text-primary/20" />
                      </div>

                      {/* Camera Edit Overlay */}
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setSuccess('');
                          setOriginalFormData({ ...formData });
                          setOriginalPaymentMethods(JSON.parse(JSON.stringify(paymentMethods)));
                          setPaymentMethodChanges([]);
                          setIsEditing(true);
                        }}
                        className="absolute bottom-0 right-0 h-9 w-9 bg-primary border-4 border-background rounded-full flex items-center justify-center text-primary-foreground hover:scale-110 active:scale-95 transition-all shadow-lg"
                        title="Edit Profile"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Typography Centered */}
                    <div className="space-y-0.5">
                      <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                        {formData.name || 'Set Name'}
                      </h1>
                      {phoneNumber && (
                        <p className="text-muted-foreground text-sm font-medium">
                          {phoneNumber}
                        </p>
                      )}
                    </div>

                    {/* Customer ID Badge */}
                    {customerId && (
                      <div className="flex items-center gap-2 bg-muted/50 border border-border/50 rounded-full px-3 py-1 backdrop-blur-sm">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-[10px] font-bold text-muted-foreground tracking-wider">
                          {customerId.slice(-8).toUpperCase()}
                        </span>
                        <div className="h-3 w-px bg-border mx-1" />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(customerId.slice(-8).toUpperCase());
                            setCopyFeedback('Copied');
                            setTimeout(() => setCopyFeedback(''), 1500);
                          }}
                          className="text-muted-foreground/60 hover:text-primary transition-colors"
                          title="Copy Customer ID"
                        >
                          {copyFeedback ? (
                            <span className="text-[10px] uppercase font-bold text-green-600">{copyFeedback}</span>
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isEditing && (
                <div className="p-4 sm:p-6 border-b">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="rounded-full bg-primary/10 p-2.5">
                      <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Edit Profile</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Update your details
                      </CardDescription>
                    </div>
                  </div>
                </div>
              )}

              <div className={isEditing ? 'p-4 sm:p-6' : 'p-4 sm:p-6 pt-8'}>
                {isFetching ? (
                  isEditing ? (
                    // EDIT MODE SKELETON
                    <div className="space-y-6">
                      {/* Basic Info Skeleton */}
                      <div className="flex items-center gap-3 mb-6">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-6 w-32" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </div>

                      {/* Deposit Holdings Skeleton */}
                      <div className="space-y-4 p-4 rounded-xl border">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <Skeleton className="h-6 w-40" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 sm:pl-11">
                          <Skeleton className="h-16 w-full rounded-lg" />
                          <Skeleton className="h-16 w-full rounded-lg" />
                        </div>
                      </div>

                      {/* Form Fields Skeleton */}
                      <div className="grid gap-4 py-4">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // VIEW MODE SKELETON (Mimics the actual Profile View)
                    <div className="space-y-0">
                      {/* 1. Header Skeleton (Matches the blue gradient area) */}
                      <div className="relative bg-[#f8fafc] pt-8 pb-6 px-6 overflow-hidden border-b -mx-4 sm:-mx-6 -mt-8 sm:-mt-8 mb-6">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-70" />
                        <div className="relative flex flex-col items-center text-center space-y-4">
                          {/* Avatar + Edit Button Placeholder */}
                          <div className="relative">
                            <Skeleton className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-background" />
                          </div>
                          {/* Name & Phone Placeholders */}
                          <div className="space-y-2 flex flex-col items-center">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        </div>
                      </div>

                      {/* 2. Stats Grid Skeleton */}
                      <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-24 w-full rounded-2xl" />
                        <Skeleton className="h-24 w-full rounded-2xl" />
                      </div>

                      {/* 3. Menu Items Skeleton */}
                      <div className="space-y-3 mt-6">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                      </div>
                    </div>
                  )
                ) : !isEditing ? (

                  <div className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col items-center justify-center text-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-black text-primary">
                            ₹{Math.ceil(formData.depositWalletBalance || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Total Can amount paid
                          </p>
                        </div>
                      </div>
                      <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex flex-col items-center justify-center text-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                          <ShoppingBag className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-2xl font-black text-orange-600">
                            {formData.cansInHand || 0}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Empty 20L Cans in Hand
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Options */}
                    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                      <div
                        onClick={() => router.push('/app/profile/addresses')}
                        className="flex items-center justify-between p-4 border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors active:bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <MapPin className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-base">My Addresses</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                      </div>

                      <div
                        onClick={() => router.push('/app/profile/payments')}
                        className="flex items-center justify-between p-4 border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors active:bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-base">Payment Methods</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                      </div>

                      <div
                        onClick={() => router.push('/app/orders')}
                        className="flex items-center justify-between p-4 border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors active:bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <History className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-base">Order History</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                      </div>

                      {/* Refund Request - Always Visible for Consistency */}
                      <div
                        onClick={() => {
                          if ((formData.cansInHand || 0) <= 0) {
                            toast.error("You don't have any empty cans to return for a refund.");
                            return;
                          }

                          // Optional: Block multiple pending requests to prevent confusion
                          const hasPending = depositRefunds.some(r => r.status === 'PENDING');
                          if (hasPending) {
                            toast.error("You already have a pending refund request. Please wait for it to be processed.");
                            return;
                          }

                          setRefundAmount('1');
                          setShowRefundDialog(true);
                        }}
                        className="flex items-center justify-between p-4 border-b border-border/40 cursor-pointer hover:bg-orange-50/50 transition-colors active:bg-orange-100/50 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-base">Request Refund</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">Return empty cans</span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                      </div>

                      <div
                        onClick={() => setShowSupportDialog(true)}
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors active:bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center">
                            <AlertCircle className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-base">Support & Help</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                      </div>
                    </div>

                    {/* Active Refund Status Section */}
                    {depositRefunds.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Refund History</h3>
                        </div>
                        <div className="space-y-2">
                          {depositRefunds.slice(0, 3).map((refund, idx) => (
                            <div key={refund.id || idx} className="bg-muted/20 border border-border/40 rounded-xl p-3 flex items-center justify-between transition-all hover:bg-muted/30">
                              <div className="flex items-center gap-3">
                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${refund.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                                  refund.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                  <History className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold">{refund.quantity} Cans</span>
                                  <span className="text-[10px] text-muted-foreground font-medium">{new Date(refund.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${refund.status === 'PENDING' ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20' :
                                  refund.status === 'APPROVED' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                                    'bg-gray-500/10 text-gray-600 border border-gray-500/20'
                                  }`}>
                                  {refund.status}
                                </span>
                                {refund.status === 'APPROVED' && (
                                  <span className="text-[9px] font-bold text-green-600 italic">Processing Refund</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 pt-2">
                      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowLogoutDialog(true)}
                          className="w-full h-12 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl font-semibold transition-all active:scale-[0.98]"
                        >
                          <LogOut className="h-5 w-5 mr-2" />
                          Log Out
                        </Button>
                        <AlertDialogContent className="max-w-[85vw] sm:max-w-[320px] rounded-[24px] p-8 gap-0 border-none shadow-2xl bg-white">
                          <AlertDialogHeader className="space-y-2">
                            <AlertDialogTitle className="text-2xl font-bold text-center text-[#1e293b]">Logout</AlertDialogTitle>
                            <AlertDialogDescription className="text-[15px] font-medium text-center text-[#64748b] leading-snug tracking-tight">
                              Are you sure want to logout? You will need to log in again to access your orders and profile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="flex flex-col gap-3 mt-8">
                            <AlertDialogAction
                              onClick={handleLogout}
                              className="w-full rounded-[14px] h-[52px] text-base font-bold bg-gradient-to-r from-[#007ae5] to-[#009db5] text-white border-none shadow-[0_4px_12px_rgba(0,122,229,0.25)] hover:opacity-95 transition-all active:scale-[0.98]"
                            >
                              Yes, logout
                            </AlertDialogAction>
                            <AlertDialogCancel className="w-full rounded-[14px] h-[52px] text-base font-bold border-[1.5px] border-[#0092ff]/20 bg-white text-[#1e293b] hover:bg-slate-50/80 transition-all active:scale-[0.98] mt-0">
                              Cancel
                            </AlertDialogCancel>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                    {error && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
                        <AlertCircle className="h-4 w-4" />
                        <span>{error}</span>
                      </div>
                    )}

                    {success && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-600 text-sm border border-green-500/20">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{success}</span>
                      </div>
                    )}


                    {isNewProfile && (
                      <div id="existing-customer-question" className="space-y-2">
                        <Label>
                          Are you an old customer of Sabols? <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex items-center gap-6 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="hasExistingDeposit"
                              value="no"
                              checked={hasExistingDeposit === 'no'}
                              onChange={() => setHasExistingDeposit('no')}
                              className={`h-4 w-4 accent-primary ${errors.hasExistingDeposit ? 'ring-2 ring-destructive ring-offset-2 rounded-full' : ''}`}
                            />
                            <span className="text-sm">No</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="hasExistingDeposit"
                              value="yes"
                              checked={hasExistingDeposit === 'yes'}
                              onChange={() => setHasExistingDeposit('yes')}
                              className={`h-4 w-4 accent-primary ${errors.hasExistingDeposit ? 'ring-2 ring-destructive ring-offset-2 rounded-full' : ''}`}
                            />
                            <span className="text-sm">Yes</span>
                          </label>
                        </div>
                        {errors.hasExistingDeposit && (
                          <p className="text-sm text-destructive">{errors.hasExistingDeposit}</p>
                        )}

                        {hasExistingDeposit === 'yes' && (
                          <div className="mt-4 p-4 border rounded-md bg-muted/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-4">
                              {isLoadingDepositProducts ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                              ) : depositProducts.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  No deposit products available at the moment.
                                </p>
                              ) : (
                                <>
                                  {depositProducts.length > 1 && (
                                    <div className="space-y-2">
                                      <Label htmlFor="deposit-product">Product <span className="text-destructive">*</span></Label>
                                      <select
                                        id="deposit-product"
                                        value={selectedDepositProductId}
                                        onChange={(e) => setSelectedDepositProductId(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <option value="">Select a product</option>
                                        {depositProducts.map((product) => (
                                          <option key={product.id} value={product.id}>
                                            {product.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label htmlFor="deposit-quantity">
                                      {depositProducts.length === 1
                                        ? `How many ${depositProducts[0].name} (${depositProducts[0].unit || 'item'}${depositProducts[0].unit?.endsWith('s') ? '' : 's'}) have you got in your hand?`
                                        : `Quantity (${depositProducts.find(p => p.id === selectedDepositProductId)?.unit || 'item'}${depositProducts.find(p => p.id === selectedDepositProductId)?.unit?.endsWith('s') ? '' : 's'})`} <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                      id="deposit-quantity"
                                      type="number"
                                      min="1"
                                      max="50"
                                      value={depositQuantity}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        if (!isNaN(val) && val > 0) {
                                          if (val > 50) {
                                            toast.error("Maximum 50 cans allowed");
                                            setDepositQuantity(50);
                                          } else {
                                            setDepositQuantity(val);
                                          }
                                        } else if (e.target.value === '') {
                                          setDepositQuantity('');
                                        }
                                      }}
                                      placeholder="Enter quantity"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="name">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="Enter your full name"
                        value={formData.name}
                        onChange={(e) => handleFieldChange('name', e.target.value)}
                        className={errors.name ? 'border-destructive' : ''}
                      />
                      {errors.name && (
                        <p className="text-sm text-destructive">{errors.name}</p>
                      )}
                    </div>

                    {isNewProfile && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <Label className="text-base font-semibold">Address</Label>
                        </div>
                        <AddressForm
                          formData={formData}
                          onChange={handleFieldChange}
                          onServiceAreasFetched={setServiceAreas}
                          errors={errors}
                          showDefaultToggle={false}
                        />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      {!isNewProfile && (
                        <Button type="button" variant="outline" onClick={() => { setFormData({ ...originalFormData }); setPaymentMethods(JSON.parse(JSON.stringify(originalPaymentMethods))); setPaymentMethodChanges([]); setErrors({}); setError(''); setSuccess(''); setIsEditing(false); }} disabled={isLoading} className="w-full sm:flex-1 h-9 sm:h-9 flex items-center justify-center gap-2">Cancel</Button>
                      )}
                      <Button type="submit"
                        disabled={isLoading || !hasChanges()}
                        className="w-full sm:flex-1 h-9 sm:h-9 flex items-center justify-center gap-2">
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="hidden sm:inline">
                              Saving...
                            </span>
                            <span className="sm:hidden">Saving</span>
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            <span className="hidden sm:inline">Save Profile</span>
                            <span className="sm:hidden">Save</span>
                          </>)}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Refund</DialogTitle>
            <DialogDescription>
              Select the number of empty cans you want to return for a refund.
            </DialogDescription>
          </DialogHeader>

          {refundDialogError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {refundDialogError}
            </div>
          )}

          <div className="space-y-4">
            <Label className="text-sm font-medium">Quantity of Cans (Max: {originalFormData.cansInHand || 0})</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border-2 px-3 py-2 border-blue-300 bg-blue-50 w-fit">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const current = parseInt(refundAmount, 10) || 1;
                    if (current > 1) setRefundAmount(String(current - 1));
                  }}
                  disabled={isRefundSubmitting || (parseInt(refundAmount, 10) || 1) <= 1}
                  className="h-8 w-8 text-blue-500 hover:bg-blue-100"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value);
                    const max = originalFormData.cansInHand || 0;
                    if (val !== '' && !isNaN(val)) {
                      setRefundAmount(String(Math.max(1, Math.min(max, val))));
                    } else if (e.target.value === '') {
                      setRefundAmount('');
                    }
                  }}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const max = originalFormData.cansInHand || 0;
                    if (isNaN(val) || val < 1) {
                      setRefundAmount('1');
                    } else if (val > max) {
                      setRefundAmount(String(max));
                    }
                  }}
                  className="w-12 h-8 text-center bg-transparent border-none focus:outline-none focus:ring-0 font-bold p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-blue-700 text-lg"
                  disabled={isRefundSubmitting}
                  min="1"
                  max={originalFormData.cansInHand || 0}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const current = parseInt(refundAmount, 10) || 1;
                    const max = originalFormData.cansInHand || 0;
                    if (current < max) setRefundAmount(String(current + 1));
                  }}
                  disabled={isRefundSubmitting || (parseInt(refundAmount, 10) || 1) >= (originalFormData.cansInHand || 0)}
                  className="h-8 w-8 text-blue-700 hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {depositProducts.length > 0 && refundAmount && !isNaN(refundAmount) && (
                <p className="text-sm text-green-700 font-medium animate-in fade-in slide-in-from-top-1 px-1">
                  Refund Amount: <span className="font-bold ">₹{(Number(refundAmount) * (depositProducts[0].depositAmount || 150)).toFixed(2)}</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preferred Refund Method</Label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refundType"
                  checked={refundBankDetails.type === 'upi'}
                  onChange={() => setRefundBankDetails(prev => ({ ...prev, type: 'upi' }))}
                /> UPI
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refundType"
                  checked={refundBankDetails.type === 'account'}
                  onChange={() => setRefundBankDetails(prev => ({ ...prev, type: 'account' }))}
                /> Bank Account
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refundType"
                  checked={refundBankDetails.type === 'cod'}
                  onChange={() => setRefundBankDetails(prev => ({ ...prev, type: 'cod' }))}
                /> Cash
              </label>
            </div>

            {refundBankDetails.type === 'cod' ? (
              <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
                You will receive cash refund from the delivery partner at the time of collection.
              </div>
            ) : refundBankDetails.type === 'upi' ? (
              <div>
                <Label className="text-xs">UPI ID</Label>
                <Input
                  placeholder="e.g. user@okaxis"
                  value={refundBankDetails.upiId}
                  onChange={(e) => setRefundBankDetails(prev => ({ ...prev, upiId: e.target.value }))}
                />
              </div>
            ) : refundBankDetails.type === 'account' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Account Number</Label>
                  <Input
                    value={refundBankDetails.accountNumber}
                    onChange={(e) => setRefundBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    value={refundBankDetails.ifscCode}
                    onChange={(e) => setRefundBankDetails(prev => ({ ...prev, ifscCode: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Bank Name</Label>
                  <Input
                    value={refundBankDetails.bankName}
                    onChange={(e) => setRefundBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundDialog(false)}>Cancel</Button>
            <Button onClick={handleRefundSubmit} disabled={isRefundSubmitting}>
              {isRefundSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent className="rounded-[24px] sm:max-w-[400px] border-none shadow-2xl p-5 sm:p-6 bg-white">
          <DialogHeader className="pb-4 border-b text-left sm:text-left">
            <DialogTitle className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <AlertCircle className="h-5 w-5" />
              </span>
              Support & Help
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-[#64748b] leading-snug">
              Have questions or need help with your order? Get in touch with us.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
            {isLoadingSupport ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
              </div>
            ) : supportContacts.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm font-semibold text-slate-500">Support is currently unavailable</p>
                <p className="text-xs text-slate-400 mt-1">Please try again later.</p>
              </div>
            ) : (
              <>
                {/* Email Support Cards */}
                {supportContacts.filter(c => c.type === 'EMAIL').map((c) => (
                  <div key={c.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 group hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{c.label}</span>
                        <span className="text-sm font-semibold text-foreground break-all">
                          {c.value}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`mailto:${c.value}`}
                      className="w-full h-9 rounded-xl text-xs font-bold bg-white border border-[#0092ff]/20 text-[#007ae5] hover:bg-blue-50 flex items-center justify-center transition-all"
                    >
                      Send Email
                    </a>
                  </div>
                ))}

                {/* Phone Support Card */}
                {supportContacts.some(c => c.type === 'PHONE') && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-200/60">
                      <div className="h-10 w-10 rounded-full bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Call Support</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {supportContacts.filter(c => c.type === 'PHONE').map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                          <span className="text-xs font-medium text-slate-500 truncate">{item.label}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono text-sm font-bold text-slate-800">{item.value}</span>
                            <a
                              href={`tel:${item.value}`}
                              className="h-7 w-7 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center transition-colors"
                              title={`Call ${item.value}`}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSupportDialog(false)}
              className="w-full rounded-xl h-10 text-sm font-bold border-[#0092ff]/20 hover:bg-slate-50"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div >
  );
}
export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
