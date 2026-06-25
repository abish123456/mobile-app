'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
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
} from '../../../components/ui/alert-dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Plus, Edit, Trash2, Loader2, AlertCircle, Package, CheckCircle2, ChevronLeft, ChevronRight, Clock, Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminPermissions, setAdminPermissions] = useState([]);

  useEffect(() => {
    try {
      const perms = localStorage.getItem('adminPermissions');
      if (perms) {
        setAdminPermissions(JSON.parse(perms));
      }
    } catch (e) {
      console.error('Failed to parse admin permissions', e);
    }
  }, []);

  const hasPermission = (perm) => {
    return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
  };

  const [showDialog, setShowDialog] = useState(false);
  const [showCutoffDialog, setShowCutoffDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;


  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    depositAmount: '',
    image: '',
    unit: '',
    inStock: true,
    gst: '5',
    isCustomPrice: false,
  });

  const [cutoffHour, setCutoffHour] = useState('11');
  const [cutoffMinute, setCutoffMinute] = useState('0');
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await adminFetch('/shop/api/admin/settings');
      const data = await res.json();
      if (data.success && data.configs) {
        setCutoffHour(data.configs.SAME_DAY_CUTOFF_HOUR || '11');
        setCutoffMinute(data.configs.SAME_DAY_CUTOFF_MINUTE || '0');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSaveCutoff = async () => {
    setIsSavingCutoff(true);
    try {
      // Save Hour
      const resHour = await adminFetch('/shop/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'SAME_DAY_CUTOFF_HOUR', value: cutoffHour }),
      });

      // Save Minute
      const resMin = await adminFetch('/shop/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'SAME_DAY_CUTOFF_MINUTE', value: cutoffMinute }),
      });

      const dataHour = await resHour.json();
      const dataMin = await resMin.json();

      if (dataHour.success && dataMin.success) {
        toast.success('Cutoff time updated');
        setShowCutoffDialog(false);
      } else {
        toast.error('Failed to update cutoff');
      }
    } catch (error) {
      console.error('Error saving cutoff:', error);
      toast.error('Network error');
    } finally {
      setIsSavingCutoff(false);
    }
  };

  const fetchProducts = async () => {
    setIsLoading(true);


    try {
      const response = await adminFetch('/shop/api/admin/products');
      const data = await response.json();

      if (data.success) {
        setProducts(data.products || []);
        // Signal that data has been refreshed
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        toast.error(data.message || 'Failed to fetch products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setSelectedProduct(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      depositAmount: '',
      image: '',
      unit: '',
      inStock: true,
      gst: '5',
      isCustomPrice: false,
    });
    setImageFile(null);
    setShowDialog(true);
  };

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      depositAmount: product.depositAmount?.toString() || '0',
      image: product.image || '',
      unit: product.unit,
      inStock: product.inStock,
      gst: product.gst?.toString() || '5',
      isCustomPrice: product.isCustomPrice || false,
    });
    setImageFile(null);
    setShowDialog(true);
  };

  const handleDelete = (product) => {
    setSelectedProduct(product);
    setShowDeleteDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let uploadedImageUrl = formData.image.trim() || null;

      // If a new image file is selected, upload it first
      if (imageFile) {
        const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
        if (!adminToken) {
          throw new Error('Admin not authenticated');
        }

        const uploadData = new FormData();
        uploadData.append('file', imageFile);

        const uploadRes = await fetch('/shop/api/admin/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: uploadData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.message || 'Failed to upload image');
        }

        uploadedImageUrl = uploadJson.url;
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        depositAmount: parseFloat(formData.depositAmount || '0'),
        image: uploadedImageUrl,
        unit: formData.unit,
        inStock: formData.inStock,
        gst: parseFloat(formData.gst || '5'),
        isCustomPrice: formData.isCustomPrice,
      };

      const url = selectedProduct
        ? `/shop/api/admin/products/${selectedProduct.id}`
        : '/shop/api/admin/products';
      const method = selectedProduct ? 'PUT' : 'POST';

      const response = await adminFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        const msg = selectedProduct ? 'Product updated successfully!' : 'Product added successfully!';
        setShowDialog(false);
        fetchProducts();
        toast.success(msg);

      } else {
        toast.error(data.message || 'Failed to save product');
      }
    } catch (err) {
      console.error('Error saving product:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsSaving(true);

    try {
      const response = await adminFetch(`/shop/api/admin/products/${selectedProduct.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setShowDeleteDialog(false);
        setSelectedProduct(null);
        fetchProducts();
        toast.success('Product deleted successfully!');

      } else {
        toast.error(data.message || 'Failed to delete product');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = Math.ceil(products.length / itemsPerPage);
  const paginatedProducts = products.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 ">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage products and items</p>
        </div>
        <div className="flex items-center gap-3">
          {/* <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Same-Day Cut-off</span>
            <span className="text-sm font-semibold text-primary">
              {(() => {
                const h = parseInt(cutoffHour);
                const m = parseInt(cutoffMinute);
                const ampm = h >= 12 ? 'PM' : 'AM';
                const displayH = h % 12 || 12;
                const displayM = m.toString().padStart(2, '0');
                return `${displayH}:${displayM} ${ampm}`;
              })()}
            </span>
          </div> */}
          {hasPermission('adjust_product_cutoff') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCutoffDialog(true)}
              className="h-9 border-primary/20 hover:bg-primary/5"
            >
              <Clock className="h-4 w-4 mr-2 text-primary" />
              Adjust Cut-off
            </Button>
          )}
          {hasPermission('create_products') && (
            <Button onClick={handleAdd} className="h-9">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          )}
        </div>
      </div>




      <Card>
        <CardContent>
          {(isLoading && products.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by adding your first product
              </p>
              {hasPermission('create_products') && (
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              )}
            </div>
          ) : (
            <div className={`rounded-md border mt-5 transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Default Price</TableHead>
                    <TableHead>GST (%)</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    {(hasPermission('edit_products') || hasPermission('delete_products')) && (
                      <TableHead className="text-center">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium max-w-[200px] whitespace-normal break-words">{product.name}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {product.description || ''}
                      </TableCell>
                      <TableCell>₹{Number(product.price).toFixed(2)}</TableCell>
                      <TableCell>{product.gst}%</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>
                        <Badge variant={product.inStock ? 'default' : 'secondary'}>
                          {product.inStock ? 'In Stock' : 'Out of Stock'}
                        </Badge>
                      </TableCell>
                      {(hasPermission('edit_products') || hasPermission('delete_products')) && (
                        <TableCell className="text-center">
                          <div>
                            {hasPermission('edit_products') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(product)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {hasPermission('delete_products') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(product)}
                              >
                                {/* <Trash2 className="h-4 w-4 text-destructive" /> */}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground mr-2">
                Showing {Math.min(products.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(products.length, currentPage * itemsPerPage)} of {products.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct
                ? 'Update product information'
                : 'Add a new product to the catalog'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="name">Product Name *</Label>
                  <span className={`text-[10px] ${formData.name.length >= 25 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                    {formData.name.length}/25
                  </span>
                </div>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Water Can"
                  required
                  maxLength={25}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description </Label>
                <textarea
                  id="description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }

                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Default Price (₹) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="50"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Item</Label>
                  <Input
                    id="unit"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}

                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount (₹)</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.depositAmount}
                    onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                    placeholder="150"
                  />
                  <p className="text-xs text-muted-foreground">Refundable container deposit</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gst">GST Percentage (%) *</Label>
                  <Input
                    id="gst"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.gst}
                    onChange={(e) => {
                      let value = e.target.value;
                      if (parseFloat(value) > 100) value = '100';
                      setFormData({ ...formData, gst: value })
                    }}
                    placeholder="5"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageFile">Upload Image</Label>
                <Input
                  id="imageFile"
                  type="file"
                  accept="image/*"
                  style={{ cursor: 'pointer' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setImageFile(file);
                  }}
                />
                {imageFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {imageFile.name}
                  </p>
                )}
                {!imageFile && formData.image && (
                  <div className="flex items-center gap-2">
                    <img
                      src={formData.image}
                      alt="Current"
                      className="h-12 w-12 rounded object-cover border"
                    />
                    <p className="text-xs text-muted-foreground">Using existing image</p>
                  </div>
                )}
              </div>

              <div className="flex flex-row items-center gap-6">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="inStock"
                    checked={formData.inStock}
                    onChange={(e) =>
                      setFormData({ ...formData, inStock: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="inStock" className="cursor-pointer">
                    In Stock
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isCustomPrice"
                    checked={formData.isCustomPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, isCustomPrice: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="isCustomPrice" className="cursor-pointer">
                    Custom Price
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : selectedProduct ? (
                  'Update Product'
                ) : (
                  'Add Product'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedProduct?.name}"? This action
              cannot be undone. The product will be hidden from customers but can be
              restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cutoff Time Dialog */}
      <Dialog open={showCutoffDialog} onOpenChange={setShowCutoffDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adjust Same-Day Cut-off Time</DialogTitle>
            {/* <DialogDescription>
              Orders placed after this hour will be scheduled for next-day delivery.
            </DialogDescription> */}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cutoff-hour">Hours</Label>
                  <Input
                    id="cutoff-hour"
                    type="number"
                    min="0"
                    max="23"
                    value={cutoffHour}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setCutoffHour('');
                        return;
                      }
                      const num = parseInt(val);
                      if (isNaN(num)) return;
                      if (num >= 0 && num <= 23) {
                        setCutoffHour(num.toString());
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cutoff-minute">Minutes</Label>
                  <Input
                    id="cutoff-minute"
                    type="number"
                    min="0"
                    max="59"
                    value={cutoffMinute}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setCutoffMinute('');
                        return;
                      }
                      const num = parseInt(val);
                      if (isNaN(num)) return;
                      if (num >= 0 && num <= 59) {
                        setCutoffMinute(num.toString());
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/10">
                <span className="text-sm font-medium">Preview:</span>
                <span className="text-lg font-bold text-primary">
                  {(() => {
                    const h = parseInt(cutoffHour) || 0;
                    const m = parseInt(cutoffMinute) || 0;
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const displayH = h % 12 || 12;
                    const displayM = m.toString().padStart(2, '0');
                    return `${displayH}:${displayM} ${ampm}`;
                  })()}
                </span>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Orders placed after this time will be scheduled for next-day.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCutoffDialog(false)} disabled={isSavingCutoff}>
              Cancel
            </Button>
            <Button onClick={handleSaveCutoff} disabled={isSavingCutoff}>
              {isSavingCutoff ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

