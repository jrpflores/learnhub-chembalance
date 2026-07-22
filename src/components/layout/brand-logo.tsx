import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
  src?: string;
  loading?: "eager" | "lazy";
};

export function BrandLogo({
  size = 40,
  className,
  alt = "Platform Logo",
  src = "/branding/logo.png",
  loading = "lazy",
}: BrandLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("block shrink-0 object-contain", className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      loading={loading}
      decoding="async"
    />
  );
}
