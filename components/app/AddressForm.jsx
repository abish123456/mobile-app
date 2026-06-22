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
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
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

  // Suggestions logic
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/shop/api/geocode?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSuggestion = (suggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    console.log('Selected Suggestion Lat/Lng:', { lat, lng });

    onChange('latitude', lat);
    onChange('longitude', lng);
    setSearchQuery('');
    setSuggestions([]);
    if (suggestion.display_name) {
      setDetectedAddress(suggestion.display_name);
    }

    // Fill form fields from suggestion address
    if (suggestion.address) {
      const addr = suggestion.address;
      const house = addr.house_number || '';
      const building = addr.building || '';
      const road = addr.road || '';
      const suburb = addr.suburb || addr.neighbourhood || '';
      const cityVal = addr.city || addr.town || addr.village || addr.county || '';
      const pincodeVal = addr.postcode || '';

      let line1 = [house, building, road].filter(Boolean).join(', ');
      if (!line1 && suburb) line1 = suburb;

      if (line1) onChange('addressLine1', line1);
      if (cityVal) onChange('city', cityVal);

      if (pincodeVal) {
        onChange('pincode', pincodeVal);
        onChange('coordinatePincode', pincodeVal);
        const match = serviceAreas.find(sa => sa.pincode === pincodeVal);
        if (match) {
          onChange('area', match.areaName);
        } else {
          onChange('area', '');
          toast('Location selected. Please check if Pincode is in our service area.', { icon: '📍' });
        }
      }
    }
  };

  const handlePincodeChange = (value) => {
    onChange('pincode', value);

    // Auto-fill area and city based on selected pincode
    const match = serviceAreas.find(sa => sa.pincode === value);
    if (match) {
      onChange('area', match.areaName);

      if (!formData.city) {
        onChange('city', 'Coimbatore');
      }
    }
  };

  const fetchCoordinatePincode = async (lat, lng) => {
    try {
      const response = await fetch(`/shop/api/geocode?lat=${lat}&lon=${lng}`);
      const data = await response.json();

      if (data && data.address) {
        if (data.display_name) {
          // Display-only update: reflect pinned location without mutating form inputs
          setDetectedAddress(data.display_name);
        }
        const addr = data.address;
        const pincodeVal = addr.postcode || '';

        if (pincodeVal) {
          onChange('coordinatePincode', pincodeVal);
        } else {
          // Keep address fields untouched; only clear coordinate-based pincode when unknown
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for your building, street or area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-[1001] max-h-[200px] overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-4 py-2 hover:bg-muted text-sm transition-colors border-b border-border last:border-0"
                  onClick={() => handleSelectSuggestion(s)}
                >
                  <p className="font-medium truncate">{s.display_name.split(',')[0]}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.display_name.split(',').slice(1).join(',').trim()}</p>
                </button>
              ))}
            </div>
          )}
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
          onChange={(lat, lng) => {
            console.log('Map Pin Lat/Lng:', { lat, lng });
            onChange('latitude', lat);
            onChange('longitude', lng);
            fetchCoordinatePincode(lat, lng);
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
