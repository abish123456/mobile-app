# Image Upload Setup Guide

This guide explains how to set up image uploads for product images in the Watercan Delivery App.

## Problem

The app was previously trying to save images to the local filesystem (`public/uploads`), which works locally but fails on Vercel because:
- Vercel's filesystem is read-only (except `/tmp`)
- Files would be lost on each deployment
- The `/public` directory is read-only in production

## Solution

We've migrated to **Vercel Blob Storage**, which is Vercel's native cloud storage solution that works seamlessly with serverless functions.

## Setup Steps

### 1. Install Vercel Blob Storage

The package is already installed in `package.json`:
```json
"@vercel/blob": "^latest"
```

If you need to install it manually:
```bash
npm install @vercel/blob
```

### 2. Get Vercel Blob Storage Token

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Storage**
4. Click **Create Database** or **Add Storage**
5. Select **Blob** from the options
6. Create a new Blob store (or use existing one)
7. Go to **Settings** → **Environment Variables**
8. Find or create `BLOB_READ_WRITE_TOKEN`
   - This token is automatically generated when you create a Blob store
   - If you don't see it, go to your Blob store settings and copy the token

### 3. Configure Environment Variables

#### For Local Development

Add to your `.env.local` file:
```env
# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Note**: For local development, you can use a test token or the actual production token. The token format is: `vercel_blob_rw_...`

#### For Production (Vercel)

1. Go to Vercel Dashboard → Your Project
2. Navigate to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `BLOB_READ_WRITE_TOKEN`
   - **Value**: Your Blob storage token (starts with `vercel_blob_rw_`)
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your application for the changes to take effect

### 4. How It Works

The upload route (`/api/admin/upload`) now:
1. Accepts image files via FormData
2. Validates file type (images only: JPEG, PNG, GIF, WebP)
3. Validates file size (max 10MB)
4. Uploads to Vercel Blob Storage
5. Returns a public URL for the uploaded image

### 5. File Structure

Uploaded images are stored in the `products/` folder in your Blob store:
- Format: `products/{uuid}.{ext}`
- Example: `products/550e8400-e29b-41d4-a716-446655440000.jpg`
- Public URL: `https://[your-blob-store].public.blob.vercel-storage.com/products/...`

## Testing

### Local Testing

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Go to Admin → Products
3. Click "Add Product" or edit an existing product
4. Select an image file
5. Upload and verify the image appears

### Production Testing

1. After deploying to Vercel, go to your admin panel
2. Try uploading an image
3. Check that the image URL is accessible
4. Verify the image displays correctly in the product list

## Troubleshooting

### Error: "Failed to upload file"

**Possible causes:**
1. **Missing `BLOB_READ_WRITE_TOKEN`**: 
   - Check Vercel Dashboard → Settings → Environment Variables
   - Ensure the token is set for all environments
   - Redeploy after adding the variable

2. **Invalid token**:
   - Verify the token starts with `vercel_blob_rw_`
   - Regenerate the token in Vercel Blob Storage settings

3. **File size too large**:
   - Current limit is 10MB
   - Compress images before uploading

4. **Invalid file type**:
   - Only images are allowed (JPEG, PNG, GIF, WebP)
   - Check the file extension and MIME type

### Error: "No file uploaded"

- Ensure you're selecting a file before submitting
- Check browser console for JavaScript errors
- Verify the form is submitting correctly

### Images not displaying

1. **Check the image URL**:
   - The URL should be a full Vercel Blob Storage URL
   - Format: `https://[store].public.blob.vercel-storage.com/...`

2. **Verify CORS settings**:
   - Vercel Blob Storage URLs are public by default
   - If images don't load, check browser console for CORS errors

3. **Check Content Security Policy**:
   - Ensure your CSP allows images from `*.vercel-storage.com`
   - Update `lib/security-headers.ts` if needed

### Local development issues

If uploads fail locally:
1. Ensure `.env.local` has `BLOB_READ_WRITE_TOKEN`
2. Restart the development server after adding the token
3. Check that the token is valid (you can use the production token for testing)

## Migration from Local Storage

If you had images stored locally before:
1. Old images in `public/uploads/` will no longer work in production
2. You'll need to re-upload images through the admin panel
3. Or migrate existing images to Blob Storage manually

## Cost Considerations

Vercel Blob Storage pricing:
- **Free tier**: 1 GB storage, 100 GB bandwidth/month
- **Pro tier**: $0.15/GB storage, $0.40/GB bandwidth
- Check [Vercel Pricing](https://vercel.com/pricing) for current rates

For most applications, the free tier is sufficient for product images.

## Security Notes

1. **Authentication**: The upload endpoint requires admin authentication
2. **File validation**: Only image files are accepted
3. **Size limits**: 10MB maximum file size
4. **Public access**: Images are stored with public access for easy display
   - If you need private images, modify the `put()` call in `route.ts`

## Additional Resources

- [Vercel Blob Storage Documentation](https://vercel.com/docs/storage/vercel-blob)
- [@vercel/blob Package](https://www.npmjs.com/package/@vercel/blob)

