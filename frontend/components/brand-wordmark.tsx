type BrandWordmarkProps = {
  compact?: boolean;
};

export function BrandWordmark({ compact = false }: BrandWordmarkProps) {
  return (
    <span className="inline-flex select-none items-center gap-2" aria-label="Credix">
      {/* Icon mark */}
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F7EF7] shadow-[0_2px_8px_rgba(79,126,247,0.4)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="white" fillOpacity="0.9"/>
        </svg>
      </span>
      {/* Wordmark */}
      <span className={`${compact ? "text-[1.25rem]" : "text-[1.45rem]"} font-bold tracking-tight leading-none`}>
        <span className="text-slate-800">Cred</span>
        <span className="text-[#4F7EF7]">ix</span>
      </span>
    </span>
  );
}
