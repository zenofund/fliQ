import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, Loader2, Shield, X, MapPin } from "lucide-react";
import { io } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SosButton() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const watchId = useRef<number | null>(null);
  const socketRef = useRef<any>(null);

  const { data: activeAlert, isLoading: isLoadingAlert } = useQuery<any>({
    queryKey: ["/api/sos/active"],
  });

  useEffect(() => {
    // Initialize socket connection
    const socket = io(window.location.origin, {
      path: "/ws",
    });
    socketRef.current = socket;

    if (user) {
      socket.emit("auth", { userId: user.id });
    }

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const triggerMutation = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      const res = await apiRequest("POST", "/api/sos/alert", coords);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setIsSharing(true);
      toast({
        title: "SOS Triggered!",
        description: "Your trusted contacts have been notified with your location.",
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "SOS Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/sos/resolve/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      stopSharing();
      toast({
        title: "SOS Resolved",
        description: "The emergency alert has been closed.",
      });
    },
  });

  const startSharing = () => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "Geolocation Error",
        description: "Your browser does not support location services.",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        triggerMutation.mutate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        toast({
          title: "Location Access Required",
          description: "Please enable location services to use SOS.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true }
    );
  };

  const stopSharing = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsSharing(false);
  };

  useEffect(() => {
    if (activeAlert) {
      setIsSharing(true);
      
      // Start watching position for updates if we have an active alert
      if (watchId.current === null && "geolocation" in navigator) {
        watchId.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (socketRef.current) {
              socketRef.current.emit("sos_location_update", {
                alertId: activeAlert.id,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            }
          },
          (err) => console.error("Watch error:", err),
          { enableHighAccuracy: true }
        );
      }
    } else {
      stopSharing();
    }

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [activeAlert]);

  if (isLoadingAlert) return null;

  if (activeAlert) {
    return (
      <div className="fixed bottom-24 right-4 z-50 animate-bounce">
        <Button
          onClick={() => resolveMutation.mutate(activeAlert.id)}
          disabled={resolveMutation.isPending}
          className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-[0_0_15px_rgba(220,38,38,0.5)] flex flex-col items-center justify-center border border-white/20 p-0"
        >
          {resolveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <X className="h-5 w-5 text-white" />
              <span className="text-[8px] font-bold text-white mt-0.5 uppercase">Stop</span>
            </>
          )}
        </Button>
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
          SOS Active
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50">
        <Button
          onClick={() => setIsConfirmOpen(true)}
          className="h-auto w-8 rounded-l-xl rounded-r-none bg-red-600 hover:bg-red-700 shadow-lg flex flex-col items-center justify-center py-3 gap-0.5 border-y border-l border-white/20 transition-all duration-300 hover:w-10 hover:pr-1 group"
        >
          <span className="text-[10px] font-black text-white leading-none">S</span>
          <span className="text-[10px] font-black text-white leading-none">O</span>
          <span className="text-[10px] font-black text-white leading-none">S</span>
        </Button>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-bold">Emergency SOS</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-center">
              Are you sure you want to trigger an SOS alert? This will immediately notify your trusted contacts with your live location.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-3">
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 flex-1">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={startSharing}
              className="bg-red-600 text-white hover:bg-red-700 flex-1 font-bold"
            >
              Trigger SOS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
