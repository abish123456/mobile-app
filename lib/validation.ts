/**
 * Centralized validation utilities for the application
 */

// Phone number validation (Indian format)
export function validatePhoneNumber(phone: string): { valid: boolean; message?: string } {
  if (!phone || !phone.trim()) {
    return { valid: false, message: 'Phone number is required' };
  }

  // Remove spaces, dashes, and other non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');

  // Check if it starts with country code and remove it
  let phoneNumber = cleanPhone;
  if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
    phoneNumber = cleanPhone.substring(2);
  } else if (cleanPhone.startsWith('+91')) {
    phoneNumber = cleanPhone.substring(3);
  }

  // Indian phone number validation: 10 digits, starting with 6-9
  if (phoneNumber.length !== 10) {
    return { valid: false, message: 'Phone number must be 10 digits' };
  }

  if (phoneNumber.startsWith('0')) {
    return { valid: false, message: 'Phone number cannot start with 0' };
  }

  if (!/^[6-9]/.test(phoneNumber)) {
    return { valid: false, message: 'Phone number must start with 6, 7, 8, or 9' };
  }

  if (!/^\d{10}$/.test(phoneNumber)) {
    return { valid: false, message: 'Phone number must contain only digits' };
  }

  return { valid: true };
}

// Name validation
export function validateName(name: string): { valid: boolean; message?: string } {
  if (!name || !name.trim()) {
    return { valid: false, message: 'Name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, message: 'Name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, message: 'Name must not exceed 100 characters' };
  }

  // Allow letters, spaces, hyphens, apostrophes (for names like O'Brien, Mary-Jane)
  if (!/^[a-zA-Z\s\-'\.]+$/.test(trimmed)) {
    return { valid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }

  return { valid: true };
}

// Address line validation
export function validateAddressLine(line: string, fieldName: string = 'Address'): { valid: boolean; message?: string } {
  if (!line || !line.trim()) {
    return { valid: false, message: `${fieldName} is required` };
  }

  const trimmed = line.trim();

  if (trimmed.length < 5) {
    return { valid: false, message: `${fieldName} must be at least 5 characters` };
  }

  if (trimmed.length > 200) {
    return { valid: false, message: `${fieldName} must not exceed 200 characters` };
  }

  return { valid: true };
}

// Area/Zone validation
export function validateArea(area: string): { valid: boolean; message?: string } {
  if (!area || !area.trim()) {
    return { valid: false, message: 'Area/Zone is required' };
  }

  const trimmed = area.trim();

  if (trimmed.length < 2) {
    return { valid: false, message: 'Area/Zone must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, message: 'Area/Zone must not exceed 100 characters' };
  }

  return { valid: true };
}

// City validation
export function validateCity(city: string): { valid: boolean; message?: string } {
  if (!city || !city.trim()) {
    return { valid: false, message: 'City is required' };
  }

  const trimmed = city.trim();

  if (trimmed.length < 2) {
    return { valid: false, message: 'City must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, message: 'City must not exceed 100 characters' };
  }

  // Allow letters, spaces, hyphens
  if (!/^[a-zA-Z\s\-]+$/.test(trimmed)) {
    return { valid: false, message: 'City can only contain letters, spaces, and hyphens' };
  }

  return { valid: true };
}

// Pincode validation (Indian format: 6 digits)
export function validatePincode(pincode: string): { valid: boolean; message?: string } {
  if (!pincode || !pincode.trim()) {
    return { valid: false, message: 'Pincode is required' };
  }

  const trimmed = pincode.trim();

  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, message: 'Pincode must be exactly 6 digits' };
  }

  // Indian pincode range: 100000 to 999999
  const pincodeNum = parseInt(trimmed, 10);
  if (pincodeNum < 100000 || pincodeNum > 999999) {
    return { valid: false, message: 'Pincode must be between 100000 and 999999' };
  }

  return { valid: true };
}

// Quantity validation
export function validateQuantity(quantity: number, min: number = 1, max: number = 100): { valid: boolean; message?: string } {
  if (quantity === null || quantity === undefined || isNaN(quantity)) {
    return { valid: false, message: 'Quantity is required' };
  }

  if (!Number.isInteger(quantity)) {
    return { valid: false, message: 'Quantity must be a whole number' };
  }

  if (quantity < min) {
    return { valid: false, message: `Quantity must be at least ${min}` };
  }

  if (quantity > max) {
    return { valid: false, message: `Quantity cannot exceed ${max}` };
  }

  return { valid: true };
}

// Delivery slot validation (now just date validation)
export const VALID_DELIVERY_SLOTS = [
  'TODAY',
  'TOMORROW',
] as const;

export type DeliverySlot = typeof VALID_DELIVERY_SLOTS[number];

export function validateDeliverySlot(slot: string): { valid: boolean; message?: string; normalized?: string } {
  if (!slot || !slot.trim()) {
    return { valid: false, message: 'Delivery date is required' };
  }

  // Normalize slot format
  let normalized = slot.toUpperCase().replace(/-/g, '_');

  // Check if it's TODAY or TOMORROW
  if (normalized === 'TODAY' || normalized === 'TOMORROW') {
    return { valid: true, normalized };
  }

  // Check if it's a date format (YYYY-MM-DD or YYYY_MM_DD)
  const datePattern = /^(\d{4})[-_](\d{2})[-_](\d{2})$/;
  const match = normalized.match(datePattern) || slot.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    // Validate date is valid
    if (date.getFullYear() !== parseInt(year) || 
        date.getMonth() !== parseInt(month) - 1 || 
        date.getDate() !== parseInt(day)) {
      return { valid: false, message: 'Invalid date format' };
    }

    // Validate date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return { valid: false, message: 'Delivery date cannot be in the past' };
    }

    // Return normalized date format (YYYY-MM-DD)
    const normalizedDate = `${year}-${month}-${day}`;
    return { valid: true, normalized: normalizedDate };
  }

  return {
    valid: false,
    message: `Invalid delivery date format. Use TODAY, TOMORROW, or YYYY-MM-DD`,
  };
}

// UPI ID validation
export function validateUpiId(upiId: string): { valid: boolean; message?: string } {
  if (!upiId || !upiId.trim()) {
    return { valid: false, message: 'UPI ID is required' };
  }

  const trimmed = upiId.trim().toLowerCase();

  // UPI format: username@provider
  // Username: alphanumeric, dots, hyphens, underscores
  // Provider: alphanumeric (paytm, phonepe, gpay, ybl, etc.)
  const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;

  if (!upiPattern.test(trimmed)) {
    return {
      valid: false,
      message: 'Invalid UPI ID format. Use format: username@provider (e.g., yourname@paytm)',
    };
  }

  return { valid: true };
}

// Card number validation (Luhn algorithm)
export function validateCardNumber(cardNumber: string): { valid: boolean; message?: string } {
  if (!cardNumber || !cardNumber.trim()) {
    return { valid: false, message: 'Card number is required' };
  }

  const cleanCard = cardNumber.replace(/\s+/g, '');

  if (!/^\d+$/.test(cleanCard)) {
    return { valid: false, message: 'Card number must contain only digits' };
  }

  if (cleanCard.length < 13 || cleanCard.length > 19) {
    return { valid: false, message: 'Card number must be between 13 and 19 digits' };
  }

  // Luhn algorithm
  let sum = 0;
  let isEven = false;

  for (let i = cleanCard.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanCard[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  if (sum % 10 !== 0) {
    return { valid: false, message: 'Invalid card number (checksum failed)' };
  }

  return { valid: true };
}

// Expiry date validation
export function validateExpiry(month: number, year: number): { valid: boolean; message?: string } {
  if (month === null || month === undefined || isNaN(month)) {
    return { valid: false, message: 'Expiry month is required' };
  }

  if (year === null || year === undefined || isNaN(year)) {
    return { valid: false, message: 'Expiry year is required' };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { valid: false, message: 'Expiry month must be between 1 and 12' };
  }

  if (!Number.isInteger(year) || year < 0 || year > 99) {
    return { valid: false, message: 'Expiry year must be between 0 and 99' };
  }

  // Convert 2-digit year to 4-digit (assume 2000-2099)
  const fullYear = year < 100 ? 2000 + year : year;
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Check if card is expired
  if (fullYear < currentYear || (fullYear === currentYear && month < currentMonth)) {
    return { valid: false, message: 'Card has expired' };
  }

  // Check if expiry is too far in the future (more than 20 years)
  if (fullYear > currentYear + 20) {
    return { valid: false, message: 'Expiry year is too far in the future' };
  }

  return { valid: true };
}

// CVC validation
export function validateCvc(cvc: string, cardNumber?: string): { valid: boolean; message?: string } {
  if (!cvc || !cvc.trim()) {
    return { valid: false, message: 'CVC is required' };
  }

  const cleanCvc = cvc.trim();

  if (!/^\d+$/.test(cleanCvc)) {
    return { valid: false, message: 'CVC must contain only digits' };
  }

  // Determine CVC length based on card type (if provided)
  let expectedLength = 3;
  if (cardNumber) {
    const cleanCard = cardNumber.replace(/\s+/g, '');
    // American Express cards have 4-digit CVC
    if (cleanCard.startsWith('34') || cleanCard.startsWith('37')) {
      expectedLength = 4;
    }
  }

  if (cleanCvc.length !== expectedLength) {
    return {
      valid: false,
      message: `CVC must be ${expectedLength} digits${cardNumber ? '' : ' (3 digits for most cards, 4 for American Express)'}`,
    };
  }

  return { valid: true };
}

