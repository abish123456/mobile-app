import { NextRequest, NextResponse } from "next/server";

// Note: Razorpay doesn't provide pre-payment card verification API
// We'll only do format validation (Luhn algorithm, expiry, CVC)
// Full verification happens during actual payment

/**
 * Validates UPI ID format
 * UPI format: username@provider
 * Valid providers: paytm, ybl, phonepe, gpay, bhim, etc.
 */
function validateUpiFormat(upiId: string): { valid: boolean; message?: string } {
  const trimmed = upiId.trim().toLowerCase();
  
  // Basic format: alphanumeric, dots, hyphens, underscores @ provider
  const upiPattern = /^[\w.-]+@[\w]+$/;
  
  if (!upiPattern.test(trimmed)) {
    return {
      valid: false,
      message: "Invalid UPI format. Use: yourname@paytm or yourname@ybl",
    };
  }

  // Check for common UPI providers
  const validProviders = [
    "paytm", "ybl", "phonepe", "gpay", "bhim", "axis", "okaxis", 
    "okhdfcbank", "okicici", "oksbi", "payzapp", "upi"
  ];
  
  const provider = trimmed.split("@")[1];
  if (!validProviders.includes(provider)) {
    // Still allow it, but warn
    return {
      valid: true,
      message: "Uncommon UPI provider. Please verify it's correct.",
    };
  }

  return { valid: true };
}

/**
 * Validates card number using Luhn algorithm
 */
function validateCardNumber(cardNumber: string): { valid: boolean; message?: string } {
  // Remove spaces and dashes
  const cleaned = cardNumber.replace(/\s|-/g, "");
  
  // Check if it's all digits
  if (!/^\d+$/.test(cleaned)) {
    return {
      valid: false,
      message: "Card number must contain only digits",
    };
  }

  // Check length (13-19 digits for most cards)
  if (cleaned.length < 13 || cleaned.length > 19) {
    return {
      valid: false,
      message: "Card number must be between 13 and 19 digits",
    };
  }

  // Luhn algorithm validation
  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);

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
    return {
      valid: false,
      message: "Invalid card number (failed checksum validation)",
    };
  }

  return { valid: true };
}

/**
 * Validates card expiry date
 */
function validateExpiry(expMonth: number, expYear: number): { valid: boolean; message?: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (expMonth < 1 || expMonth > 12) {
    return {
      valid: false,
      message: "Invalid expiry month (must be 1-12)",
    };
  }

  if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
    return {
      valid: false,
      message: "Card has expired",
    };
  }

  return { valid: true };
}

/**
 * Validates CVC
 */
function validateCvc(cvc: string): { valid: boolean; message?: string } {
  const cleaned = cvc.replace(/\s/g, "");
  
  if (!/^\d+$/.test(cleaned)) {
    return {
      valid: false,
      message: "CVC must contain only digits",
    };
  }

  if (cleaned.length < 3 || cleaned.length > 4) {
    return {
      valid: false,
      message: "CVC must be 3 or 4 digits",
    };
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {

    const body = await req.json();
    const { type, details, expMonth, expYear, cvc } = body;

    if (!type || !details) {
      return NextResponse.json(
        { success: false, message: "Type and details are required" },
        { status: 400 }
      );
    }

    if (type === "upi") {
      // Validate UPI format
      const validation = validateUpiFormat(details);
      
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          valid: false,
          message: validation.message,
        });
      }

      // UPI can't be fully verified without a test payment
      // But format validation is sufficient for MVP
      return NextResponse.json({
        success: true,
        valid: true,
        message: validation.message || "UPI ID format is valid",
        verified: false, // Not fully verified, just format-checked
      });
    } else if (type === "card") {
      // Validate card number format first
      const cardValidation = validateCardNumber(details);
      if (!cardValidation.valid) {
        return NextResponse.json({
          success: false,
          valid: false,
          message: cardValidation.message,
        });
      }

      // If expiry and CVC provided, validate them
      if (expMonth && expYear) {
        const expiryValidation = validateExpiry(expMonth, expYear);
        if (!expiryValidation.valid) {
          return NextResponse.json({
            success: false,
            valid: false,
            message: expiryValidation.message,
          });
        }
      }

      if (cvc) {
        const cvcValidation = validateCvc(cvc);
        if (!cvcValidation.valid) {
          return NextResponse.json({
            success: false,
            valid: false,
            message: cvcValidation.message,
          });
        }
      }

      // Razorpay doesn't provide pre-payment card verification API
      // We'll only do format validation (Luhn algorithm, expiry, CVC)
      // Full verification happens during actual payment with Razorpay
      if (expMonth && expYear && cvc) {
        // Extract last 4 digits manually
        const cleanedCard = details.replace(/\s|-/g, "");
        const last4 = cleanedCard.slice(-4);
        
        // Determine card brand from card number prefix (more accurate detection)
        let brand = "unknown";
        const firstDigit = cleanedCard[0];
        const firstTwo = cleanedCard.substring(0, 2);
        const firstFour = cleanedCard.substring(0, 4);
        
        if (firstDigit === "4") {
          brand = "visa";
        } else if (firstDigit === "5" && parseInt(firstTwo) >= 51 && parseInt(firstTwo) <= 55) {
          brand = "mastercard";
        } else if (firstTwo === "34" || firstTwo === "37") {
          brand = "amex";
        } else if (firstTwo === "30" || firstTwo === "36" || firstTwo === "38") {
          brand = "diners";
        } else if (firstFour === "6011" || firstTwo === "65" || (parseInt(firstFour) >= 622126 && parseInt(firstFour) <= 622925)) {
          brand = "discover";
        } else if (firstTwo === "35") {
          brand = "jcb";
        } else if (firstTwo === "50" || (parseInt(firstTwo) >= 56 && parseInt(firstTwo) <= 69)) {
          brand = "maestro";
        } else if (firstDigit === "6") {
          brand = "discover"; // Fallback for other 6xxx cards
        } else if (firstDigit === "5") {
          brand = "mastercard"; // Fallback for other 5xxx cards
        }
        
        // Return format-validated card (will be fully verified during payment with Razorpay)
        return NextResponse.json({
          success: true,
          valid: true,
          verified: false, // Not fully verified, but format is valid
          message: "Card format validated. Card will be verified during payment.",
          stripePaymentMethodId: null, // Not applicable for Razorpay
          last4: last4,
          brand: brand,
        });
      } else {
        // Only card number provided - format validation only
        return NextResponse.json({
          success: true,
          valid: true,
          verified: false,
          message: "Card number format is valid. Add expiry and CVC for full verification.",
        });
      }
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid payment method type" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error verifying payment method:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}

