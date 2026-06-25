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

const createNumberedIcon = (label, isMulti = false) => {
    return L.divIcon({
        className: 'custom-numbered-circle',
        html: `<div style="
            background-color: #3b82f6; 
            color: white; 
            border-radius: ${isMulti ? '12px' : '50%'}; 
            width: ${isMulti ? 'auto' : '28px'}; 
            padding: ${isMulti ? '0 8px' : '0'};
            height: 28px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-weight: 600; 
            font-size: ${isMulti ? '11px' : '13px'}; 
            white-space: nowrap;
            border: 2px solid white; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">
            ${label}
        </div>`,
        iconSize: isMulti ? null : [28, 28],
        iconAnchor: isMulti ? [20, 14] : [14, 14],
        popupAnchor: [0, -14]
    });
};

export default function RouteMap({ hubLocation, orders = [] }) {
    useEffect(() => {
        fixLeafletIcons();
    }, []);

    // Filter valid order coordinates
    const validOrders = orders.filter(o => o.address?.latitude && o.address?.longitude);
    
    // Group orders by exact coordinates
    const groupedOrders = {};
    validOrders.forEach((o, index) => {
        const key = `${o.address.latitude},${o.address.longitude}`;
        if (!groupedOrders[key]) {
            groupedOrders[key] = {
                lat: o.address.latitude,
                lng: o.address.longitude,
                orders: []
            };
        }
        groupedOrders[key].orders.push({ ...o, seqNum: index + 1 });
    });
    const groupedOrderList = Object.values(groupedOrders);
    
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
                {groupedOrderList.map((group, groupIndex) => {
                    const isMulti = group.orders.length > 1;
                    const displayLabel = isMulti ? `${group.orders.length} ords` : group.orders[0].seqNum;
                    
                    return (
                        <Marker 
                            key={`group-${groupIndex}`} 
                            position={[group.lat, group.lng]}
                            icon={createNumberedIcon(displayLabel, isMulti)}
                        >
                            <Popup>
                                <div className="flex flex-col gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar-light">
                                    {group.orders.map((order) => (
                                        <div key={order.id} className="flex flex-col border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                            <div className="flex items-center gap-3 justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                                        #{order.seqNum}
                                                    </span>
                                                    <span className="font-bold text-slate-800 text-sm">
                                                        {order.orderNumber || order.id}
                                                    </span>
                                                </div>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 uppercase ${
                                                    order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 
                                                    order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {order.status || 'PENDING'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
