import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, ShieldCheck, Lock } from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount: number;
  email: string;
  clientName?: string;
  bookingId?: string;
  escortName?: string;
}

export function PaymentModal({ isOpen, onClose, onSuccess, amount, email, clientName, bookingId, escortName }: PaymentModalProps) {
  const [step, setStep] = useState<"loading" | "form" | "processing" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("form");
    }
  }, [isOpen]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep("processing");
    
    try {
      // If we have a bookingId, we use the real Paystack flow
      if (bookingId) {
        const response = await fetch(`/api/bookings/${bookingId}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        const data = await response.json();
        if (data.authorization_url) {
          // Redirect to Paystack
          window.location.href = data.authorization_url;
          return;
        } else {
          throw new Error(data.message || "Failed to initialize payment");
        }
      }

      // Fallback/Mock for other types of payments if no bookingId
      setTimeout(() => {
        setStep("success");
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }, 2000);
    } catch (err: any) {
      console.error("Payment Error:", err);
      setStep("error");
      setError(err.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden bg-white text-black gap-0">
        <DialogTitle className="sr-only">Payment Gateway</DialogTitle>
        
        {/* Secure Gateway Header */}
        <div className="bg-[#FAFAFA] border-b px-6 py-4 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-4 h-4 rounded-full bg-green-500"></div>
             <span className="font-bold text-sm text-[#333]">Secure Gateway</span>
           </div>
           <div className="text-xs text-gray-500">{clientName || email}</div>
        </div>

        <div className="p-6 min-h-[300px] flex flex-col">
          
          {step === "loading" && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
               <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
               <p className="text-sm text-gray-500">Securing connection...</p>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handlePay} className="flex-1 flex flex-col space-y-4">
               <div className="text-center mb-4">
                  <p className="text-sm text-gray-500 mb-1">Total to pay {escortName ? `for ${escortName}` : ""}</p>
                  <h2 className="text-2xl font-bold text-[#333]">NGN {amount.toLocaleString()}</h2>
               </div>

               <div className="space-y-4">
                 <p className="text-sm text-gray-600 text-center">
                   You will be redirected to a secure payment page to complete your transaction.
                 </p>
               </div>

               <Button type="submit" className="w-full mt-6 bg-[#3BB75E] hover:bg-[#2E994D] text-white font-bold h-12 shadow-lg shadow-green-900/10">
                 Pay NGN {amount.toLocaleString()}
               </Button>
               
               <div className="mt-auto pt-4 flex items-center justify-center gap-2 text-[10px] text-gray-400">
                 <ShieldCheck className="w-3 h-3" /> Secured by our payment provider
               </div>
            </form>
          )}

          {step === "processing" && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
               <div className="relative">
                  <div className="w-12 h-12 border-4 border-gray-100 border-t-[#3BB75E] rounded-full animate-spin"></div>
               </div>
               <p className="text-sm font-medium text-[#333]">Redirecting to secure gateway...</p>
               <p className="text-xs text-gray-500">Do not close this window</p>
            </div>
          )}

          {step === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
               <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
               </div>
               <h3 className="text-xl font-bold text-[#333]">Payment Failed</h3>
               <p className="text-sm text-gray-500 text-center">{error || "An unknown error occurred"}</p>
               <Button onClick={() => setStep("form")} variant="outline" className="mt-4">Try Again</Button>
            </div>
          )}

          {step === "success" && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-300">
               <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-[#3BB75E]" />
               </div>
               <h3 className="text-xl font-bold text-[#333]">Payment Successful</h3>
               <p className="text-sm text-gray-500">Redirecting you back...</p>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
