import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";

interface EngagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  escortName: string;
  agreementText: string;
}

export function EngagementModal({ isOpen, onClose, escortName, agreementText }: EngagementModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-[#0A0A0B] border-white/10 text-white max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 pb-2 shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-white">Engagement Agreement</DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  Please review {escortName}'s terms before proceeding.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
          <div className="space-y-4 text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">
            {agreementText || "This escort has not provided specific terms. Standard platform safety rules and respect apply."}
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/5">
            <h4 className="text-white font-medium mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Standard Platform Rules
            </h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>• All payments must be processed via fliQ Escrow.</li>
              <li>• Harassment or abuse is strictly prohibited.</li>
              <li>• Real-time location tracking is active for safety.</li>
              <li>• Emergency SOS features are available during the booking.</li>
            </ul>
          </div>
        </div>

        <div className="p-4 bg-white/[0.02] border-t border-white/5 shrink-0">
          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold">
            FLIQ TRUST & SAFETY • 2026
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
