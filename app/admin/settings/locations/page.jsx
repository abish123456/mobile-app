'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { Checkbox } from '../../../../components/ui/checkbox';
import { 
  Loader2, Plus, Edit, Trash2, MapPin, Search, Navigation, CircleDot 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../components/ui/alert-dialog';
import dynamic from 'next/dynamic';

// Dynamically import map component (Leaflet requires browser window)
const LocationMap = dynamic(() => import('./LocationMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-slate-100 rounded-lg flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )
});

export default function AttendanceLocationsPage() {
    const router = useRouter();
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        latitude: '',
        longitude: '',
        radiusMeters: '100',
        active: true
    });

    // Address search
    const [addressSearch, setAddressSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch('/api/admin/attendance-locations');
            const data = await res.json();
            if (data.success) {
                setLocations(data.locations || []);
            } else {
                toast.error(data.message || 'Failed to load locations');
            }
        } catch (err) {
            console.error('Error fetching locations:', err);
            toast.error('Network error loading locations');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearchAddress = async () => {
        if (!addressSearch.trim()) return;
        setIsSearching(true);
        try {
            const res = await adminFetch(`/api/admin/geocode?q=${encodeURIComponent(addressSearch)}`);
            const data = await res.json();
            if (data.success) {
                setSearchResults(data.results || []);
                if (data.results.length === 0) {
                    toast.error('No results found. Try a different search term.');
                }
            } else {
                toast.error('Search failed');
            }
        } catch (err) {
            console.error('Address search error:', err);
            toast.error('Failed to search address');
        } finally {
            setIsSearching(false);
        }
    };

    const selectSearchResult = (result) => {
        setFormData(prev => ({
            ...prev,
            latitude: parseFloat(result.lat).toFixed(6),
            longitude: parseFloat(result.lon).toFixed(6),
            name: prev.name || result.display_name.split(',')[0]
        }));
        setSearchResults([]);
        setAddressSearch('');
    };

    const handleMapClick = (lat, lng) => {
        setFormData(prev => ({
            ...prev,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6)
        }));
    };

    const handleCreate = () => {
        setEditingId(null);
        setFormData({ name: '', latitude: '', longitude: '', radiusMeters: '100', active: true });
        setAddressSearch('');
        setSearchResults([]);
        setShowDialog(true);
    };

    const handleEdit = (location) => {
        setEditingId(location.id);
        setFormData({
            name: location.name,
            latitude: location.latitude.toString(),
            longitude: location.longitude.toString(),
            radiusMeters: location.radiusMeters.toString(),
            active: location.active
        });
        setAddressSearch('');
        setSearchResults([]);
        setShowDialog(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error('Location name is required');
            return;
        }
        if (!formData.latitude || !formData.longitude) {
            toast.error('Please select a location on the map or search for an address');
            return;
        }
        if (!formData.radiusMeters || parseFloat(formData.radiusMeters) <= 0) {
            toast.error('Radius must be greater than 0');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                latitude: parseFloat(formData.latitude),
                longitude: parseFloat(formData.longitude),
                radiusMeters: parseFloat(formData.radiusMeters),
                active: formData.active
            };

            let res;
            if (editingId) {
                res = await adminFetch(`/api/admin/attendance-locations/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                res = await adminFetch('/api/admin/attendance-locations', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            const data = await res.json();
            if (data.success) {
                toast.success(editingId ? 'Location updated!' : 'Location created!');
                setShowDialog(false);
                fetchLocations();
            } else {
                toast.error(data.message || 'Failed to save location');
            }
        } catch (err) {
            toast.error('Network error saving location');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTargetId) return;
        setDeletingId(deleteTargetId);
        try {
            const res = await adminFetch(`/api/admin/attendance-locations/${deleteTargetId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Location deleted');
                fetchLocations();
            } else {
                toast.error(data.message || 'Failed to delete');
            }
        } catch (err) {
            toast.error('Network error deleting location');
        } finally {
            setDeletingId(null);
            setShowDeleteDialog(false);
            setDeleteTargetId(null);
        }
    };

    const filteredLocations = locations.filter(loc =>
        loc.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatRadius = (meters) => {
        if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
        return `${meters} m`;
    };

    return (
        <div className="space-y-4">
            {/* Table */}
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
                    <div>
                        <CardTitle>Attendance Locations</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search locations..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Button onClick={handleCreate} className="flex items-center gap-2 cursor-pointer shrink-0">
                            <Plus className="h-4 w-4" /> Add Location
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            <span className="ml-2 text-slate-500">Loading locations...</span>
                        </div>
                    ) : filteredLocations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <MapPin className="h-12 w-12 mb-3" />
                            <p className="text-lg font-medium text-slate-600">
                                {searchTerm ? 'No locations match your search' : 'No locations configured'}
                            </p>
                            <p className="text-sm text-slate-400 mt-1">
                                {!searchTerm && 'Create your first attendance location to get started'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead className="font-semibold text-slate-600">Name</TableHead>
                                        <TableHead className="font-semibold text-slate-600">Coordinates</TableHead>
                                        <TableHead className="font-semibold text-slate-600">Radius</TableHead>
                                        <TableHead className="font-semibold text-slate-600">Status</TableHead>
                                        <TableHead className="font-semibold text-slate-600 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLocations.map((loc) => (
                                        <TableRow key={loc.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-medium text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                                        <MapPin className="h-4 w-4 text-blue-600" />
                                                    </div>
                                                    {loc.name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-500 text-sm font-mono">
                                                {parseFloat(loc.latitude).toFixed(4)}, {parseFloat(loc.longitude).toFixed(4)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    <CircleDot className="h-3 w-3 mr-1" />
                                                    {formatRadius(loc.radiusMeters)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={loc.active 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                    : 'bg-red-50 text-red-600 border-red-200'
                                                }>
                                                    {loc.active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        onClick={() => handleEdit(loc)}
                                                        className="text-slate-500 hover:text-blue-600"
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        onClick={() => {
                                                            setDeleteTargetId(loc.id);
                                                            setShowDeleteDialog(true);
                                                        }}
                                                        disabled={deletingId === loc.id}
                                                        className="text-slate-500 hover:text-red-600"
                                                        title="Delete"
                                                    >
                                                        {deletingId === loc.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900">
                            {editingId ? 'Edit Location' : 'Add Attendance Location'}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            Set a geofenced zone. Staff can only mark attendance when inside this zone.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="loc-name" className="text-sm font-medium text-slate-700">Location Name *</Label>
                            <Input
                                id="loc-name"
                                placeholder="e.g. Main Office, Warehouse"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>

                        {/* Address Search */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700">Search Address</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Search for a place or address..."
                                    value={addressSearch}
                                    onChange={(e) => setAddressSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchAddress()}
                                />
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    onClick={handleSearchAddress}
                                    disabled={isSearching}
                                    className="shrink-0"
                                >
                                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                </Button>
                            </div>
                            {searchResults.length > 0 && (
                                <div className="border border-slate-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={idx}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                                            onClick={() => selectSearchResult(result)}
                                        >
                                            <div className="flex items-start gap-2">
                                                <Navigation className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                                <span className="text-slate-700 line-clamp-2">{result.display_name}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Map */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700">
                                Pin Location on Map
                                <span className="text-slate-400 font-normal ml-1">(click to set)</span>
                            </Label>
                            <div className="rounded-lg overflow-hidden border border-slate-200">
                                <LocationMap
                                    latitude={formData.latitude ? parseFloat(formData.latitude) : null}
                                    longitude={formData.longitude ? parseFloat(formData.longitude) : null}
                                    radiusMeters={parseFloat(formData.radiusMeters) || 100}
                                    onMapClick={handleMapClick}
                                />
                            </div>
                        </div>

                        {/* Coordinates & Radius */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="lat" className="text-sm font-medium text-slate-700">Latitude</Label>
                                <Input
                                    id="lat"
                                    type="number"
                                    step="any"
                                    placeholder="11.0168"
                                    value={formData.latitude}
                                    onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                                    className="font-mono text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="lng" className="text-sm font-medium text-slate-700">Longitude</Label>
                                <Input
                                    id="lng"
                                    type="number"
                                    step="any"
                                    placeholder="76.9558"
                                    value={formData.longitude}
                                    onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                                    className="font-mono text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="radius" className="text-sm font-medium text-slate-700">Radius (meters)</Label>
                                <Input
                                    id="radius"
                                    type="number"
                                    min="1"
                                    placeholder="100"
                                    value={formData.radiusMeters}
                                    onChange={(e) => setFormData(prev => ({ ...prev, radiusMeters: e.target.value }))}
                                    className="font-mono text-sm"
                                />
                            </div>
                        </div>

                        {/* Active Toggle */}
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <Checkbox
                                id="loc-active"
                                checked={formData.active}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: !!checked }))}
                            />
                            <div>
                                <Label htmlFor="loc-active" className="text-sm font-medium text-slate-700 cursor-pointer">Active</Label>
                                <p className="text-xs text-slate-400 mt-0.5">Staff can only see active locations</p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                        <Button 
                            onClick={handleSave} 
                            disabled={isSaving}
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingId ? 'Update Location' : 'Create Location'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this location?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this attendance location. Any existing attendance logs linked to this location will remain but won&apos;t show the location name.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
