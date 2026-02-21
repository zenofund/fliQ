import Layout from "@/components/layout";
import { EscortCard } from "@/components/escort-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, SlidersHorizontal, Loader2, Check, X, ChevronDown } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Escort } from "@shared/schema";
import { AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { LayoutGrid, Layers } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, calculateDistance } from "@/lib/utils";

export default function LandingPage() {
  const { toast } = useToast();
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'verified' | 'available'>('all');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [swipeMode, setSwipeMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize swipeMode based on screen size
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setSwipeMode(true);
    }
    
    // Listen for resize to ensure mobile always has swipe mode
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSwipeMode(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-request geolocation on mount
  useEffect(() => {
    requestLocation();
  }, []);

  const { data: escorts, isLoading } = useQuery<Escort[]>({
    queryKey: coords ? ["/api/escorts", coords.lat, coords.lng] : ["/api/escorts"],
    queryFn: async ({ queryKey }) => {
      const [_url, lat, lng] = queryKey.length === 3 
        ? queryKey as [string, number, number]
        : [queryKey[0], undefined, undefined];
      
      const params = new URLSearchParams();
      if (lat !== undefined) params.append("lat", lat.toString());
      if (lng !== undefined) params.append("lng", lng.toString());

      const url = `/api/escorts?${params.toString()}`;
      console.log(`Fetching escorts from: ${url}. Coords state:`, coords);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch escorts");
      return res.json();
    }
  });

  const { data: locations, isLoading: isSearching } = useQuery({
    queryKey: ["mapbox-locations", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 3) return [];
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      if (!token) {
        console.warn("VITE_MAPBOX_ACCESS_TOKEN is not set");
        return [];
      }
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token}&country=ng&types=place,locality`);
      const data = await res.json();
      return data.features.map((f: any) => ({
        name: f.place_name,
        lat: f.center[1],
        lng: f.center[0]
      }));
    },
    enabled: searchQuery.length >= 3
  });

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      if (!sessionStorage.getItem('locationNoticeShown')) {
        toast({
          title: "Geolocation not supported",
          description: "Your browser doesn't support location services.",
          variant: "destructive"
        });
        sessionStorage.setItem('locationNoticeShown', 'true');
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocationPermission('granted');
        setUserLocation("Near you");
        toast({
          title: "Location Access Granted",
          description: "Finding companions near you.",
        });

        // Optionally update user location in DB if logged in
        fetch("/api/user/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: latitude, lng: longitude })
        }).catch(err => console.error("Failed to update user location:", err));
      },
      () => {
        setLocationPermission('denied');
        toast({
          title: "Location Access Denied",
          description: "Please enable location to find nearby companions.",
          variant: "destructive"
        });
      }
    );
  };

  // Enhance the escort data with visual props and apply filters
  const filteredEscorts = escorts?.filter(e => {
    if (filter === 'verified') return !!e.isVerified;
    if (filter === 'available') return !!e.availability && !(e as any).isBusy;
    return true;
  });

  const enhancedEscorts = useMemo(() => filteredEscorts?.map(e => {
    let distanceStr = "Distance unknown";
    if (coords && e.latitude && e.longitude) {
      const dist = calculateDistance(coords.lat, coords.lng, Number(e.latitude), Number(e.longitude));
      distanceStr = `${dist.toFixed(1)} km away`;
    } else {
      distanceStr = "Location unknown";
    }

    return {
      id: e.userId,
      name: e.displayName,
      distance: distanceStr,
      rate: Number(e.hourlyRate),
      tags: (e.services as string[]) || [],
      isVerified: !!e.isVerified,
      status: (e as any).isBusy ? "busy" as const : (e.availability ? "available" as const : "busy" as const),
      bio: e.bio,
      dateOfBirth: e.dateOfBirth || undefined,
      avatar: e.avatar,
      averageRating: e.averageRating,
      reviewCount: e.reviewCount,
      badges: (e.badges as string[]) || [],
    };
  }), [filteredEscorts, coords]);

  const handleSwipe = (direction: "left" | "right", escortId?: string) => {
    // Both directions now just move to the next profile
    toast({
      title: "Next Profile",
      description: "Showing next recommendation",
      duration: 1000,
    });
    
    // Move to next card
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
    }, 200);
  };

  return (
    <Layout compact={swipeMode}>
      {/* Hero Section - Hidden on Mobile */}
      <section className="hidden md:block relative mb-8 md:mb-16 text-center space-y-4 md:space-y-6 max-w-3xl mx-auto pt-4 md:pt-8">
        <div className="hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] md:text-xs font-medium text-muted-foreground backdrop-blur-sm mb-2 md:mb-4">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Live & Active Now
        </div>
        
        <h1 className="hidden md:block text-3xl md:text-6xl font-bold tracking-tighter text-white text-balance leading-[1.1]">
          Discreet. Secure. <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">On-Demand.</span>
        </h1>
        
        <p className="hidden md:block text-sm md:text-lg text-muted-foreground max-w-xl mx-auto text-balance leading-relaxed px-4">
          Connect with verified companions for events, dinners, and travel. 
          Your privacy is our absolute priority.
        </p>

        {/* Search Bar - Hidden on Mobile */}
        <div className="hidden md:flex flex-col md:flex-row gap-3 max-w-2xl mx-auto mt-2 md:mt-8 p-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl mx-4 md:mx-auto">
           {/* City Selector */}
           <div className="flex-1 min-w-[200px]">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-start text-muted-foreground hover:text-white hover:bg-white/5 h-11 px-3 gap-2"
                  >
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {userLocation || "Select city..."}
                    </span>
                    {userLocation && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setUserLocation(null);
                          setCoords(null);
                          setSearchQuery("");
                          toast({
                            title: "Search Reset",
                            description: "Location filter cleared.",
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setUserLocation(null);
                            setCoords(null);
                            setSearchQuery("");
                          }
                        }}
                        className="ml-auto p-1 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
                      >
                        <X className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100" />
                      </div>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 bg-[#121212] border-white/10">
                  <Command className="bg-transparent" shouldFilter={false}>
                    <CommandInput 
                      placeholder="Search city..." 
                      className="h-11" 
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      {isSearching && (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!isSearching && searchQuery.length >= 3 && locations?.length === 0 && (
                        <CommandEmpty>No city found.</CommandEmpty>
                      )}
                      {!isSearching && locations && locations.length > 0 && (
                        <CommandGroup>
                          {locations.map((loc: any) => (
                            <CommandItem
                              key={loc.name}
                              value={loc.name}
                              onSelect={() => {
                                setCoords({ lat: loc.lat, lng: loc.lng });
                                setUserLocation(loc.name);
                                setOpen(false);
                                toast({
                                  title: `Location: ${loc.name}`,
                                  description: `Finding companions in ${loc.name}.`,
                                });
                              }}
                              className="hover:bg-white/5 cursor-pointer py-3"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  userLocation === loc.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {loc.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
           </div>

           <Button size="default" className="bg-white text-black hover:bg-white/90 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] w-full md:w-auto h-11 px-8 border-none font-bold">
             <Search className="w-4 h-4 mr-2" />
             Search
           </Button>
        </div>
      </section>

      {/* Filter Bar - Hidden on Mobile */}
      <div className="hidden md:flex items-center justify-between mb-4 md:mb-8 overflow-x-auto pb-2 md:pb-0 no-scrollbar -mx-4 px-4 md:mx-0 pt-4 md:pt-0">
        <div className="flex gap-2 flex-nowrap whitespace-nowrap">
           <Button 
             variant={filter === 'all' ? "outline" : "ghost"} 
             size="sm" 
             onClick={() => setFilter('all')}
             className={cn(
               "rounded-full text-xs px-4 h-8 transition-all",
               filter === 'all' ? "bg-white/10 border-white/10 text-white" : "text-muted-foreground hover:bg-white/5"
             )}
           >
             All Profiles
           </Button>
           <Button 
             variant={filter === 'verified' ? "outline" : "ghost"} 
             size="sm" 
             onClick={() => setFilter('verified')}
             className={cn(
               "rounded-full text-xs px-4 h-8 transition-all",
               filter === 'verified' ? "bg-white/10 border-white/10 text-white" : "text-muted-foreground hover:bg-white/5"
             )}
           >
             Verified
           </Button>
           <Button 
             variant={filter === 'available' ? "outline" : "ghost"} 
             size="sm" 
             onClick={() => setFilter('available')}
             className={cn(
               "rounded-full text-xs px-4 h-8 transition-all",
               filter === 'available' ? "bg-white/10 border-white/10 text-white" : "text-muted-foreground hover:bg-white/5"
             )}
           >
             Available
           </Button>
        </div>

        <div className="flex items-center gap-4 ml-4">
          {/* Mode Toggle - Hidden on Mobile */}
          <div className="hidden md:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            <LayoutGrid className={cn("w-4 h-4", !swipeMode ? "text-white" : "text-muted-foreground")} />
            <Switch 
              checked={swipeMode} 
              onCheckedChange={(checked) => {
                setSwipeMode(checked);
                setCurrentIndex(0); // Reset when toggling
              }}
            />
            <Layers className={cn("w-4 h-4", swipeMode ? "text-white" : "text-muted-foreground")} />
            <span className="hidden xs:inline text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Swipe</span>
          </div>

          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white shrink-0 h-8">
            <SlidersHorizontal className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Filters</span>
          </Button>
        </div>
      </div>

      {/* Grid or Swipe Mode */}
      {isLoading ? (
        <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : swipeMode ? (
        <div className="flex flex-col items-center">
          {/* Mobile Location Pill */}
          <div className="md:hidden flex justify-center mb-4 px-4 z-30 relative w-full mt-2">
            <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
              <PopoverTrigger asChild>
                <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full shadow-lg cursor-pointer animate-in fade-in slide-in-from-top-4 duration-700">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-white/90">
                    {userLocation ? `Exploring ${userLocation}` : "Set Location"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-white/50" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 bg-[#121212] border-white/10">
                <Command className="bg-transparent" shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search city..." 
                    className="h-11" 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {isSearching && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!isSearching && searchQuery.length >= 3 && locations?.length === 0 && (
                      <CommandEmpty>No city found.</CommandEmpty>
                    )}
                    {!isSearching && locations && locations.length > 0 && (
                      <CommandGroup>
                        {locations.map((loc: any) => (
                          <CommandItem
                            key={loc.name}
                            value={loc.name}
                            onSelect={() => {
                              setCoords({ lat: loc.lat, lng: loc.lng });
                              setUserLocation(loc.name);
                              setMobileOpen(false);
                              toast({
                                title: `Location: ${loc.name}`,
                                description: `Finding companions in ${loc.name}.`,
                              });
                            }}
                            className="hover:bg-white/5 cursor-pointer py-3"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                userLocation === loc.name ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {loc.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

           <div className="relative w-[calc(100%+2rem)] -mx-4 h-[100dvh] md:w-full md:max-w-md md:mx-auto md:h-auto md:aspect-[4/6] mt-0 md:mt-4 mb-0">
             <AnimatePresence mode="popLayout">
             {enhancedEscorts && currentIndex < enhancedEscorts.length ? (
              enhancedEscorts.slice(currentIndex, currentIndex + 3).reverse().map((escort, index, array) => {
                const isTop = index === array.length - 1;
                return (
                  <EscortCard 
                    key={escort.id} 
                    {...escort} 
                    isSwipeable={true}
                    onSwipe={isTop ? (dir) => handleSwipe(dir, escort.id) : undefined}
                  />
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="p-6 rounded-full bg-white/5 border border-white/10">
                  <Layers className="w-12 h-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">No more profiles</h3>
                  <p className="text-muted-foreground">You've seen everyone in this area.</p>
                </div>
                <Button 
                  onClick={() => {
                    setCurrentIndex(0);
                    if (window.innerWidth >= 768) {
                      setSwipeMode(false);
                    }
                  }}
                  variant="outline"
                  className="rounded-xl"
                >
                  {window.innerWidth < 768 ? "Start Over" : "Back to Grid View"}
                </Button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
      ) : (
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {enhancedEscorts && enhancedEscorts.length > 0 ? (
              enhancedEscorts.map((escort) => (
                <EscortCard key={escort.id} {...escort} />
              ))
            ) : (
              <div className="col-span-full text-center py-20">
                <p className="text-muted-foreground">No companions found within your area. Try expanding your search or check back later.</p>
              </div>
            )}
        </div>
      )}
    </Layout>
  );
}
