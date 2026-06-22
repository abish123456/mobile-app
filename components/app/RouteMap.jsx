import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const fixLeafletIcons = () => {
    if (typeof window === 'undefined') return;
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
};

const createNumberedIcon = (number) => {
    return L.divIcon({
        className: 'custom-numbered-circle',
        html: `<div style="
            background-color: #3b82f6; 
            color: white; 
            border-radius: 50%; 
            width: 28px; 
            height: 28px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-weight: 600; 
            font-size: 13px; 
            border: 2px solid white; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">
            ${number}
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    });
};

export default function RouteMap({ hubLocation, orders = [] }) {
    useEffect(() => {
        fixLeafletIcons();
    }, []);

    // Filter valid order coordinates
    const validOrders = orders.filter(o => o.address?.latitude && o.address?.longitude);
    
    // Create points array for polyline (if we want to connect them)
    const points = [];
    if (hubLocation?.lat && hubLocation?.lng) {
        points.push([hubLocation.lat, hubLocation.lng]);
    }
    
    validOrders.forEach(o => {
        points.push([o.address.latitude, o.address.longitude]);
    });

    // Default center if nothing exists
    const defaultCenter = [11.0168, 76.9558];
    const center = points.length > 0 ? points[0] : defaultCenter;

    return (
        <div className="h-full w-full rounded-md overflow-hidden border">
            <MapContainer
                center={center}
                zoom={12}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Connect points with a line removed as requested */}

                {/* Hub Marker */}
                {hubLocation?.lat && hubLocation?.lng && (
                    <Marker position={[hubLocation.lat, hubLocation.lng]}>
                        <Popup>
                            <strong>Hub Location</strong>
                        </Popup>
                    </Marker>
                )}

                {/* Order Markers */}
                {validOrders.map((order, index) => (
                    <Marker 
                        key={order.id} 
                        position={[order.address.latitude, order.address.longitude]}
                        icon={createNumberedIcon(index + 1)}
                    >
                        <Popup>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="bg-slate-100 text-slate-500 font-bold py-1 rounded-md text-xs">
                                        #{index + 1}
                                    </span>
                                    <span className="font-bold text-slate-800 text-sm">
                                        {order.orderNumber || order.id}
                                    </span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 uppercase ${
                                    order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 
                                    order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 
                                    'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {order.status || 'PENDING'}
                                </span>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
