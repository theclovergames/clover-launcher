import { ChevronRight } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const CONTENT = "mc-frame z-50 min-w-52 overflow-hidden bg-card p-1 text-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";
const ITEM =
  "flex cursor-default items-center gap-2.5 rounded px-2.5 py-2 text-[13px] font-semibold outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";
const HIGHLIGHT = "data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-primary";

/** Menu ouvert par un bouton, même allure que le clic droit (`context-menu`). */
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn(CONTENT, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, destructive = false, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return <DropdownMenuPrimitive.Item className={cn(ITEM, destructive ? "text-error data-[highlighted]:bg-destructive/15" : HIGHLIGHT, className)} {...props} />;
}

/** Entrée qui ouvre un sous-menu, au survol ou à la flèche droite. */
export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger className={cn(ITEM, HIGHLIGHT, "data-[state=open]:bg-primary/15", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent sideOffset={sideOffset} className={cn(CONTENT, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("mx-1 my-1 h-px bg-border", className)} {...props} />;
}
