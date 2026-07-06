import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  rounded?: string
}

function Input({ className, type, rounded = "4px", style, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      style={{ borderRadius: rounded, ...style }}
      className={cn(
        "h-8 w-full min-w-0 border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[#c0c4cc] placeholder:font-normal focus-visible:border-[#3370ff] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
