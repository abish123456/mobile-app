# Cloudinary Image Upload Setup (Simple Alternative)

This is a simpler alternative to Vercel Blob Storage. Cloudinary is very popular, easy to set up, and has a generous free tier.

## Why Cloudinary?

- ✅ **Simple setup** - Just 3 environment variables
- ✅ **Free tier** - 25GB storage, 25GB bandwidth/month
- ✅ **Automatic optimization** - Images are automatically optimized
- ✅ **CDN included** - Fast global delivery
- ✅ **No Vercel-specific setup** - Works anywhere

## Quick Setup (5 minutes)

### Step 1: Create Cloudinary Account

1. Go to [https://cloudinary.com/users/register/free](https://cloudinary.com/users/register/free)
2. Sign up for a free account (no credit card required)
3. You'll be taken to your dashboard automatically

### Step 2: Get Your Credentials

From your Cloudinary dashboard, you'll see:
- **Cloud Name** (e.g., `dxyz123abc`)
- **API Key** (e.g., `123456789012345`)
- **API Secret** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

**Note**: The API Secret is shown only once. Copy it immediately!

### Step 3: Add Environment Variables

**Option 1: Single Variable (Easiest - Recommended!)**

Cloudinary provides a single `CLOUDINARY_URL` that contains everything. This is the simplest method!

#### For Local Development

Add to your `.env.local` file:
```env
CLOUDINARY_URL=cloudinary://961741766612691:qLkRBzOK8nfZr61F9Hdt9E9N1dA@dffw3t0ea
```
*(Replace with your actual values from the Cloudinary dashboard)*

#### For Production (Vercel)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Your Project
2. Navigate to **Settings** → **Environment Variables**
3. Add **one** variable:
   - **Name**: `CLOUDINARY_URL`
   - **Value**: `cloudinary://961741766612691:qLkRBzOK8nfZr61F9Hdt9E9N1dA@dffw3t0ea`
     *(Copy the full value from your Cloudinary dashboard)*
4. Select **All environments** (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your application

**Option 2: Individual Variables (Alternative)**

If you prefer separate variables, you can use:
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

### Step 4: Test It!

1. Deploy to Vercel (or restart local dev server)
2. Go to Admin → Products
3. Try uploading an image
4. It should work! 🎉

## That's It!

No additional configuration needed. Cloudinary handles everything:
- Image storage
- Image optimization
- CDN delivery
- Automatic format conversion (WebP, AVIF, etc.)

## How It Works

1. User selects an image file
2. Image is uploaded to your API endpoint
3. API converts image to base64
4. Cloudinary uploads and optimizes the image
5. Returns a public URL (e.g., `https://res.cloudinary.com/your-cloud/image/upload/v123/products/abc.jpg`)
6. URL is saved to your database

## Free Tier Limits

- **Storage**: 25 GB
- **Bandwidth**: 25 GB/month
- **Transformations**: 25,000/month
- **Uploads**: Unlimited

For most apps, this is more than enough!

## Troubleshooting

### Error: "Cloudinary is not configured"

**Solution**: Make sure all three environment variables are set:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Error: "Invalid API key"

**Solution**: 
- Double-check your credentials in Cloudinary dashboard
- Make sure there are no extra spaces in the environment variables
- Redeploy after adding variables

### Images not uploading

1. Check Vercel function logs for errors
2. Verify environment variables are set correctly
3. Check Cloudinary dashboard → Media Library to see if uploads are happening

### Want to see uploaded images?

Go to your Cloudinary dashboard → **Media Library** to see all uploaded images.

## Alternative: URL-Only (Simplest)

If you want the **absolute simplest** solution with zero setup:

1. Remove the file upload feature
2. Only use the "Image URL" input field (already exists in the form)
3. Users paste image URLs from:
   - Imgur
   - ImgBB
   - Any image hosting service
   - Or their own CDN

This requires no backend changes, no environment variables, and works immediately!

## Need Help?

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Cloudinary Node.js SDK](https://cloudinary.com/documentation/node_integration)

