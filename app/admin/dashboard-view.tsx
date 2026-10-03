'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import type { I18n } from '@/types/menu'
import type { AdminCategory, AdminDish, AdminRestaurant } from '@/types/admin'

const THEME = {
  '--paper': '#F8F9F7',
  '--ink': '#16201D',
  '--muted': '#5C6A65',
  '--line': '#DCE3DF',
  '--accent': '#0B6A70',
  '--stop': '#A63D2A',
  '--off': '#A9B4AF',
} as CSSProperties

const DISPLAY = 'font-[family-name:var(--font-display)]'
const BODY = 'font-[family-name:var(--font-body)]'

type Filter = 'all' | 'stop'
type Toast = { text: string; tone: 'ok' | 'error' } | null

/* ------------------------------ helpers ------------------------------ */

const dishLabel = (name: I18n) =>
  name.tr?.trim() || name.en?.trim() || Object.values(name).find(Boolean) || 'Без названия'

const currencySymbol = (currency: string) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? currency

const formatInput = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','))

/** "420" | "42,5" | "42.50" -> число; иначе null. Не больше 2 знаков после запятой. */
function parsePrice(text: string): number | null {
  const s = text.trim().replace(',', '.')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null
  return Number(s)
}

/* ------------------------------- view -------------------------------- */

export default function DashboardView({
  restaurant,
  categories,
}: {
  restaurant: AdminRestaurant
  categories: AdminCategory[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const symbol = useMemo(() => currencySymbol(restaurant.currency), [restaurant.currency])

  const [cats, setCats] = useState(categories)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toast, setToast] = useState<Toast>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const notify = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  const patchDish = useCallback((id: string, patch: Partial<AdminDish>) => {
    setCats((prev) =>
      prev.map((c) => ({
        ...c,
        dishes: c.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }))
    )
  }, [])

  const total = useMemo(() => cats.reduce((n, c) => n + c.dishes.length, 0), [cats])
  const stopCount = useMemo(
    () => cats.reduce((n, c) => n + c.dishes.filter((d) => !d.is_available).length, 0),
    [cats]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return cats
      .map((c) => ({
        ...c,
        dishes: c.dishes.filter(
          (d) =>
            (filter === 'all' || !d.is_available) &&
            (!q || Object.values(d.name).some((n) => n?.toLocaleLowerCase('tr').includes(q)))
        ),
      }))
      .filter((c) => c.dishes.length > 0)
  }, [cats, query, filter])

  /* ---- 1. Стоп-лист: переключение в один клик (с откатом при ошибке) ---- */
  const toggleAvailable = async (dish: AdminDish) => {
    const next = !dish.is_available
    setBusy((s) => new Set(s).add(dish.id))
    patchDish(dish.id, { is_available: next })

    const { data, error } = await supabase
      .from('dishes')
      .update({ is_available: next })
      .eq('id', dish.id)
      .select('id')

    setBusy((s) => {
      const n = new Set(s)
      n.delete(dish.id)
      return n
    })

    // RLS не бросает ошибку, а молча обновляет 0 строк — проверяем и это
    if (error || !data?.length) {
      patchDish(dish.id, { is_available: !next })
      notify(`Не удалось изменить статус «${dishLabel(dish.name)}». Попробуйте ещё раз.`, 'error')
    }
  }

  /* ---- 2. Быстрое редактирование цены ---- */
  const updatePrice = async (dish: AdminDish, price: number): Promise<boolean> => {
    const { data, error } = await supabase
      .from('dishes')
      .update({ price })
      .eq('id', dish.id)
      .select('id')

    if (error || !data?.length) {
      notify(`Не удалось сохранить цену «${dishLabel(dish.name)}». Попробуйте ещё раз.`, 'error')
      return false
    }
    patchDish(dish.id, { price })
    return true
  }

  /* ---- 3. QR-код в SVG ---- */
  const downloadQr = async () => {
    try {
      const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, '')
      const svg = await QRCode.toString(`${origin}/menu/${restaurant.slug}`, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4, // «тихая зона» вокруг кода — нужна для надёжного сканирования
        color: { dark: '#16201D', light: '#FFFFFF' },
      })
      // Явный размер, чтобы файл корректно открывался в Illustrator, Canva и т.п.
      const sized = svg.replace('<svg ', '<svg width="1024" height="1024" ')

      const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${restaurant.slug}-menu-qr.svg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('QR-код сохранён в SVG')
    } catch {
      notify('Не удалось создать QR-код. Попробуйте ещё раз.', 'error')
    }
  }

  return (
    <div
      style={THEME}
      className={`min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)] antialiased ${BODY}`}
    >
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-8">
        {/* ---------- Шапка ---------- */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[color:var(--muted)]">Панель управления</p>
            <h1 className={`${DISPLAY} mt-1 truncate text-[28px] font-semibold leading-tight`}>
              {restaurant.name}
            </h1>
          </div>
          <div className="flex gap-2">
            <a
              href={`/menu/${restaurant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white px-4 text-[15px] font-medium outline-none hover:border-[color:var(--ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] sm:flex-none"
            >
              Открыть меню
            </a>
            <button
              type="button"
              onClick={downloadQr}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 text-[15px] font-semibold text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 sm:flex-none"
            >
              <QrIcon />
              Скачать QR-код
            </button>
          </div>
        </header>

        {/* ---------- Поиск и фильтр ---------- */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти блюдо"
            aria-label="Найти блюдо"
            className="h-11 flex-1 rounded-xl border border-[color:var(--line)] bg-white px-4 text-[15px] outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/30"
          />
          <div role="group" aria-label="Фильтр" className="inline-flex rounded-xl border border-[color:var(--line)] bg-white p-1">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
              Все <span className="tabular-nums opacity-70">{total}</span>
            </FilterButton>
            <FilterButton active={filter === 'stop'} onClick={() => setFilter('stop')}>
              Стоп-лист <span className="tabular-nums opacity-70">{stopCount}</span>
            </FilterButton>
          </div>
        </div>

        {/* ---------- Список блюд ---------- */}
        <div className="mt-6 space-y-8">
          {total === 0 ? (
            <Empty title="Блюд пока нет" text="Добавьте категории и блюда — они появятся здесь." />
          ) : visible.length === 0 ? (
            <Empty
              title={filter === 'stop' && !query ? 'Стоп-лист пуст' : 'Ничего не найдено'}
              text={
                filter === 'stop' && !query
                  ? 'Все блюда сейчас в наличии.'
                  : 'Попробуйте изменить запрос или фильтр.'
              }
            />
          ) : (
            visible.map((c) => (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <h2 id={`cat-${c.id}`} className={`${DISPLAY} px-1 pb-2 text-lg font-semibold`}>
                  {dishLabel(c.name)}
                </h2>
                <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
                  {c.dishes.map((d) => (
                    <DishRow
                      key={d.id}
                      dish={d}
                      symbol={symbol}
                      busy={busy.has(d.id)}
                      onToggle={() => toggleAvailable(d)}
                      onSavePrice={(price) => updatePrice(d, price)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      {/* ---------- Уведомление ---------- */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
      >
        {toast && (
          <p
            className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.tone === 'error' ? 'bg-[color:var(--stop)]' : 'bg-[color:var(--ink)]'
            }`}
          >
            {toast.text}
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ строка блюда ------------------------------ */

function DishRow({
  dish,
  symbol,
  busy,
  onToggle,
  onSavePrice,
}: {
  dish: AdminDish
  symbol: string
  busy: boolean
  onToggle: () => void
  onSavePrice: (price: number) => Promise<boolean>
}) {
  const label = dishLabel(dish.name)
  const stopped = !dish.is_available

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color:var(--paper)] text-lg font-semibold text-[color:var(--muted)]">
          {dish.image_url ? (
            <Image
              src={dish.image_url}
              alt=""
              fill
              sizes="48px"
              className={`object-cover ${stopped ? 'opacity-60 grayscale' : ''}`}
            />
          ) : (
            label.charAt(0).toLocaleUpperCase('tr')
          )}
        </div>
        <div className="min-w-0">
          <p className={`${DISPLAY} truncate text-base font-semibold ${stopped ? 'text-[color:var(--muted)]' : ''}`}>
            {label}
          </p>
          {!dish.is_active && (
            <p className="text-xs text-[color:var(--muted)]">Скрыто из меню</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:justify-end">
        <AvailabilitySwitch on={dish.is_available} busy={busy} name={label} onToggle={onToggle} />
        <PriceInput value={dish.price} symbol={symbol} name={label} onSave={onSavePrice} />
      </div>
    </li>
  )
}

/* ------------------------------- тумблер ------------------------------- */

function AvailabilitySwitch({
  on,
  busy,
  name,
  onToggle,
}: {
  on: boolean
  busy: boolean
  name: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${name}: в наличии`}
      disabled={busy}
      onClick={onToggle}
      className="inline-flex h-11 items-center gap-3 rounded-xl pr-1 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] disabled:opacity-60"
    >
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
          on ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--off)]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            on ? 'translate-x-5' : ''
          }`}
        />
      </span>
      <span
        className={`w-[5.5rem] text-left text-sm font-medium ${
          on ? 'text-[color:var(--ink)]' : 'text-[color:var(--stop)]'
        }`}
      >
        {on ? 'В наличии' : 'Стоп-лист'}
      </span>
    </button>
  )
}

/* ---------------------------- поле цены ---------------------------- */

function PriceInput({
  value,
  symbol,
  name,
  onSave,
}: {
  value: number
  symbol: string
  name: string
  onSave: (price: number) => Promise<boolean>
}) {
  const [text, setText] = useState(formatInput(value))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'invalid'>('idle')
  const cancelRef = useRef(false)
  const savedTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setText(formatInput(value))
  }, [value])

  useEffect(() => () => window.clearTimeout(savedTimer.current), [])

  const commit = async () => {
    if (cancelRef.current) {
      cancelRef.current = false
      setText(formatInput(value))
      setState('idle')
      return
    }

    const parsed = parsePrice(text)
    if (parsed === null) {
      setState('invalid')
      return
    }
    if (parsed === value) {
      setText(formatInput(value))
      setState('idle')
      return
    }

    setState('saving')
    const ok = await onSave(parsed)
    if (ok) {
      setState('saved')
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setState('idle'), 1500)
    } else {
      setText(formatInput(value)) // откат к последней сохранённой цене
      setState('idle')
    }
  }

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
      >
        {symbol}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-label={`Цена: ${name}`}
        aria-invalid={state === 'invalid'}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value)
          if (state === 'invalid') setState('idle')
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelRef.current = true
            e.currentTarget.blur()
          }
        }}
        className={`h-11 w-32 rounded-xl border bg-white pl-8 pr-9 text-right text-base font-semibold tabular-nums outline-none focus:ring-2 ${
          state === 'invalid'
            ? 'border-[color:var(--stop)] focus:ring-[color:var(--stop)]/30'
            : 'border-[color:var(--line)] focus:border-[color:var(--accent)] focus:ring-[color:var(--accent)]/30'
        }`}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        {state === 'saving' && (
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent)]" />
        )}
        {state === 'saved' && (
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-[color:var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 10.5 4 4 8-9" />
          </svg>
        )}
      </span>
      {state === 'invalid' && (
        <p role="alert" className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap text-xs text-[color:var(--stop)]">
          Введите цену, например 420 или 42,50
        </p>
      )}
    </div>
  )
}

/* ----------------------------- мелочи ----------------------------- */

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 flex-1 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] sm:flex-none ${
        active
          ? 'bg-[color:var(--ink)] text-white'
          : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-6 py-16 text-center">
      <p className={`${DISPLAY} text-lg font-semibold`}>{title}</p>
      <p className="mt-1 text-[15px] text-[color:var(--muted)]">{text}</p>
    </div>
  )
}

function QrIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
      <path d="M11.5 11.5h2.5v2.5h-2.5zM15 15h2v2h-2zM14 11.5h3" strokeLinecap="round" />
    </svg>
  )
}
