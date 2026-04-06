import { Children, type ReactNode } from "react";

type MobileDataCardProps = {
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type MobileDataCardRowProps = {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  className?: string;
};

type MobileDataCardActionsProps = {
  primary?: ReactNode;
  children?: ReactNode;
  className?: string;
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function MobileDataCard({
  title,
  badge,
  subtitle,
  children,
  actions,
  className,
}: MobileDataCardProps) {
  return (
    <article
      className={joinClasses(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.10)]",
        className,
      )}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>

        <div className="mt-3 grid gap-2">{children}</div>
      </div>

      {actions ? <div className="border-t border-slate-200 px-4 py-3">{actions}</div> : null}
    </article>
  );
}

export function MobileDataCardRow({
  label,
  value,
  valueClassName,
  className,
}: MobileDataCardRowProps) {
  return (
    <div
      className={joinClasses(
        "rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5",
        className,
      )}
    >
      <div className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={joinClasses("mt-1 text-sm font-semibold text-slate-800", valueClassName)}>{value}</div>
    </div>
  );
}

export function MobileDataCardActions({
  primary,
  children,
  className,
}: MobileDataCardActionsProps) {
  const extraActions = Children.toArray(children).filter(Boolean);
  const shouldInlineSingleExtra = Boolean(primary) && extraActions.length === 1;

  return (
    <div className={joinClasses(shouldInlineSingleExtra ? "" : "space-y-2.5", className)}>
      {shouldInlineSingleExtra ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{primary}</div>
          <div className="shrink-0">{extraActions[0]}</div>
        </div>
      ) : (
        <>
          {primary ? <div>{primary}</div> : null}
          {extraActions.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">{extraActions}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
