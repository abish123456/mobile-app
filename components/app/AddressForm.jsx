'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

import { SearchableSelect } from '../ui/searchable-select';
import { Star, MapPin, Search, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-muted animate-pulse rounded-lg flex items-center justify-center">Loading Map...</div>
});

export default function AddressForm({ formData, onChange, onServiceAreasFetched, errors = {}, showDefaultToggle = true }) {
  const [serviceAreas, setServiceAreas] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState('');

  useEffect(() => {
    const fetchServiceAreas = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/shop/api/service-areas');
        const data = await response.json();
        if (data.success) {
          const areas = data.serviceAreas || [];
          console.log('AddressForm: Fetched service areas:', areas.length);
          setServiceAreas(areas);
          // Notify parent if callback provided
          if (onServiceAreasFetched) {
            onServiceAreasFetched(areas);
          }
        }
      } catch (err) {
        console.error('Error fetching service areas:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServiceAreas();
  }, []);

  // No longer using custom search; handled by Place Picker plugin




  const handlePincodeChange = async (value) => {
    onChange('pincode', value);

    // Auto-fill area and city based on selected pincode
    const match = serviceAreas.find(sa => sa.pincode === value);
    if (match) {
      onChange('area', match.areaName);

      if (!formData.city) {
        onChange('city', 'Coimbatore');
      }

      // Automatically move map to this pincode if no coordinates are set
      if (!formData.latitude || !formData.longitude) {
        try {
          const response = await fetch(`/shop/api/geocode?q=${value}, Coimbatore`);
          const data = await response.json();
          if (data && data.length > 0) {
            const newLat = parseFloat(data[0].lat);
            const newLon = parseFloat(data[0].lon);
            if (newLat && newLon && newLat !== 0 && newLon !== 0) {
              onChange('latitude', newLat);
              onChange('longitude', newLon);
            }
            setDetectedAddress(data[0].display_name);
          }
        } catch (err) {
          console.error('Pincode geocoding error:', err);
        }
      }
    }
  };

  const fetchCoordinatePincode = async (lat, lng) => {
    try {
      const response = await fetch(`/shop/api/geocode?lat=${lat}&lon=${lng}`);
      const data = await response.json();

      if (data && data.address) {
        if (data.display_name) {
          setDetectedAddress(data.display_name);
        }
        const addr = data.address;
        const pincodeVal = addr.postcode || '';

        if (pincodeVal) {
          onChange('coordinatePincode', pincodeVal);
        } else {
          onChange('coordinatePincode', '');
        }
      } else {
        setDetectedAddress('');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nickname">
          Address Nickname (e.g. Home, Office) <span className="text-muted-foreground">(Optional)</span>
        </Label>
        <Input
          id="nickname"
          placeholder="Home / Office / Other"
          value={formData.nickname || ''}
          onChange={(e) => onChange('nickname', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contactName">
            Contact Person <span className="text-muted-foreground">(Optional)</span>
          </Label>
          <Input
            id="contactName"
            placeholder="Recipient Name"
            value={formData.contactName || ''}
            onChange={(e) => onChange('contactName', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">
            Contact Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contactPhone"
            placeholder="10-digit Phone Number"
            value={formData.contactPhone || ''}
            onChange={(e) => {
              let val = e.target.value.replace(/\D/g, '');
              if (val.startsWith('0')) {
                val = val.replace(/^0+/, '');
              }
              val = val.slice(0, 10);
              onChange('contactPhone', val);
            }}
            className={errors.contactPhone ? 'border-destructive' : ''}
          />
          {errors.contactPhone && (
            <p className="text-sm text-destructive">{errors.contactPhone}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="addressLine1">
          Address Line 1 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="addressLine1"
          placeholder="House/Flat number, Building name"
          value={formData.addressLine1 || ''}
          onChange={(e) => onChange('addressLine1', e.target.value)}
          className={errors.addressLine1 ? 'border-destructive' : ''}
        />
        {errors.addressLine1 && (
          <p className="text-sm text-destructive">{errors.addressLine1}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
        <Input
          id="addressLine2"
          placeholder="Street, Road name"
          value={formData.addressLine2 || ''}
          onChange={(e) => onChange('addressLine2', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            id="city"
            placeholder="City"
            value={formData.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            className={errors.city ? 'border-destructive' : ''}
          />
          {errors.city && (
            <p className="text-sm text-destructive">{errors.city}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="landmark">Landmark (Optional)</Label>
          <Input
            id="landmark"
            placeholder="Nearby landmark"
            value={formData.landmark || ''}
            onChange={(e) => onChange('landmark', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pincode">
            Pincode <span className="text-destructive">*</span>
          </Label>
          <SearchableSelect
            options={serviceAreas.map(area => ({
              value: area.pincode,
              label: `${area.pincode} - ${area.areaName}`
            }))}
            value={formData.pincode || ''}
            onValueChange={handlePincodeChange}
            placeholder={isLoading ? "Loading..." : "Search Pincode"}
            error={!!errors.pincode}
            isLoading={isLoading}
            side="top"
          />
          {errors.pincode && (
            <p className="text-sm text-destructive">{errors.pincode}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="area">
            Area/Zone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="area"
            placeholder="Area or Zone"
            value={formData.area || ''}
            onChange={(e) => onChange('area', e.target.value)}
            className={errors.area ? 'border-destructive' : ''}
            disabled={!!formData.pincode} // Disable if pincode is selected to prevent manual mismatch
          />
          {errors.area && (
            <p className="text-sm text-destructive">{errors.area}</p>
          )}
        </div>
      </div>

      <div id="map-section" className="space-y-4 pt-4 border-t border-border/40">
        <Label className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Pin Exact Location <span className="text-destructive">*</span>
        </Label>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="mappls-search-input"
            placeholder="Search for your building, street or area..."
            className="pl-9 pr-10"
          />
        </div>

        {(detectedAddress || (formData.addressLine1 && formData.city)) && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase font-black text-primary tracking-widest">Detected Address</p>
              <p className="text-sm font-semibold text-muted-foreground leading-snug">
                {detectedAddress || `${formData.addressLine1}${formData.addressLine2 ? ', ' + formData.addressLine2 : ''}, ${formData.area ? formData.area + ', ' : ''}${formData.city}${formData.pincode ? ' - ' + formData.pincode : ''}`}
              </p>
            </div>
          </div>
        )}

        <MapPicker
          value={formData.latitude && formData.longitude ? { lat: formData.latitude, lng: formData.longitude } : null}
          onChange={(lat, lng, fullData) => {
            console.log('Map Pin Lat/Lng/Data:', { lat, lng, fullData });
            onChange('latitude', lat);
            onChange('longitude', lng);
            
            if (fullData) {
               // Handled Place Picker suggestion data
               const addr = fullData;
               const house = addr.houseNumber || addr.houseName || '';
               const poi = addr.poi || '';
               const street = addr.street || '';
               const suburb = addr.subLocality || addr.locality || '';
               const cityVal = addr.city || addr.district || '';
               const pincodeVal = addr.pincode || '';
               
               let line1 = [house, poi, street].filter(Boolean).join(', ');
               if (!line1 && suburb) line1 = suburb;
               
               if (line1 && !formData.addressLine1) onChange('addressLine1', line1);
               
               const detected = addr.formattedAddress || addr.placeAddress || addr.placeName || line1;
               if (detected) {
                 setDetectedAddress(detected);
               }
               
               if (pincodeVal) {
                 onChange('coordinatePincode', pincodeVal);
               }
            } else {
               // Normal drag event without placePicker
               fetchCoordinatePincode(lat, lng);
            }
          }}
        />
        {errors.latitude && <p className="text-xs text-destructive">Please pin your location on the map</p>}
      </div>

      {/* {showDefaultToggle && !formData.isDefault && (
        <div
          className="flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-muted/30 hover:border-primary/20 transition-all cursor-pointer"
          onClick={() => onChange('isDefault', true)}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-foreground transition-colors">Set as Default Address</p>
              <p className="text-xs text-muted-foreground">Deliver here by default for future orders</p>
            </div>
          </div>
          <div className="h-6 w-11 rounded-full relative bg-muted-foreground/30 transition-colors duration-200">
            <div className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      )} */}
    </div>
  );
}
