export function BrandWordmark({ size = "header" }: { size?: "header" | "login" }) {
  const isLogin = size === "login";
  const wrapperClasses = isLogin
    ? "inline-flex select-none items-center gap-3 text-center leading-none"
    : "inline-flex select-none items-center gap-2.5 leading-none";
  const markClasses = isLogin
    ? "flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F7EF7] shadow-[0_6px_18px_rgba(79,126,247,0.28)]"
    : "flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F7EF7] shadow-[0_4px_12px_rgba(79,126,247,0.24)]";
  const wordClasses = isLogin
    ? "text-4xl sm:text-5xl font-bold tracking-tight"
    : "text-[1.35rem] sm:text-[1.45rem] font-bold tracking-tight";
  const subtitleClasses = isLogin
    ? "text-[0.72rem] sm:text-sm font-semibold uppercase tracking-[0.18em] text-slate-400"
    : "hidden text-[0.52rem] font-semibold uppercase tracking-[0.18em] text-slate-400 xl:block whitespace-nowrap";

  return (
    <span aria-label="Credix" className={wrapperClasses}>
      {isLogin ? (
        <span className={markClasses}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="white" />
          </svg>
        </span>
      ) : null}
      <span className="inline-flex flex-col leading-none">
        <span className={wordClasses}>
          <span className="text-slate-800">Cred</span>
          <span className="text-[#4F7EF7]">ix</span>
        </span>
        <span className={subtitleClasses}>Gerenciamento Inteligente</span>
      </span>
    </span>
  );
}
