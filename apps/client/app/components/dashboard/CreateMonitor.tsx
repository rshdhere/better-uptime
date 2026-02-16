"use client";

import { type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { cx } from "@/lib/utils";

const backdropTransition = { duration: 0.2, ease: "easeInOut" as const };
const modalTransition = { duration: 0.2, ease: "easeOut" as const };

export interface CreateMonitorProps {
  open: boolean;
  onClose: () => void;
  url: string;
  onUrlChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isSubmitting?: boolean;
}

export function CreateMonitor({
  open,
  onClose,
  url,
  onUrlChange,
  name,
  onNameChange,
  onSubmit,
  isSubmitting = false,
}: CreateMonitorProps) {
  const content = (
    <AnimatePresence>
      {open && (
        <>
          {/* Full-screen backdrop — above sidebar, banners, and notifications */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            aria-hidden
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            className={cx(
              "fixed left-1/2 top-1/2 z-[101] w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4",
            )}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={modalTransition}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-monitor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl border border-border bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="create-monitor-title"
                    className="text-base font-semibold text-foreground"
                  >
                    New monitor
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    We’ll watch this URL and alert you if it goes down.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-10 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X className="size-6" />
                </Button>
              </div>

              <form onSubmit={onSubmit} className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-monitor-url" className="text-sm">
                    URL
                  </Label>
                  <Input
                    id="create-monitor-url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    required
                    autoFocus
                    className="h-10 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-monitor-name" className="text-sm">
                    Name (optional)
                  </Label>
                  <Input
                    id="create-monitor-name"
                    placeholder="My landing page"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    className="h-10 border-border"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={isSubmitting}>
                    Create monitor
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
