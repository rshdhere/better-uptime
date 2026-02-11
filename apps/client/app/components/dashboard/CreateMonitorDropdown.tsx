"use client";

import { ChevronDown, FolderPlus, Import, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

interface CreateMonitorDropdownProps {
  onCreateClick: () => void;
}

export function CreateMonitorDropdown({
  onCreateClick,
}: CreateMonitorDropdownProps) {
  return (
    <div className="flex items-center">
      <Button
        variant="primary"
        className="rounded-r-none bg-[var(--coral-accent)] hover:bg-[var(--coral-accent)]/90 text-white border-r border-white/20"
        onClick={onCreateClick}
      >
        <Plus className="mr-2 size-4" />
        Create monitor
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            className="rounded-l-none bg-[var(--coral-accent)] hover:bg-[var(--coral-accent)]/90 text-white px-2"
          >
            <ChevronDown className="size-4" />
            <span className="sr-only">More options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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
