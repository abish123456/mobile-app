
import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '../ui/button';
import { Locate, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Fix for Leaflet default icon issues in Next.js
const fixLeafletIcons = () => {
    if (typeof window === 'undefined') return;
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
};

function LocationMarker({ position, onPositionChange }) {
    const markerRef = useRef(null);

    const map = useMapEvents({
        click(e) {
            onPositionChange(e.latlng);
            map.flyTo(e.latlng, map.getZoom());
        },
    });

    const eventHandlers = useMemo(
        () => ({
            dragend() {
                const marker = markerRef.current;
                if (marker != null) {
                    onPositionChange(marker.getLatLng());
                }
            },
        }),
        [onPositionChange],
    );

    return position === null ? null : (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={position}
            ref={markerRef}
        />
    );
}

// Component to recenter map when position changes programmatically
function Recenter({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, map.getZoom());
        }
    }, [position, map]);
    return null;
}

export default function MapPicker({ value, onChange }) {
    const [position, setPosition] = useState(value || { lat: 11.0168, lng: 76.9558 });
    const [isLocating, setIsLocating] = useState(false);

    useEffect(() => {
        fixLeafletIcons();
    }, []);

    // Important: Internal update that also notifies parent
    const handlePositionChange = (newPos) => {
        setPosition(newPos);
        if (onChange) {
            onChange(newPos.lat, newPos.lng);
        }
    };

    // Sync internal state if value prop changes from outside (e.g. city change or external reset)
    useEffect(() => {
        if (value && (value.lat !== position.lat || value.lng !== position.lng)) {
            setPosition(value);
        }
    }, [value]);

    const handleCurrentLocation = (e) => {
        e.preventDefault(); // Prevent form submission if inside a form
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const newPos = { lat: latitude, lng: longitude };
                handlePositionChange(newPos);
                setIsLocating(false);
                toast.success('Location updated');
            },
            (error) => {
                console.error('Geolocation error:', {
                    code: error.code,
                    message: error.message
                });
                let msg = 'Unable to retrieve your location';
                if (error.code === 1) msg = 'Location permission denied';
                else if (error.code === 2) msg = 'Location unavailable';
                else if (error.code === 3) msg = 'Location request timed out';
                toast.error(msg);
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    return (
        <div className="space-y-2">
            <div className="h-[300px] w-full rounded-lg overflow-hidden border border-border/60 shadow-sm relative z-0">
                <MapContainer
                    center={position}
                    zoom={13}
                    scrollWheelZoom={false}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationMarker position={position} onPositionChange={handlePositionChange} />
                    <Recenter position={position} />
                </MapContainer>

                {/* Current Location Button Overlay */}
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 z-[400] h-9 gap-2 shadow-md bg-background/90 backdrop-blur-sm hover:bg-background border transform transition-transform active:scale-95"
                    onClick={handleCurrentLocation}
                    disabled={isLocating}
                >
                    {isLocating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                        <Locate className="h-4 w-4 text-primary" />
                    )}
                    <span className="text-[11px] font-medium whitespace-nowrap">Use My Location</span>
                </Button>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
                * Click on the map or drag the pin to set your exact location.
            </p>
        </div>
    );
}
