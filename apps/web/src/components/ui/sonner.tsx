import { cn } from "cn";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * sonner 的 shadcn 接入（无 next-themes，样式直接用设计令牌，dark 由 .dark 类自动适配）。
 * 用法：任意处 `import { toast } from "sonner"` 后 toast.error("...") / toast.success("...")。
 */
function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      className={cn(
        "text-sm",
        "[&_[data-icon]]:text-foreground",
        "[&_[data-description]]:text-muted-foreground",
        className,
      )}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border group-[.toaster]:shadow-lg",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
