import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Loader2 } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId?: string;
  revieweeId?: string;
  revieweeName?: string;
}

export function ReviewDialog({ isOpen, onClose, bookingId, revieweeId, revieweeName }: ReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const submitReviewMutation = useMutation({
    mutationFn: async (data: { bookingId: string; rating: number; comment: string }) => {
      const res = await apiRequest("POST", "/api/reviews", data);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Review Submitted",
        description: "Thank you for your feedback!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/client"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/escort"] });
      if (revieweeId) {
        queryClient.invalidateQueries({ queryKey: [`/api/reviews/escort/${revieweeId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/escorts/${revieweeId}`] });
      }
      onClose();
      // Reset state
      setRating(0);
      setComment("");
    },
    onError: (error: Error) => {
      toast({
        title: "Review Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!bookingId) return;

    if (rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a star rating.",
        variant: "destructive",
      });
      return;
    }

    submitReviewMutation.mutate({
      bookingId,
      rating,
      comment,
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-[#121212] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Rate your experience</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            How was your session with {revieweeName}? Your review helps build trust in the community.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="flex flex-col items-center justify-center gap-2">
            <Label className="text-white text-sm font-medium">Star Rating</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none transition-transform active:scale-95"
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                >
                  <Star 
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating) 
                        ? "text-yellow-500 fill-current shadow-[0_0_15px_rgba(234,179,8,0.3)]" 
                        : "text-white/10"
                    } transition-colors duration-200`}
                  />
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {rating === 5 ? "Excellent!" : rating === 4 ? "Very Good" : rating === 3 ? "Good" : rating === 2 ? "Fair" : rating === 1 ? "Poor" : "Select a rating"}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment" className="text-white">Comment (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="Tell us more about your experience..."
              className="bg-white/5 border-white/10 text-white min-h-[100px] focus:ring-primary"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="border-white/10 hover:bg-white/5 text-muted-foreground"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            className="bg-white text-black hover:bg-white/90 font-bold px-8"
            disabled={submitReviewMutation.isPending}
          >
            {submitReviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
