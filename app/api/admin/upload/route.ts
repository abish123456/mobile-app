import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAdminAuthErrorResponse } from "../../../../lib/admin-auth";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
// Supports both CLOUDINARY_URL (single variable) or individual variables
// If CLOUDINARY_URL is set, Cloudinary automatically uses it
if (!process.env.CLOUDINARY_URL) {
  // Only configure manually if using individual variables
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// POST /api/admin/upload
// Accepts form-data with a single "file" field and saves it to Cloudinary.
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdminAuth(req))) {
      return NextResponse.json(getAdminAuthErrorResponse(), { status: 401 });
    }

    // Check if Cloudinary is configured
    const hasUrl = !!process.env.CLOUDINARY_URL;
    const hasIndividual = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
    
    if (!hasUrl && !hasIndividual) {
      return NextResponse.json(
        { success: false, message: "Cloudinary is not configured. Please set CLOUDINARY_URL (recommended) or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables." },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, message: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Validate file type (images only)
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: "Invalid file type. Only images are allowed." },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert buffer to base64 data URL
    const base64 = buffer.toString("base64");
    const dataURI = `data:${file.type};base64,${base64}`;

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        dataURI,
        {
          folder: "products",
          resource_type: "image",
          transformation: [
            { quality: "auto" },
            { fetch_format: "auto" }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    return NextResponse.json({
      success: true,
      url: (result as any).secure_url,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/upload:", error);
    
    // Provide more specific error messages
    let errorMessage = "Failed to upload file";
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error("Error details:", error.stack);
    }

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}

