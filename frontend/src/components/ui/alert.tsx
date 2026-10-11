import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="alert" className={cn("relative w-full rounded-lg border border-border bg-card p-4 text-sm text-card-foreground [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4", className)} {...props} />;
}
