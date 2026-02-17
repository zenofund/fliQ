import { motion, AnimatePresence } from "framer-motion";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PWAInstallPrompt() {
  const { isVisible, installPWA, dismissPrompt } = usePWAInstall();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0, x: "-50%" }}
          animate={{ y: 0, opacity: 1, x: "-50%" }}
          exit={{ y: 100, opacity: 0, x: "-50%" }}
          className="fixed bottom-8 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-xs"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full border border-white/10 bg-card/90 backdrop-blur-xl shadow-2xl">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
            
            <button
              onClick={installPWA}
              className="flex-grow text-left"
            >
              <p className="text-sm font-semibold text-foreground">Install fliQ App</p>
              <p className="text-[10px] text-muted-foreground leading-none">Fast, private & offline</p>
            </button>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-white/5"
                onClick={installPWA}
              >
                <Download className="h-3.5 w-3.5 text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-white/5"
                onClick={dismissPrompt}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
