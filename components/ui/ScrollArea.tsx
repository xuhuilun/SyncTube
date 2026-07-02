import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const ScrollArea = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function ScrollArea({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("overflow-y-auto", className)}
      {...props}
    />
  );
});
