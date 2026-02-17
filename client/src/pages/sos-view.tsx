import { useEffect, useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, User, AlertTriangle, Clock, Shield } from "lucide-react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export default function SosView() {
  const { alertId } = useParams();
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const socketRef = useRef<any>(null);

  const { data: alert, isLoading, error } = useQuery<any>({
    queryKey: [`/api/sos/alert/${alertId}`],
    // We need a route to fetch a single alert by ID
    enabled: !!alertId,
  });

  useEffect(() => {
    if (!alertId) return;

    const socket = io(window.location.origin, {
      path: "/ws",
    });
    socketRef.current = socket;

    socket.emit("watch_sos", alertId);

    socket.on("sos_location_changed", (data: { latitude: number, longitude: number }) => {
      setCurrentLocation(data);
    });

    return () => {
      socket.emit("unwatch_sos", alertId);
      socket.disconnect();
    };
  }, [alertId]);

  useEffect(() => {
    if (alert && !currentLocation) {
      setCurrentLocation({
        latitude: Number(alert.latitude),
        longitude: Number(alert.longitude),
      });
    }
  }, [alert]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (error || !alert) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold">Alert Not Found</h1>
        <p className="text-zinc-400 text-center mt-2">
          This SOS alert may have been resolved or the link is invalid.
        </p>
      </div>
    );
  }

  const googleMapsUrl = currentLocation 
    ? `https://www.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}`
    : `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`;

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-20">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-black tracking-tighter italic">fliQ <span className="text-red-500">SOS</span></h1>
          </div>
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/50 animate-pulse">
            LIVE EMERGENCY
          </Badge>
        </div>

        <Card className="bg-zinc-900 border-red-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <User className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Emergency Contact: {alert.user?.firstName || "User"}</CardTitle>
                <CardDescription className="text-zinc-400">
                  Triggered at {format(new Date(alert.createdAt), "HH:mm:ss, MMM d")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-zinc-800 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Status</p>
                <p className="text-sm font-bold text-red-500">{alert.status}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-800 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Updates</p>
                <p className="text-sm font-bold text-green-500">Real-time Active</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                Current Location
              </p>
              <div className="aspect-video w-full rounded-xl bg-zinc-800 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                {/* Simplified Map Representation */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent" />
                <MapPin className="w-8 h-8 text-red-500 animate-bounce mb-2" />
                <p className="text-xs text-zinc-400 font-mono">
                  {currentLocation?.latitude.toFixed(6)}, {currentLocation?.longitude.toFixed(6)}
                </p>
                <Button 
                  className="mt-4 bg-white text-black hover:bg-zinc-200"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Open in Google Maps
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="text-sm text-zinc-400 mb-4">
                Stay on this page to receive live location updates. If you are close by, please provide assistance or contact local authorities.
              </p>
              <div className="flex gap-3">
                <Button className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white gap-2" asChild>
                  <a href={`tel:${alert.user?.phone}`}>
                    <Phone className="w-4 h-4" />
                    Call User
                  </a>
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2">
                  <Shield className="w-4 h-4" />
                  Alert Police
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
