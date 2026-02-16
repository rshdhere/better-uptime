"use client";

import { ChevronDown, FolderPlus, Import, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";
import { cx } from "@/lib/utils";

interface CreateMonitorDropdownProps {
  onCreateClick: () => void;
}

export function CreateMonitorDropdown({
  onCreateClick,
}: CreateMonitorDropdownProps) {
  return (
    <div
      className={cx(
        "inline-flex rounded-xl overflow-hidden",
        "shadow-sm hover:shadow-md transition-shadow duration-200",
        "ring-1 ring-primary-action/20 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
      )}
      role="group"
    >
      <Button
        variant="primary"
        className={cx(
          "rounded-r-none border-0 border-r border-primary-action-foreground/20",
          "rounded-l-xl shadow-none",
          "hover:bg-primary-action/90 active:bg-primary-action/95",
        )}
        onClick={onCreateClick}
      >
        <Plus className="mr-2 size-4 shrink-0" aria-hidden />
        <span>Create monitor</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            className={cx(
              "rounded-l-none rounded-r-xl border-0 pl-2 pr-2.5 shadow-none",
              "hover:bg-primary-action/90 active:bg-primary-action/95",
              "focus-visible:ring-2 focus-visible:ring-primary-action-foreground/30",
            )}
            aria-label="More create options"
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" sideOffset={6}>
          <DropdownMenuItem>
            <FolderPlus className="mr-2 size-4" />
            New group
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Import className="mr-2 size-4" />
            Import monitors
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
