'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue with webpack/next.js
const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Component to handle map clicks
function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// Component to recenter map when coordinates change
function MapRecenter({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        if (lat && lng) {
            map.setView([lat, lng], map.getZoom() < 13 ? 15 : map.getZoom());
        }
    }, [lat, lng, map]);
    return null;
}

export default function LocationMap({ latitude, longitude, radiusMeters, onMapClick }) {
    // Default center: Coimbatore, India
    const defaultCenter = [11.0168, 76.9558];
    const center = latitude && longitude ? [latitude, longitude] : defaultCenter;

    return (
        <MapContainer
            center={center}
            zoom={latitude ? 15 : 12}
            minZoom={2}
            maxZoom={19}
            scrollWheelZoom={true}
            doubleClickZoom={true}
            style={{ height: '400px', width: '100%' }}
            className="z-0"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onMapClick={onMapClick} />
            {latitude && longitude && (
                <>
                    <MapRecenter lat={latitude} lng={longitude} />
                    <Marker position={[latitude, longitude]} />
                    <Circle
                        center={[latitude, longitude]}
                        radius={radiusMeters}
                        pathOptions={{
                            color: '#2563EB',
                            fillColor: '#3B82F6',
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5'
                        }}
                    />
                </>
            )}
        </MapContainer>
    );
}
