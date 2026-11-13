import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function IconButton({
  label,
  active,
  tone = 'default',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; tone?: 'default' | 'rec' | 'accent' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'no-drag inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/65 transition-all duration-150',
        'hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-35',
        active && tone === 'default' && 'bg-white/12 text-white',
        active && tone === 'accent' && 'bg-accent/20 text-accent',
        active && tone === 'rec' && 'bg-rec/20 text-rec',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={clsx(
        'no-drag inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[12.5px]',
        variant === 'primary' && 'bg-accent-strong text-white hover:bg-accent',
        variant === 'secondary' && 'border border-white/10 bg-white/8 text-white/85 hover:bg-white/14',
        variant === 'danger' && 'border border-rec/30 bg-rec/15 text-rec hover:bg-rec/25',
        variant === 'ghost' && 'text-white/60 hover:bg-white/8 hover:text-white',
        className
      )}
      {...rest}
    />
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'no-drag relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40',
        checked ? 'bg-accent-strong' : 'bg-white/15'
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] left-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          checked && 'translate-x-[14px]'
        )}
      />
    </button>
  )
}

export function Row({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-white/90">{title}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-white/45">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block py-1.5">
      <span className="mb-1 block text-[11.5px] font-medium tracking-wide text-white/55 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-white/40">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'no-drag selectable w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-accent/60 focus:bg-black/35'

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="no-drag inline-flex rounded-lg border border-white/10 bg-black/25 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150',
            value === o.value ? 'bg-white/14 text-white shadow-sm' : 'text-white/55 hover:text-white/85'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'rec' | 'accent'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap',
        tone === 'neutral' && 'bg-white/10 text-white/60',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'rec' && 'bg-rec/15 text-rec',
        tone === 'accent' && 'bg-accent/15 text-accent'
      )}
    >
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
