import { forwardRef } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ShieldCheck, User, Star, Award, ExternalLink } from "lucide-react";
import blurredProfile from "@/assets/generated_images/blurred_portrait_of_a_person_for_privacy.png";
import { Link } from "wouter";
import { motion, useMotionValue, useTransform } from "framer-motion";

import { differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";

interface EscortCardProps {
  id: string;
  name: string;
  distance: string;
  rate: number;
  tags: string[];
  isVerified?: boolean;
  status: "available" | "busy" | "offline";
  dateOfBirth?: Date | string;
  avatar?: string | null;
  averageRating?: string | number;
  reviewCount?: number;
  badges?: string[];
  onSwipe?: (direction: "left" | "right") => void;
  isSwipeable?: boolean;
  className?: string;
}

export const EscortCard = forwardRef<HTMLDivElement, EscortCardProps>(({ 
  id, 
  name, 
  distance, 
  rate, 
  tags, 
  isVerified, 
  status, 
  dateOfBirth, 
  avatar,
  averageRating = "0.0",
  reviewCount = 0,
  badges = [],
  onSwipe,
  isSwipeable = false,
  className
}, ref) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const scale = useTransform(x, [-200, 0, 200], [0.8, 1, 0.8]);

  const passOpacity = useTransform(x, [50, 150], [0, 1]);
  const viewProfileOpacity = useTransform(x, [-150, -50], [1, 0]);
  const passScale = useTransform(x, [50, 150], [0.8, 1.2]);
  const viewProfileScale = useTransform(x, [-150, -50], [1.2, 0.8]);

  const age = dateOfBirth ? differenceInYears(new Date(), new Date(dateOfBirth)) : 25;

  return (
    <motion.div
      ref={ref}
      style={isSwipeable ? { x, opacity, rotate, scale } : {}}
      drag={isSwipeable ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      whileDrag={isSwipeable ? { scale: 1.02, cursor: "grabbing" } : {}}
      onDragEnd={(_, info) => {
        if (!isSwipeable) return;
        const threshold = window.innerWidth * 0.3; // 30% of screen width
        if (info.offset.x > threshold) {
          onSwipe?.("right");
        } else if (info.offset.x < -threshold) {
          onSwipe?.("left");
        } else {
          x.set(0);
        }
      }}
      className={cn(isSwipeable ? "absolute inset-0 touch-none select-none" : "touch-none", className)}
    >
      <Card className={`overflow-hidden border-white/5 bg-[#0A0A0A] hover:bg-card/80 transition-all duration-300 group hover:border-white/10 shadow-xl hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-full ${isSwipeable ? 'shadow-none rounded-none border-0 flex flex-col' : 'rounded-[5px] shadow-2xl'}`}>
        <div className={`relative overflow-hidden bg-secondary/30 ${isSwipeable ? 'flex-1' : 'aspect-[4/5]'}`}>
          <img 
            src={avatar || blurredProfile} 
            alt="Profile (Blurred)" 
            className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700 blur-md group-hover:blur-[12px]" 
          />

          {isSwipeable && (
            <>
              <motion.div 
                style={{ opacity: viewProfileOpacity, scale: viewProfileScale }}
                className="absolute top-12 right-12 z-20 border-4 border-white rounded-[5px] px-6 py-3 rotate-12 bg-black/40 backdrop-blur-xl"
              >
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black text-white uppercase tracking-tighter">View</span>
                  <ExternalLink className="w-10 h-10 text-white mt-1" />
                </div>
              </motion.div>
              <motion.div 
                style={{ opacity: passOpacity, scale: passScale }}
                className="absolute top-12 left-12 z-20 border-4 border-red-500 rounded-[5px] px-6 py-3 -rotate-12 bg-black/40 backdrop-blur-xl"
              >
                <span className="text-4xl font-black text-red-500 uppercase tracking-tighter">Pass</span>
              </motion.div>
            </>
          )}
          
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
            <Badge 
              className={`
                backdrop-blur-xl border-white/10 px-3 py-1 text-[10px] md:text-xs font-bold uppercase tracking-wider
                ${status === 'available' ? 'bg-green-500/30 text-green-100' : 'bg-red-500/30 text-red-100'}
              `}
            >
              <div className={`w-2 h-2 rounded-full mr-2 ${status === 'available' ? 'bg-green-400 animate-pulse' : 'bg-red-400 animate-pulse'}`} />
              {status === 'available' ? 'Available' : 'Busy'}
            </Badge>

            {badges.map((badge) => (
              <Badge key={badge} variant="secondary" className="bg-amber-500/20 text-amber-200 border-amber-500/30 backdrop-blur-md">
                <Award className="w-3 h-3 mr-1" />
                {badge}
              </Badge>
            ))}
          </div>

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {isVerified && (
              <div className="bg-blue-500/20 backdrop-blur-md p-1.5 rounded-full border border-blue-500/30 text-blue-200">
                <ShieldCheck className="w-4 h-4" />
              </div>
            )}
            {reviewCount > 0 && (
              <div className="bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 text-amber-400 flex items-center text-xs font-bold">
                <Star className="w-3 h-3 mr-1 fill-amber-400" />
                {averageRating}
              </div>
            )}
          </div>
          
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90" />

          <div className="absolute bottom-0 left-0 right-0 p-5 space-y-3">
             <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">{name}</h3>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex items-center text-xs md:text-sm text-white/80 font-medium">
                      <MapPin className="w-3.5 h-3.5 mr-1.5 text-white/60" />
                      {distance}
                    </div>
                    <div className="flex items-center text-xs md:text-sm text-white/80 font-medium">
                      <User className="w-3.5 h-3.5 mr-1.5 text-white/60" />
                      {age} yrs
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] md:text-xs text-white/60 uppercase tracking-widest font-bold">Starting at</p>
                  <p className="text-xl md:text-2xl font-black text-white">₦{rate.toLocaleString()}</p>
                </div>
             </div>
          </div>
        </div>

        <CardContent className="p-4 pt-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-secondary text-secondary-foreground border border-white/5">
                {tag}
              </span>
            ))}
          </div>
        </CardContent>
        
        <CardFooter className="p-4 pt-0 pb-6">
          <Link href={`/profile/${id}`} className="w-full">
             <Button className="w-full bg-white text-black hover:bg-white/90 font-bold h-10 rounded-[25px]">View Profile</Button>
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
});

EscortCard.displayName = "EscortCard";
