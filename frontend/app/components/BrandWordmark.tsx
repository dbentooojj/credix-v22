export function BrandWordmark({ size = "header" }: { size?: "header" | "login" }) {
  const isLogin = size === "login";
  const wrapperClasses = isLogin
    ? "inline-flex select-none flex-col items-center gap-2 text-center leading-none"
    : "relative inline-flex select-none flex-col items-start leading-none";
  
  const wordClasses = isLogin
    ? "text-4xl sm:text-5xl font-semibold tracking-tight"
    : "text-2xl sm:text-3xl font-semibold tracking-tight";
  
  const subtitleClasses = isLogin
    ? "text-[0.72rem] sm:text-sm font-semibold uppercase tracking-[0.22em] text-slate-400"
    : "absolute top-full left-0 mt-0.5 hidden text-[0.52rem] font-semibold uppercase tracking-[0.18em] text-slate-400/90 xl:block whitespace-nowrap";

  return (
    <span className={wrapperClasses} aria-label="Credix">
      <span className={wordClasses}>
        <span className="text-white">Cred</span>
        <span className="text-[#D8AF2F]">ix</span>
      </span>
      <span className={subtitleClasses}>Gerenciamento Inteligente</span>
    </span>
  );
}
