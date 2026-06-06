import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function RouteMap({ orders = [], height = "h-[500px]", onRouteCalculated }) {
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);

    const mapContainerId = useRef(`mappls-route-map-${Math.random().toString(36).substr(2, 9)}`);
    const mapInstance = useRef(null);
    const markersRef = useRef([]);
    const directionPluginRef = useRef(null);
    const scriptLoadedRef = useRef(false);

    // Extract valid coordinates from orders
    const getValidLocations = () => {
        return orders
            .map(o => o.address || o) // Extract address if it's nested
            .filter(addr => addr && addr.latitude && addr.longitude)
            .map(addr => ({
                lat: parseFloat(addr.latitude),
                lng: parseFloat(addr.longitude)
            }));
    };

    const initMap = () => {
        if (!window.mappls || mapInstance.current) return;

        const container = document.getElementById(mapContainerId.current);
        if (!container) {
            setTimeout(initMap, 100);
            return;
        }

        try {
            const locations = getValidLocations();
            const initialCenter = locations.length > 0 ? [locations[0].lat, locations[0].lng] : [11.0168, 76.9558]; // Default Coimbatore

            const mapOptions = {
                center: initialCenter,
                zoom: 12,
                zoomControl: true,
                location: true,
            };

            mapInstance.current = new window.mappls.Map(mapContainerId.current, mapOptions);

            mapInstance.current.addListener('load', () => {
                drawRoute();
            });

        } catch (error) {
            console.error("Mappls Init Error:", error);
        }
    };

    const drawRoute = () => {
        if (!mapInstance.current || !window.mappls) return;

        // Clear existing markers
        markersRef.current.forEach(m => {
            if (m && typeof m.remove === 'function') m.remove();
        });
        markersRef.current = [];

        if (directionPluginRef.current && window.mappls.direction) {
            // Usually direction plugin instances can be removed, but if not we might have to clear the map manually
            try {
                if (typeof directionPluginRef.current.remove === 'function') {
                    directionPluginRef.current.remove();
                }
            } catch (e) { }
            directionPluginRef.current = null;
        }

        const validOrders = orders.filter(o => o.address && o.address.latitude && o.address.longitude);
        if (validOrders.length === 0) return;

        const geoJsonFeatures = [];
        const coordinates = [];

        // Group valid orders by exact coordinate to avoid overlapping markers
        const groupedLocations = {};
        validOrders.forEach((order, index) => {
            const lat = parseFloat(order.address.latitude);
            const lng = parseFloat(order.address.longitude);
            coordinates.push([lng, lat]); // Path should still visit each point sequentially

            const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            if (!groupedLocations[coordKey]) {
                groupedLocations[coordKey] = { lat, lng, items: [] };
            }
            groupedLocations[coordKey].items.push({ order, sequenceNumber: index + 1 });
        });

        Object.values(groupedLocations).forEach((group) => {
            const { lat, lng, items } = group;

            const sequenceNumbers = items.map(item => item.sequenceNumber).join(',');

            // Determine marker color based on route-specific status
            const allDelivered = items.every(item => {
                const status = item.order.deliveryStatus !== undefined ? item.order.deliveryStatus : item.order.status;
                return status === 'DELIVERED';
            });
            const someNotDelivered = items.some(item => {
                const status = item.order.deliveryStatus !== undefined ? item.order.deliveryStatus : item.order.status;
                return status === 'NOT_DELIVERED' || status === 'CANCELLED';
            });

            let bgColorClass = 'bg-blue-600';

            if (allDelivered) {
                bgColorClass = 'bg-green-600';
            } else if (someNotDelivered) {
                bgColorClass = 'bg-red-600';
            } else if (items.some(item => {
                const status = item.order.deliveryStatus !== undefined ? item.order.deliveryStatus : item.order.status;
                return status === 'DELIVERED';
            })) {
                bgColorClass = 'bg-yellow-500'; // Partial delivery
            }

            // Create custom HTML marker for numbered pins
            const markerText = items.length > 1 ? (items.length > 2 ? `${items.length} Ords` : sequenceNumbers) : sequenceNumbers;
            const textSizeClass = items.length > 1 ? 'text-[11px]' : 'text-sm';
            const widthClass = items.length > 1 ? 'w-10 h-10' : 'w-8 h-8';

            const markerHtml = `<div class="custom-water-marker ${widthClass} ${bgColorClass} text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white ${textSizeClass} leading-tight text-center px-0.5">${markerText}</div>`;

            // Build popup content for all orders at this location
            const popupContent = items.map(item => {
                const order = item.order;
                const activeStatus = order.deliveryStatus !== undefined ? order.deliveryStatus : order.status;
                const isDel = activeStatus === 'DELIVERED';
                const isNotDel = activeStatus === 'NOT_DELIVERED';
                const isCanc = order.status === 'CANCELLED';
                const displayStatus = isDel ? 'DELIVERED' : isNotDel ? 'NOT DELIVERED' : isCanc ? 'CANCELLED' : 'PENDING';

                let badgeClass = 'bg-yellow-100 text-yellow-700';
                if (isDel) badgeClass = 'bg-green-100 text-green-700';
                else if (isNotDel || isCanc) badgeClass = 'bg-red-100 text-red-700';

                return `<div class="flex items-center justify-between gap-4 border-b border-gray-100 pb-1.5 mb-1.5 last:border-0 last:pb-0 last:mb-0">
                    <div class="font-mono text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <span class="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[10px]">#${item.sequenceNumber}</span>
                        ${order.orderNumber || (order.id ? order.id.slice(-8).toUpperCase() : '')}
                    </div>
                    <div class="text-[9px] font-bold px-1.5 py-0.5 rounded text-center whitespace-nowrap ${badgeClass}">
                        ${displayStatus}
                    </div>
                </div>`;
            }).join('');

            // Add marker
            const marker = new window.mappls.Marker({
                map: mapInstance.current,
                position: { lat, lng },
                html: markerHtml,
                width: items.length > 1 ? 40 : 32,
                height: items.length > 1 ? 40 : 32,
                offset: [0, items.length > 1 ? -20 : -16],
                popupHtml: `<div class="p-2 min-w-[180px] flex flex-col gap-1">
                    ${items.length > 1 ? `<div class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">${items.length} Orders at this location</div>` : ''}
                    ${popupContent}
                </div>`
            });

            markersRef.current.push(marker);
        });

        // Draw Direction Route connecting the stops
        if (coordinates.length > 1 && window.mappls.direction) {
            try {
                let viaPoints = [];
                for (let i = 1; i < validOrders.length - 1; i++) {
                    viaPoints.push({
                        label: `Stop ${i + 1}`,
                        geoposition: `${validOrders[i].address.latitude},${validOrders[i].address.longitude}`
                    });
                }

                const dirOptions = {
                    map: mapInstance.current,
                    start: { label: 'Start', geoposition: `${validOrders[0].address.latitude},${validOrders[0].address.longitude}` },
                    end: { label: 'End', geoposition: `${validOrders[validOrders.length - 1].address.latitude},${validOrders[validOrders.length - 1].address.longitude}` },
                    profile: 'driving'
                };

                if (viaPoints.length > 0) {
                    dirOptions.via = viaPoints;
                }

                directionPluginRef.current = window.mappls.direction(dirOptions);

                // Hide direction panel if it appears
                setTimeout(() => {
                    const dirPanel = document.querySelector('.direction_panel');
                    if (dirPanel) {
                        dirPanel.style.display = 'none';
                    }

                    // Extract distance from the route summary before it is hidden (or if it remains hidden)
                    if (onRouteCalculated) {
                        const topControl = document.querySelector('.mapboxgl-ctrl-top-left');
                        if (topControl && topControl.innerText) {
                            const match = topControl.innerText.match(/(\d+(\.\d+)?\s*km)/i);
                            if (match) {
                                onRouteCalculated(match[1]);
                            }
                        }
                    }

                    // Hide any Mappls-injected markers (start, end, via) that aren't our custom numbered pins
                    const allMarkers = document.querySelectorAll('.mapboxgl-marker');
                    allMarkers.forEach(marker => {
                        if (!marker.querySelector('.custom-water-marker')) {
                            marker.style.display = 'none';
                        }
                    });
                }, 500);

            } catch (err) {
                console.error("Failed to draw direction:", err);
            }
        } else if (coordinates.length === 1) {
            mapInstance.current.setCenter(coordinates[0]);
            mapInstance.current.setZoom(14);
        }
    };

    // Redraw if orders change
    useEffect(() => {
        if (isSdkLoaded && mapInstance.current) {
            drawRoute();
        }
    }, [orders]);

    useEffect(() => {
        if (scriptLoadedRef.current) return;
        scriptLoadedRef.current = true;

        const loadMapplsSdk = async () => {
            const sdkKey = process.env.NEXT_PUBLIC_MAPPLS_JS_KEY || '28d4a2155029222ef3928cbd14c886e6';
            if (!sdkKey) return;

            if (window.mappls && window.mappls.direction) {
                setIsSdkLoaded(true);
                setTimeout(initMap, 100);
                return;
            }

            try {
                const { mappls } = await import('mappls-web-maps');
                const mapplsClassObject = new mappls();

                mapplsClassObject.initialize(sdkKey, { map: true, plugins: ['direction'] }, () => {
                    setIsSdkLoaded(true);
                    setTimeout(initMap, 100);
                });
            } catch (err) {
                console.error("Failed to load mappls-web-maps:", err);
            }
        };

        loadMapplsSdk();

        return () => {
            // Cleanup
        };
    }, []);

    return (
        <div className={`relative w-full ${height} rounded-lg overflow-hidden border shadow-sm`}>
            {!isSdkLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                    <span className="text-sm text-gray-500 font-medium">Loading Map...</span>
                </div>
            )}
            <div
                id={mapContainerId.current}
                className="w-full h-full"
            />
            <style jsx global>{`
                /* Hide Mappls Direction Plugin UI panels */
                .direction_panel,
                .mappls-direction-panel,
                .mappls-routing-container,
                .route-summary,
                .route-summary-container,
                /* Hide the specific top-left control box where the route summary appears */
                .mapboxgl-ctrl-top-left {
                    display: none !important;
                }
            `}</style>
        </div>
    );
}
