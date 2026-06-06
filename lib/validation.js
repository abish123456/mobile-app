/**
 * Centralized validation utilities for the application (JavaScript version for frontend)
 */

// Phone number validation (Indian format)
export function validatePhoneNumber(phone) {
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
export function validateName(name) {
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
export function validateAddressLine(line, fieldName = 'Address') {
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
export function validateArea(area) {
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
export function validateCity(city) {
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
export function validatePincode(pincode) {
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
export function validateQuantity(quantity, min = 1, max = 100) {
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

// Delivery slot validation
export const VALID_DELIVERY_SLOTS = [
  'TODAY_MORNING',
  'TODAY_EVENING',
  'TOMORROW_MORNING',
  'TOMORROW_EVENING',
];

export function validateDeliverySlot(slot) {
  if (!slot || !slot.trim()) {
    return { valid: false, message: 'Delivery slot is required' };
  }

  // Normalize slot format (handle both "today-morning" and "TODAY_MORNING")
  const normalized = slot.toUpperCase().replace(/-/g, '_');

  if (!VALID_DELIVERY_SLOTS.includes(normalized)) {
    return {
      valid: false,
      message: `Invalid delivery slot. Must be one of: ${VALID_DELIVERY_SLOTS.join(', ')}`,
    };
  }

  return { valid: true, normalized };
}

