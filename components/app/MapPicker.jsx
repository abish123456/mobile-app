
import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Locate, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MapPicker({ value, onChange }) {
    const [position, setPosition] = useState(value || { lat: 11.0168, lng: 76.9558 });
    const [isLocating, setIsLocating] = useState(false);
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);
    
    const mapContainerId = useRef(`mappls-map-${Math.random().toString(36).substr(2, 9)}`);
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const scriptLoadedRef = useRef(false);

    // Sync internal state if value prop changes from outside
    useEffect(() => {
        if (value && (value.lat !== position.lat || value.lng !== position.lng)) {
            setPosition(value);
            if (markerInstance.current) {
                markerInstance.current.setPosition({ lat: value.lat, lng: value.lng });
            }
            if (mapInstance.current) {
                if (mapInstance.current.flyTo) {
                    mapInstance.current.flyTo({ center: [value.lng, value.lat], zoom: 15 });
                } else if (mapInstance.current.setCenter) {
                    mapInstance.current.setCenter([value.lng, value.lat]);
                }
            }
        }
    }, [value]);

    const handlePositionChange = (newPos) => {
        setPosition(newPos);
        if (onChange) {
            onChange(newPos.lat, newPos.lng, newPos.fullData);
        }
    };

    const initMap = () => {
        if (!window.mappls || mapInstance.current) return;

        const container = document.getElementById(mapContainerId.current);
        if (!container) {
            console.warn("Map container element not found in DOM yet, retrying...");
            setTimeout(initMap, 100);
            return;
        }

        try {
            console.log("Initializing Mappls Map on element:", mapContainerId.current);
            
            // Mappls v3 vector maps often use [lng, lat] like Mapbox
            const mapOptions = {
                center: [position.lat, position.lng],
                zoom: 13,
                zoomControl: true
            };

            mapInstance.current = new window.mappls.Map(container, mapOptions);
            const map = mapInstance.current;

            // Handle events safely
            const on = (target, event, cb) => {
                if (target.on) target.on(event, cb);
                else if (target.addListener) target.addListener(event, cb);
            };

            on(map, 'load', () => {
                console.log("Map Loaded");
                
                // We use basic marker since search plugin handles the search box external to map
                markerInstance.current = new window.mappls.Marker({
                    map: map,
                    position: { lat: position.lat, lng: position.lng },
                    draggable: true,
                });

                const marker = markerInstance.current;
                const onEvent = (marker.on) ? 'on' : 'addListener';
                marker[onEvent]('dragend', () => {
                    const newPos = marker.getPosition();
                    handlePositionChange({ lat: newPos.lat, lng: newPos.lng });
                });

                on(map, 'click', (e) => {
                    let coords;
                    if (e.lngLat && typeof e.lngLat.lat === 'number') coords = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                    else if (Array.isArray(e.lngLat)) coords = { lat: e.lngLat[1], lng: e.lngLat[0] };
                    else if (e.latLng) coords = { lat: e.latLng.lat, lng: e.latLng.lng };

                    if (coords) {
                        handlePositionChange(coords);
                        marker.setPosition(coords);
                        if (map.flyTo) map.flyTo({ center: [coords.lng, coords.lat] });
                    }
                });

                // Initialize Search Plugin on external input if available
                const searchInput = document.getElementById("mappls-search-input");
                if (window.mappls.search && searchInput) {
                    new window.mappls.search(searchInput, { map: map }, function(data) {
                        console.log("Search Plugin selected data:", data);
                        if (data && data.length > 0) {
                            const result = data[0];
                            const coords = { lat: result.latitude || result.lat, lng: result.longitude || result.lon };
                            if (coords.lat && coords.lng) {
                                handlePositionChange({ lat: coords.lat, lng: coords.lng, fullData: result });
                                marker.setPosition(coords);
                                if (map.flyTo) map.flyTo({ center: [coords.lng, coords.lat], zoom: 15 });
                            } else if (result.eLoc) {
                                console.log("Missing coords, using pinMarker fallback for eLoc:", result.eLoc);
                                if (window.mappls.pinMarker) {
                                    const tempMarker = new window.mappls.pinMarker({
                                        map: map,
                                        pin: result.eLoc,
                                        fitbounds: true
                                    });
                                    // Wait for map to fly to eLoc bounds
                                    setTimeout(() => {
                                        const newCenter = map.getCenter();
                                        const newCoords = { lat: newCenter.lat, lng: newCenter.lng };
                                        handlePositionChange({ lat: newCoords.lat, lng: newCoords.lng, fullData: result });
                                        marker.setPosition(newCoords);
                                        // Remove the temporary pin marker
                                        try {
                                            window.mappls.remove({map: map, layer: tempMarker});
                                        } catch(e) {}
                                    }, 1500);
                                }
                            }
                        }
                    });
                }
            });

        } catch (error) {
            console.error("Mappls Init Error:", error);
        }
    };

    useEffect(() => {
        if (scriptLoadedRef.current) return;
        scriptLoadedRef.current = true;
        
        const loadMapplsSdk = async () => {
            const sdkKey = process.env.NEXT_PUBLIC_MAPPLS_JS_KEY || '28d4a2155029222ef3928cbd14c886e6';
            if (!sdkKey) return;

            if (window.mappls && window.mappls.placePicker) {
                setIsSdkLoaded(true);
                setTimeout(initMap, 100);
                return;
            }

            try {
                const { mappls } = await import('mappls-web-maps');
                const mapplsClassObject = new mappls();

                // mappls-web-maps takes care of loading both the core SDK and the plugins
                // based on the options passed.
                mapplsClassObject.initialize(sdkKey, { map: true, plugins: ['search', 'pinMarker'] }, () => {
                    setIsSdkLoaded(true);
                    setTimeout(initMap, 100);
                });
            } catch (err) {
                console.error("Failed to load mappls-web-maps:", err);
            }
        };

        loadMapplsSdk();

        return () => {
            // Cleanup logic if needed
        };
    }, []);

    const handleCurrentLocation = (e) => {
        e.preventDefault();
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
                
                if (markerInstance.current) {
                    markerInstance.current.setPosition(newPos);
                }
                if (mapInstance.current) {
                    if (mapInstance.current.flyTo) {
                        mapInstance.current.flyTo({ center: [longitude, latitude], zoom: 15 });
                    } else if (mapInstance.current.setCenter) {
                        mapInstance.current.setCenter([longitude, latitude]);
                    }
                }
                
                setIsLocating(false);
                toast.success('Location updated');
            },
            (error) => {
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
            <div className="h-[300px] w-full rounded-lg overflow-hidden border border-border/60 shadow-sm relative z-0 bg-muted/20">
                {!isSdkLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading Mappls...</span>
                    </div>
                )}
                
                <div id={mapContainerId.current} ref={mapRef} className="h-full w-full" />

                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 z-[400] h-9 gap-2 shadow-md bg-background/90 backdrop-blur-sm hover:bg-background border transform transition-transform active:scale-95"
                    onClick={handleCurrentLocation}
                    disabled={isLocating || !isSdkLoaded}
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
