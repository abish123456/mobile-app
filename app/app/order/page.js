'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import AddressForm from '../../../components/app/AddressForm';
import LocationValidationDialog from '../../../components/app/LocationValidationDialog';
import QuantitySelector from '../../../components/app/QuantitySelector';
import DeliverySlotSelector from '../../../components/app/DeliverySlotSelector';
import OrderSummary, { calculateTotal } from '../../../components/app/OrderSummary';
import PaymentMethodDropdown from '../../../components/app/PaymentMethodDropdown';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Loader2, ShoppingCart, Wallet, Smartphone, CreditCard, Package, ArrowLeft, MapPin, Pencil, Check, X, Banknote, Landmark, Plus, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PaymentPolicy from '../../../components/app/PaymentPolicy';

export default function OrderPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState('');
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false); // Flag to prevent redirects during payment
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false); // Flag to show success overlay and prevent page rendering
  const [addressForm, setAddressForm] = useState({
    addressLine1: '',
    addressLine2: '',
    area: '',
    city: '',
    pincode: '',
    coordinatePincode: '',
    landmark: '',
  });
  const [originalAddress, setOriginalAddress] = useState({
    addressLine1: '',
    addressLine2: '',
    area: '',
    city: '',
    pincode: '',
    coordinatePincode: '',
    landmark: '',
  });
  const [addressErrors, setAddressErrors] = useState({});
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [customAddress, setCustomAddress] = useState(null);
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [dateError, setDateError] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [serviceAreas, setServiceAreas] = useState([]);
  const [showServiceAreaError, setShowServiceAreaError] = useState(false);

  const [cart, setCart] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cart');
        return saved ? JSON.parse(saved) : [];
      } catch (e) { return []; }
    }
    return [];
  });

  // Initialize slot with default date based on cutoff
  // Initialize slot state - start with default (11 AM logic) but update after fetching config
  const [slot, setSlot] = useState(() => {
    // Default fallback: 11:00 AM
    // We calculate this synchronously to avoid empty state, but it will be re-verified by useEffect
    const DEFAULT_CUTOFF = 11;
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = istFormatter.formatToParts(now);
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

    const targetDate = new Date();
    // Simple check against default 11 AM
    if (currentHour >= DEFAULT_CUTOFF) {
      targetDate.setDate(targetDate.getDate() + 2);
    } else {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    return format(targetDate, 'yyyy-MM-dd');
  });

  // Fetch actual cutoff config and update slot if needed
  useEffect(() => {
    const updateSlotWithConfig = async () => {
      try {
        const res = await fetch('/shop/api/config', { cache: 'no-store' });
        const data = await res.json();

        let cutoffHour = 11;
        let cutoffMinute = 0;
        let holidaySet = new Set();
        let weeklyOffSet = new Set();

        if (data.success && data.config) {
          if (data.config.SAME_DAY_CUTOFF_HOUR) cutoffHour = parseInt(data.config.SAME_DAY_CUTOFF_HOUR);
          if (data.config.SAME_DAY_CUTOFF_MINUTE) cutoffMinute = parseInt(data.config.SAME_DAY_CUTOFF_MINUTE);
          if (Array.isArray(data.config.holidays)) {
            holidaySet = new Set(data.config.holidays.map((h) => h.date));
          }
          if (Array.isArray(data.config.HOLIDAY_WEEKDAYS)) {
            weeklyOffSet = new Set(data.config.HOLIDAY_WEEKDAYS);
          }
        }

        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        });

        const parts = istFormatter.formatToParts(now);
        const currentHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
        const currentMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
        const isPastCutoff = currentHour > cutoffHour || (currentHour === cutoffHour && currentMinute >= cutoffMinute);

        // Start from tomorrow (or day-after-tomorrow if past cutoff)
        let targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (isPastCutoff ? 2 : 1));
        targetDate.setHours(0, 0, 0, 0);

        // Helper: YYYY-MM-DD in IST
        const toISTStr = (d) =>
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(d);

        // Helper: IST weekday index (0=Sun … 6=Sat)
        const getISTWeekday = (d) => {
          const name = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata', weekday: 'short',
          }).format(d);
          return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
        };

        // Roll forward until we land on a working day
        for (let i = 0; i < 60; i++) {
          const dateStr = toISTStr(targetDate);
          const weekday = getISTWeekday(targetDate);
          if (!holidaySet.has(dateStr) && !weeklyOffSet.has(weekday)) break;
          targetDate.setDate(targetDate.getDate() + 1);
        }

        const newDateStr = format(targetDate, 'yyyy-MM-dd');
        setSlot(newDateStr);

      } catch (err) {
        console.error('Error fetching cutoff config:', err);
      }
    };

    updateSlotWithConfig();
  }, []);


  const [paymentCategory, setPaymentCategory] = useState('ONLINE'); // 'ONLINE' or 'COD'
  const [onlinePaymentMethodType, setOnlinePaymentMethodType] = useState('upi'); // 'upi', 'card' or 'netbanking'
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null); // { id, type, details }
  const [paymentMethods, setPaymentMethods] = useState({ upi: [], card: [] });


  // Load cart from server
  useEffect(() => {
    // Check for payment cancellation
    const urlParams = new URLSearchParams(window.location.search);
    const paymentCancelled = urlParams.get('payment');
    if (paymentCancelled === 'cancelled') {
      toast.error('Payment was cancelled. Please try again.');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    const loadCart = async () => {
      try {
        const res = await fetch('/shop/api/cart', {
          headers: {},
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            const items = data.items || [];
            setCart(items);
            localStorage.setItem('cart', JSON.stringify(items));

            // Don't redirect if payment is processing, payment is successful, or if we're redirecting after payment
            if (items.length === 0 && !isPaymentProcessing && !isLoading && !isPaymentSuccess) {
              router.push('/app/items');
            }
          } else {
            // Don't redirect if payment is processing or payment is successful
            if (!isPaymentProcessing && !isLoading && !isPaymentSuccess) {
              router.push('/app/items');
            }
          }
        } else if (res.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        } else {
          // Don't redirect if payment is processing or payment is successful
          if (!isPaymentProcessing && !isLoading && !isPaymentSuccess) {
            router.push('/app/items');
          }
        }
      } catch (err) {
        console.error('Error loading cart from server:', err);
        // Don't redirect if payment is processing or payment is successful
        if (!isPaymentProcessing && !isLoading && !isPaymentSuccess) {
          router.push('/app/items');
        }
      }
    };

    loadCart();
  }, [router, toast, isPaymentProcessing, isLoading, isPaymentSuccess]);

  // Check auth and load payment methods from profile
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch service areas first to ensure validation works for existing addresses
        try {
          const saRes = await fetch('/shop/api/service-areas');
          const saData = await saRes.json();
          if (saData.success) {
            setServiceAreas(saData.serviceAreas || []);
          }
        } catch (saErr) {
          console.error('Error fetching service areas in OrderPage:', saErr);
        }

        // Load profile to get saved payment methods
        const response = await fetch('/shop/api/user/profile', {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const pm = data.profile?.paymentMethods || { upi: [], card: [] };
          const loadedAddress = {
            addressLine1: data.profile?.addressLine1 || '',
            addressLine2: data.profile?.addressLine2 || '',
            area: data.profile?.area || '',
            city: data.profile?.city || '',
            pincode: data.profile?.pincode || '',
            coordinatePincode: data.profile?.pincode || '',
            landmark: data.profile?.landmark || '',
            latitude: data.profile?.latitude || null,
            longitude: data.profile?.longitude || null,
            nickname: data.profile?.nickname || '',
            contactName: data.profile?.contactName || '',
            contactPhone: data.profile?.contactPhone || '',
          };
          const currentAddresses = data.profile?.addresses || [];
          setAddresses(currentAddresses);
          setAddressForm(loadedAddress);
          setOriginalAddress(loadedAddress);
          setPaymentMethods(pm);
          setCustomer(data.profile || data.customer);

          // Set default address
          const defaultAddr = currentAddresses.find(a => a.isDefault) || currentAddresses[0];
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
          }

          // Set default payment method if available
          const defaultPm = data.profile?.defaultPaymentMethod;
          if (defaultPm?.type && defaultPm.details) {
            setOnlinePaymentMethodType(defaultPm.type);
            // Find the matching payment method from the list
            const methodList = pm[defaultPm.type] || [];
            const defaultMethod = methodList.find(m => m.details === defaultPm.details && m.isDefault) || methodList[0];
            if (defaultMethod) {
              setSelectedPaymentMethod({
                id: defaultMethod.id,
                type: defaultPm.type,
                details: defaultMethod.details,
                razorpayTokenId: defaultMethod.razorpayTokenId,
                cardLast4: defaultMethod.cardLast4,
                cardBrand: defaultMethod.cardBrand,
              });
            }
          } else {
            // If no default, prefer saved cards with tokens for quick payment
            const savedCard = pm.card.find(c => c.razorpayTokenId);
            if (savedCard) {
              setOnlinePaymentMethodType('card');
              setSelectedPaymentMethod({
                id: savedCard.id,
                type: 'card',
                details: savedCard.details,
                razorpayTokenId: savedCard.razorpayTokenId,
                cardLast4: savedCard.cardLast4,
                cardBrand: savedCard.cardBrand,
              });
            } else if (pm.upi.length > 0) {
              setOnlinePaymentMethodType('upi');
              setSelectedPaymentMethod({
                id: pm.upi[0].id,
                type: 'upi',
                details: pm.upi[0].details,
              });
            } else if (pm.card.length > 0) {
              setOnlinePaymentMethodType('card');
              setSelectedPaymentMethod({
                id: pm.card[0].id,
                type: 'card',
                details: pm.card[0].details,
                razorpayTokenId: pm.card[0].razorpayTokenId,
                cardLast4: pm.card[0].cardLast4,
                cardBrand: pm.card[0].cardBrand,
              });
            }
          }
        } else if (response.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPhone');
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/login');
          return;
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsInitializing(false);
      }
    };

    init();
  }, [router]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // When onlinePaymentMethodType changes, select first method of that type or 'new'
  useEffect(() => {
    const methods = paymentMethods[onlinePaymentMethodType] || [];
    if (methods.length > 0) {
      const firstMethod = methods.find(m => m.isDefault) || methods[0];
      setSelectedPaymentMethod({
        id: firstMethod.id,
        type: onlinePaymentMethodType,
        details: firstMethod.details,
        razorpayTokenId: firstMethod.razorpayTokenId,
        cardLast4: firstMethod.cardLast4,
        cardBrand: firstMethod.cardBrand,
      });
    } else {
      // No saved methods, select "new" automatically
      setSelectedPaymentMethod({
        id: 'new',
        type: onlinePaymentMethodType,
        details: '',
        isNew: true,
      });
    }
  }, [onlinePaymentMethodType, paymentMethods]);


  const getTotalQuantity = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const calculateSubtotal = () => {
    // Calculate subtotal from cart items with product prices
    return calculateTotal(cart);
  };

  const calculateGST = () => {
    // Calculate total GST based on each product's specific percentage
    return cart.reduce((sum, item) => {
      const itemSubtotal = item.price * item.quantity;
      const itemGstRate = item.gst ?? 5.0;
      return sum + (itemSubtotal * (itemGstRate / 100));
    }, 0);
  };

  const calculateDeposit = () => {
    if (!cart || cart.length === 0) {
      return { toPay: 0, walletUsed: 0, walletCredit: 0, totalRequired: 0 };
    }

    // Filter only items that have deposit amount (depositAmount > 0)
    const depositItems = cart.filter((item) => item.isAvailable !== false && (item.depositAmount || 0) > 0);

    // If no items have deposit, return zero
    if (depositItems.length === 0) {
      return { toPay: 0, walletUsed: 0, walletCredit: 0, totalRequired: 0 };
    }

    // Target Balance Deposit Model
    const currentCansInHand = customer?.cansInHand || 0;
    const pendingOrdered = customer?.pendingOrdered || 0;
    const pendingReturned = customer?.pendingReturned || 0;
    const walletBalance = customer?.depositWalletBalance || 0;
    const pendingDeposit = customer?.pendingDeposit || 0;

    const totalOrderedInCart = depositItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalReturnedInCart = depositItems.reduce((sum, item) => sum + (item.returnQuantity || 0), 0);
    const totalExplicitPendingReturns = customer?.pendingReturns || 0;

    // Predicted future state:
    const futureCansInHand = currentCansInHand + (pendingOrdered - pendingReturned) + (totalOrderedInCart - (totalReturnedInCart + totalExplicitPendingReturns));

    // Get deposit rate (assuming uniform)
    const depositRate = depositItems[0]?.depositAmount || 0;

    // Required wallet balance for that many cans
    const requiredDepositBalance = Math.max(0, futureCansInHand * depositRate);

    // Deficit in wallet is what needs to be paid
    // Account for both existing wallet balance AND deposits already committed in other active orders
    const toPay = Math.max(0, requiredDepositBalance - walletBalance - pendingDeposit);

    if (toPay > 0) {
      return {
        toPay,
        walletUsed: 0,
        walletCredit: 0,
        totalRequired: toPay,
      };
    }

    if (requiredDepositBalance < walletBalance) {
      const surplus = walletBalance - requiredDepositBalance;
      return {
        toPay: 0,
        walletUsed: 0,
        walletCredit: surplus,
        totalRequired: -surplus,
      };
    }

    // Perfect balance
    return { toPay: 0, walletUsed: 0, walletCredit: 0, totalRequired: 0 };
  };

  const calculateTotalAmount = () => {
    // Calculate total including GST and Deposits (matching backend logic)
    const subtotal = calculateSubtotal();
    const gst = calculateGST();
    const depositInfo = calculateDeposit();
    return subtotal + gst + (depositInfo?.toPay || 0);
  };

  const handleAddressChange = (field, value) => {
    setAddressForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateAddress = () => {
    const newErrors = {};
    const required = [
      { key: 'addressLine1', label: 'Address Line 1', min: 5, max: 200 },
      { key: 'area', label: 'Area/Zone', min: 2, max: 100 },
      { key: 'city', label: 'City', min: 2, max: 100 },
    ];

    required.forEach(({ key, label, min, max }) => {
      const value = addressForm[key]?.trim() || '';
      if (!value) {
        newErrors[key] = `${label} is required`;
      } else if (value.length < min) {
        newErrors[key] = `${label} must be at least ${min} characters`;
      } else if (value.length > max) {
        newErrors[key] = `${label} must not exceed ${max} characters`;
      }
    });

    const pincode = addressForm.pincode?.trim() || '';
    if (!pincode) {
      newErrors.pincode = 'Pincode is required';
    } else if (!/^\d{6}$/.test(pincode)) {
      newErrors.pincode = 'Pincode must be 6 digits';
    }

    if (!addressForm.latitude || !addressForm.longitude) {
      newErrors.latitude = 'Please pin your location on the map';
    }

    const contactPhone = addressForm.contactPhone?.trim() || '';
    if (!contactPhone) {
      newErrors.contactPhone = 'Contact Phone is required';
    } else if (contactPhone.length !== 10) {
      newErrors.contactPhone = 'Phone number must be 10 digits';
    }

    setAddressErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddressSaveLocal = () => {
    const valid = validateAddress();
    if (!valid) {
      return;
    }

    // Check if pincode is in service areas
    const pcodeToVerify = addressForm.pincode;
    const isSupported = serviceAreas.some(sa => sa.pincode === pcodeToVerify);
    if (!isSupported) {
      setShowServiceAreaError(true);
      return;
    }

    // If it's a new address (no ID), store it in customAddress
    if (!selectedAddressId) {
      setCustomAddress({ ...addressForm });
    } else {
      // If editing an existing one, update the addresses list locally too for immediate UI feedback
      setAddresses(prev => prev.map(a => a.id === selectedAddressId ? {
        ...a,
        line1: addressForm.addressLine1,
        line2: addressForm.addressLine2,
        area: addressForm.area,
        city: addressForm.city,
        pincode: addressForm.pincode,
        landmark: addressForm.landmark,
        nickname: addressForm.nickname,
        contactName: addressForm.contactName,
        contactPhone: addressForm.contactPhone,
        latitude: addressForm.latitude,
        longitude: addressForm.longitude
      } : a));
    }

    setOriginalAddress(addressForm);
    setIsEditingAddress(false);
  };

  const handleCancelAddressEdit = () => {
    setAddressForm(originalAddress);
    setAddressErrors({});
    setIsEditingAddress(false);
  };

  const handlePlaceOrder = async () => {
    setError('');
    setDateError('');

    if (isEditingAddress) {
      setError('Please save or cancel your address changes before placing the order.');
      return;
    }

    if (!validateAddress()) {
      setError('Please update your delivery address before placing the order.');
      return;
    }

    // Double check service area before placing order
    const pcodeToVerify = addressForm.pincode;
    const isSupported = serviceAreas.some(sa => sa.pincode === pcodeToVerify);
    if (!isSupported) {
      setShowServiceAreaError(true);
      return;
    }

    const totalQuantity = getTotalQuantity();
    if (!totalQuantity || totalQuantity <= 0) {
      const errorMsg = 'Your cart is empty. Please add items to cart.';
      setError(errorMsg);
      toast.error(errorMsg);
      router.push('/app/items');
      return;
    }

    if (!slot) {
      const errorMsg = 'Please select a delivery date';
      setDateError(errorMsg);
      return;
    }

    if (paymentCategory === 'ONLINE' && !selectedPaymentMethod) {
      const errorMsg = 'Please select a payment method';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsLoading(true);
    setIsPaymentProcessing(true); // Set flag to prevent cart empty redirects

    try {
      // Token check removed, session cookie used
      // const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      // if (!token) { ... }

      // Validate delivery date
      // Format: "YYYY-MM-DD"
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(slot)) {
        const errorMsg = 'Invalid delivery date format';
        setDateError(errorMsg);
        setIsLoading(false);
        return;
      }

      const selectedDate = new Date(slot + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Validate date is not in the past
      if (selectedDate < today) {
        const errorMsg = 'Delivery date cannot be in the past';
        setDateError(errorMsg);
        setIsLoading(false);
        return;
      }

      // Send the exact date string directly
      const deliverySlot = slot;

      // Step 1: Create order
      const response = await fetch('/shop/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: totalQuantity, // Total quantity from cart
          deliverySlot,
          paymentType: paymentCategory, // Send payment type (COD or ONLINE)
          // api/orders requires paymentMethodId for online payments
          // We send 'ONLINE' for new methods to pass validation
          paymentMethodId: paymentCategory === 'ONLINE' ? (selectedPaymentMethod?.id === 'new' ? 'ONLINE' : selectedPaymentMethod?.id) : undefined,
          addressId: selectedAddressId,
          nickname: addressForm.nickname || null,
          contactName: addressForm.contactName || null,
          contactPhone: addressForm.contactPhone || null,
          addressLine1: addressForm.addressLine1,
          addressLine2: addressForm.addressLine2,
          area: addressForm.area,
          city: addressForm.city,
          pincode: addressForm.pincode,
          landmark: addressForm.landmark,
          latitude: addressForm.latitude,
          longitude: addressForm.longitude,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.errorType === 'INSUFFICIENT_CANS' || data.errorType === 'STALE_CART') {
          const msg = data.errorType === 'STALE_CART'
            ? 'Your cart is outdated. We will reset your cart so it recalculates correctly. Please add your items again.'
            : 'Your available empty cans balance has changed. To ensure accurate deposit calculation, we need to reset your cart. Please add your items again.';
          setErrorMessage(msg);
          setShowErrorDialog(true);
          setIsLoading(false);
          setIsPaymentProcessing(false);
          return;
        }

        const errorMsg = data.message || 'Failed to place order. Please try again.';
        toast.error(errorMsg);
        setIsLoading(false);
        return;
      }

      // Handle COD Order success - redirect directly
      if (paymentCategory === 'COD') {
        const orderId = data.order.id;

        // Skip success overlay for COD as per user request
        // setIsPaymentSuccess(true);
        // setIsLoading(false); // Keep loading state until redirect

        // Clear cart in background
        (async () => {
          try {
            for (const item of cart) {
              await fetch('/shop/api/cart', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  productId: item.id,
                  quantity: 0,
                }),
              });
            }
            localStorage.removeItem('cart');
            window.dispatchEvent(new Event('cartUpdated'));
          } catch (err) {
            console.error('Error clearing cart:', err);
          }
        })();

        // Redirect immediately without delay
        router.replace('/app/orders?payment=success&orderId=' + orderId);
        return;
      }

      // Step 2: Create Razorpay order and process payment
      const totalAmount = data.order.amount; // Use server-calculated amount
      const amountInPaise = Math.round(totalAmount * 100); // Convert to paise (INR)

      try {
        // Get selected payment method ID (only for cards to enable quick pay)
        // If 'new' method is selected, send null so Razorpay doesn't use saved token
        const paymentMethodId = onlinePaymentMethodType === 'card' && selectedPaymentMethod?.id !== 'new' ? selectedPaymentMethod?.id : null;

        const paymentResponse = await fetch('/shop/api/payments/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: data.order.id,
            amount: amountInPaise,
            paymentMethodId: paymentMethodId, // Only send payment method ID for cards (quick pay), not for UPI
          }),
        });

        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok || !paymentData.success) {
          throw new Error(paymentData.message || 'Failed to initialize payment');
        }

        // Step 3: Process payment with Razorpay
        // Wait for Razorpay to load if not already loaded
        if (typeof window === 'undefined' || !window.Razorpay) {
          // Wait a bit for Razorpay script to load
          await new Promise((resolve) => {
            const checkRazorpay = setInterval(() => {
              if (window.Razorpay) {
                clearInterval(checkRazorpay);
                resolve();
              }
            }, 100);
            // Timeout after 5 seconds
            setTimeout(() => {
              clearInterval(checkRazorpay);
              resolve();
            }, 5000);
          });
        }

        if (typeof window === 'undefined' || !window.Razorpay) {
          throw new Error('Razorpay is not loaded. Please refresh the page.');
        }

        if (!paymentData.key) {
          throw new Error('Razorpay key is not configured. Please check your environment variables.');
        }


        // Create Razorpay options
        // Restrict payment methods based on user's selection
        const selectedMethod = onlinePaymentMethodType; // 'upi', 'card' or 'netbanking'

        // Build prefill object
        const razorpayPrefill = { ...(paymentData.prefill || {}) };

        const razorpayOptions = {
          key: paymentData.key,
          amount: paymentData.amount,
          currency: paymentData.currency || 'INR',
          name: paymentData.name || 'SABOLS Delivery',
          description: paymentData.description || `Order #${data.order.id}`,
          order_id: paymentData.orderId,
          prefill: razorpayPrefill,
          customer_id: paymentData.customer_id, // Razorpay customer ID - enables saved cards autofill
          theme: {
            color: '#3b82f6', // Blue color matching our theme
          },
          // Configure payment methods - restrict to user's selection
          method: {
            // Only enable the payment method the user selected
            upi: selectedMethod === 'upi',
            card: selectedMethod === 'card',
            netbanking: selectedMethod === 'netbanking', // Enable netbanking
            wallet: false, // Disable wallet
            emi: false, // Disable EMI
            paylater: false, // Disable PayLater
          },
          // Retry configuration for failed API calls
          retry: {
            enabled: true,
            max_count: 3,
          },
          // Add error handler
          handler: async (response) => {

            // Show success overlay IMMEDIATELY before any async operations
            // This prevents the checkout page from showing when Razorpay modal closes
            setIsPaymentSuccess(true);
            setIsLoading(false);

            try {
              // Verify payment signature on server
              const verifyResponse = await fetch('/shop/api/payments/verify-payment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  orderId: data.order.id,
                  paymentMethodId: selectedPaymentMethod?.id === 'new' ? null : selectedPaymentMethod?.id, // Pass payment method ID to save token/UPI
                }),
              });



              const verifyData = await verifyResponse.json();
              if (!verifyResponse.ok || !verifyData.success) {
                // Hide success overlay on verification failure
                setIsPaymentSuccess(false);
                throw new Error(verifyData.message || 'Payment verification failed');
              }

              // Payment verified successfully - redirect immediately
              // Success overlay already shown above, so checkout page is hidden

              // Clear cart in background (don't wait for it)
              (async () => {
                try {
                  for (const item of cart) {
                    await fetch('/shop/api/cart', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        productId: item.id,
                        quantity: 0,
                      }),
                    });
                  }
                  localStorage.removeItem('cart');
                  window.dispatchEvent(new Event('cartUpdated'));
                } catch (err) {
                  console.error('Error clearing cart:', err);
                  // Don't fail the flow if cart clearing fails
                }
              })();

              // Redirect immediately (use replace to avoid back button issues)
              router.replace('/app/orders?payment=success&orderId=' + data.order.id);
            } catch (verifyErr) {
              console.error('Payment verification error:', verifyErr);
              // Hide success overlay and show error
              setIsPaymentSuccess(false);
              toast.error('Payment verification failed. Please contact support.');
              setIsLoading(false);
              setIsPaymentProcessing(false);
            }
          },
          modal: {
            ondismiss: () => {
              // User closed the payment modal
              // toast.info('Payment cancelled');
              setIsLoading(false);
              setIsPaymentProcessing(false);
            },
          },
        };

        const razorpay = new window.Razorpay(razorpayOptions);

        // Add error handlers
        razorpay.on('payment.failed', function (response) {
          console.warn('Razorpay payment failed:', response.error?.description || response.error?.reason || 'Unknown error');

          let errorMsg = 'Payment failed. ';

          // Check for specific error codes
          if (response.error) {
            const errorCode = response.error.code;
            const errorDescription = response.error.description || response.error.reason;

            if (errorCode === 'BAD_REQUEST_ERROR') {
              errorMsg += 'Invalid payment request. Please check your payment details.';
            } else if (errorCode === 'GATEWAY_ERROR' || errorCode === 'SERVER_ERROR') {
              errorMsg += 'Payment gateway is temporarily unavailable. Please try again in a few moments.';
            } else if (errorDescription) {
              // Check for specific gateway error messages
              if (errorDescription.includes('bank or wallet gateway')) {
                errorMsg += 'Payment failed at bank/wallet gateway. This might be a test account limitation. Please try UPI payment.';
              } else {
                errorMsg += errorDescription;
              }
            } else {
              errorMsg += 'Please try again.';
            }
          } else {
            errorMsg += 'Please try again.';
          }

          toast.error(errorMsg);
          // Keep loading true as modal is still open for retry
        });

        // Handle Razorpay initialization errors (500/502 from Razorpay API)
        razorpay.on('error', function (error) {
          console.warn('Razorpay error:', error.error?.description || error.error?.reason || error.message || 'Unknown error');

          let errorMsg = 'Payment gateway error. ';

          // Check for specific error types
          if (error.error) {
            const errorCode = error.error.code;
            const errorDescription = error.error.description || error.error.reason;

            if (errorCode === 'BAD_REQUEST_ERROR') {
              errorMsg += 'Invalid payment request. Please check your payment details.';
            } else if (errorCode === 'GATEWAY_ERROR' || errorCode === 'SERVER_ERROR') {
              errorMsg += 'Razorpay is experiencing issues. This may be a temporary problem with your Razorpay account. Please try again in a few moments.';
            } else if (errorDescription) {
              errorMsg += errorDescription;
            } else {
              errorMsg += 'Please try again.';
            }
          } else if (error.message) {
            // Handle network/API errors (500/502)
            if (error.message.includes('500') || error.message.includes('502')) {
              errorMsg += 'Razorpay server error (500/502). This is likely a Razorpay account configuration issue. Since UPI works, check if card payments are enabled in your Razorpay dashboard. Please contact Razorpay support.';
            } else {
              errorMsg += error.message;
            }
          } else {
            errorMsg += 'Please try again.';
          }

          toast.error(errorMsg, {
            duration: 6000, // Show for 6 seconds
          });
          setIsLoading(false);
          setIsPaymentProcessing(false);
        });

        // Add external error handler for network/API errors
        try {
          razorpay.open();
        } catch (openError) {
          console.error('Error opening Razorpay:', openError);
          toast.error('Failed to open payment gateway. Please try again.');
          setIsLoading(false);
          setIsPaymentProcessing(false);
        }

        // Note: isLoading will be set to false in the handler or on modal dismiss

        // Note: isLoading will be set to false in the handler or on modal dismiss
      } catch (paymentErr) {
        console.error('Payment error:', paymentErr);
        const errorMsg = paymentErr.message || 'Failed to process payment. Please try again.';
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
        setIsPaymentProcessing(false);
      }
    } catch (err) {
      console.error('Error placing order:', err);
      const errorMsg = 'Network error. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
      setIsPaymentProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Show full-screen success overlay during payment success redirect
  // This MUST be checked first to prevent any page content from showing
  if (isPaymentSuccess) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background backdrop-blur-md">
        <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg shadow-lg border">
          <div className="h-20 w-20 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl font-bold text-foreground">Payment Successful!</p>
          <p className="text-sm text-muted-foreground">Redirecting to orders...</p>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isInitializing || cart.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-6">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>

          <div className="flex flex-row gap-3">
            <Skeleton className="flex-1 h-12" />
            <Skeleton className="flex-1 h-12" />
          </div>
        </div>
      </div>
    );
  }

  const totalQuantity = getTotalQuantity();
  const subtotal = calculateSubtotal();
  const gst = calculateGST();
  const totalAmount = calculateTotalAmount();

  const handleErrorDialogConfirm = async () => {
    try {
      setIsLoading(true);
      // Clear cart on server using DELETE endpoint (Atomic clearing)
      await fetch('/shop/api/cart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      // Clear local storage
      localStorage.removeItem('cart');
      setCart([]);
      window.dispatchEvent(new Event('cartUpdated'));

      // Redirect to items page
      router.push('/app/items');
    } catch (err) {
      console.error("Error clearing cart:", err);
      // Even if server sync fails, force clear local and redirect
      localStorage.removeItem('cart');
      setCart([]);
      window.dispatchEvent(new Event('cartUpdated'));
      router.push('/app/items');
    } finally {
      setShowErrorDialog(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Action Required</AlertDialogTitle>
            <AlertDialogDescription>
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleErrorDialogConfirm}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Checkout</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Complete your order details
          </p>
        </div>

        <OrderSummary
          cart={cart}
          slot={slot}
          onSlotChange={(newSlot) => { setSlot(newSlot); setDateError(''); }}
          slotError={dateError}
          paymentType={paymentCategory}
          subtotal={subtotal}
          gst={gst}
          depositInfo={calculateDeposit()}
        />

        <Card>
          <CardHeader>
            <CardTitle>Delivery & Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && !dateError && (
              <div className="text-sm text-destructive font-medium px-1">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Delivery Address</p>
                  </div>
                </div>
              </div>

              {!isEditingAddress ? (
                <div className="space-y-3">
                  {addresses.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {/* Saved Addresses */}
                      {addresses.map((addr) => (
                        <div
                          key={addr.id}
                          className={`
                            relative border rounded-lg p-3 cursor-pointer transition-all
                            ${selectedAddressId === addr.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}
                          `}
                          onClick={() => {
                            setSelectedAddressId(addr.id);
                            setAddressForm({
                              addressLine1: addr.line1,
                              addressLine2: addr.line2,
                              area: addr.area,
                              city: addr.city,
                              pincode: addr.pincode,
                              coordinatePincode: addr.pincode,
                              landmark: addr.landmark,
                              nickname: addr.nickname,
                              contactName: addr.contactName,
                              contactPhone: addr.contactPhone,
                              latitude: addr.latitude,
                              longitude: addr.longitude
                            });
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 h-4 w-4 rounded-full border flex items-center justify-center ${selectedAddressId === addr.id ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                              {selectedAddressId === addr.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">
                                  {addr.nickname || (addr.isDefault ? 'Primary' : 'Saved Address')}
                                </span>
                                {addr.isDefault && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Default</span>}
                              </div>
                              <p className="text-xs text-foreground/80 mt-1 line-clamp-2 sm:line-clamp-1">
                                {addr.line1}, {addr.city} - {addr.pincode}, {addr.area}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 absolute top-2 right-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditingAddress(true);
                                setAddressForm({
                                  addressLine1: addr.line1,
                                  addressLine2: addr.line2,
                                  area: addr.area,
                                  city: addr.city,
                                  pincode: addr.pincode,
                                  coordinatePincode: addr.pincode,
                                  landmark: addr.landmark,
                                  nickname: addr.nickname,
                                  contactName: addr.contactName,
                                  contactPhone: addr.contactPhone,
                                  latitude: addr.latitude,
                                  longitude: addr.longitude
                                });
                                setSelectedAddressId(addr.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {/* Display New Address if it was entered */}
                      {customAddress && (
                        <div
                          className={`
                            relative border rounded-lg p-3 cursor-pointer transition-all
                            ${!selectedAddressId ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}
                          `}
                          onClick={() => {
                            setSelectedAddressId(null);
                            setAddressForm(customAddress);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 h-4 w-4 rounded-full border flex items-center justify-center ${!selectedAddressId ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                              {!selectedAddressId && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${!selectedAddressId ? 'text-primary' : ''}`}>New Address</span>
                                {!selectedAddressId && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">In Use</span>}
                              </div>
                              <p className="text-xs text-foreground/80 mt-1 line-clamp-1">
                                {customAddress.addressLine1}, {customAddress.city} - {customAddress.pincode}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 absolute top-2 right-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditingAddress(true);
                                setAddressForm(customAddress);
                                setSelectedAddressId(null);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        className="w-full mt-2 border-dashed h-12 flex items-center justify-center gap-2"
                        onClick={() => {
                          setIsEditingAddress(true);
                          setAddressForm({
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
                            longitude: null
                          });
                          setSelectedAddressId(null);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add New Address
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-muted/20 p-4 rounded-xl border">
                        <AddressForm
                          formData={addressForm}
                          onChange={handleAddressChange}
                          onServiceAreasFetched={setServiceAreas}
                          errors={addressErrors}
                          showDefaultToggle={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted/20 p-4 rounded-xl border">
                    <h4 className="font-bold text-sm mb-4">{selectedAddressId ? 'Edit Address' : 'New Address'}</h4>
                    <AddressForm formData={addressForm} onChange={handleAddressChange} onServiceAreasFetched={setServiceAreas} errors={addressErrors} showDefaultToggle={false} />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancelAddressEdit}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={handleAddressSaveLocal}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {selectedAddressId ? 'Confirm Updates' : 'Use this Address'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium">Payment Method</p>

              {/* Payment Category Selection */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div
                  className={`
                    relative border rounded-lg p-3 cursor-pointer flex flex-col items-center gap-2 transition-all
                    ${paymentCategory === 'ONLINE' ? 'bg-green-50 border-green-600 ring-1 ring-green-600' : 'bg-background hover:bg-muted/50'}
                  `}
                  onClick={() => setPaymentCategory('ONLINE')}
                >
                  {paymentCategory === 'ONLINE' && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-green-600 flex items-center justify-center text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                  )}
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${paymentCategory === 'ONLINE' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm">Online Payment</span>
                </div>

                <div
                  className={`
                    relative border rounded-lg p-3 cursor-pointer flex flex-col items-center gap-2 transition-all
                    ${paymentCategory === 'COD' ? 'bg-green-50 border-green-600 ring-1 ring-green-600' : 'bg-background hover:bg-muted/50'}
                  `}
                  onClick={() => setPaymentCategory('COD')}
                >
                  {paymentCategory === 'COD' && (
                    <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-green-600 flex items-center justify-center text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                  )}
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${paymentCategory === 'COD' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                    <Banknote className="h-5 w-5" />
                  </div>
                  <span className="font-medium text-sm">Cash on Delivery</span>
                </div>
              </div>

              {/* Online Payment Options */}
              {paymentCategory === 'ONLINE' && (
                <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-3 ">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={`flex items-center justify-center gap-2 h-10 sm:h-9 text-sm ${onlinePaymentMethodType === 'upi' ? 'border-green-600 text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800 ring-1 ring-green-600' : ''}`}
                        onClick={() => setOnlinePaymentMethodType('upi')}
                      >
                        <Smartphone className="h-4 w-4" />
                        UPI
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`flex items-center justify-center gap-2 h-10 sm:h-9 text-sm ${onlinePaymentMethodType === 'card' ? 'border-green-600 text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800 ring-1 ring-green-600' : ''}`}
                        onClick={() => setOnlinePaymentMethodType('card')}
                      >
                        <CreditCard className="h-4 w-4" />
                        Card
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`flex items-center justify-center gap-2 h-10 sm:h-9 text-sm ${onlinePaymentMethodType === 'netbanking' ? 'border-green-600 text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800 ring-1 ring-green-600' : ''}`}
                        onClick={() => setOnlinePaymentMethodType('netbanking')}
                      >
                        <Landmark className="h-4 w-4" />
                        Net Banking
                      </Button>
                    </div>
                    {paymentMethods[onlinePaymentMethodType]?.length > 0 && (
                      <PaymentMethodDropdown
                        paymentMethods={paymentMethods}
                        selectedType={onlinePaymentMethodType}
                        selectedId={selectedPaymentMethod?.id}
                        onSelect={setSelectedPaymentMethod}
                        errors={{}}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* COD Info */}
              {paymentCategory === 'COD' && (
                <div className="bg-muted/30 border rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-green-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <Banknote className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Pay on Delivery</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pay cash at the time of delivery.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 sm:h-12"
              onClick={() => router.push('/app/cart')}
              disabled={isLoading}
              size="lg"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Back to Cart</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <Button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 h-11 sm:h-12"
              size="lg"
              onClick={handlePlaceOrder}
              disabled={isLoading || isEditingAddress}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Placing Order...</span>
                  <span className="sm:hidden">Placing...</span>
                </>
              ) : (
                <>
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline">Place Order (₹{Math.round(totalAmount)})</span>
                  <span className="sm:hidden">Place Order (₹{Math.round(totalAmount)})</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Stale Cart / Insufficient Cans Dialog */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cart Needs Refresh</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={async () => {
                setShowErrorDialog(false);
                // Clear the cart so it recalculates fresh on the cart page
                try {
                  await fetch('/shop/api/cart', { method: 'DELETE' });
                  localStorage.removeItem('cart');
                  window.dispatchEvent(new Event('cartUpdated'));
                } catch (err) {
                  console.error('Error clearing cart:', err);
                }
                router.push('/app/cart');
              }}
            >
              OK, Go to Cart
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
          setAddressForm(prev => ({
            ...prev,
            latitude: 11.0168,
            longitude: 76.9558,
            pincode: '',
            coordinatePincode: '',
            area: ''
          }));
          setIsEditingAddress(true); // Ensure form stays open for editing
          toast('Redirected to service area. Please choose a location here.', { icon: '📍' });
        }}
      />
    </div>
  );
}
