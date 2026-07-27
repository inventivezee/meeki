export function MeekiLogo({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <img
      src="/logo.svg"
      alt="Meeki"
      className={className}
      data-compact={compact ? "true" : undefined}
    />
  );
}
