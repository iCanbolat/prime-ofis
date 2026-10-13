import type { VariantProps } from "class-variance-authority"
import { Link, type LinkProps } from "react-router"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Buton görünümlü gezinme linki. Base UI `Button`'a `render={<Link/>}` verildiğinde öğe
 * `role="button"` alır; gezinme için ekran okuyuculara link olarak duyurulması gerekir.
 */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: LinkProps & VariantProps<typeof buttonVariants>) {
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
