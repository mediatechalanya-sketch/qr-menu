'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatPrice, pickText, UI } from '@/lib/i18n'
import { LANGS, type Lang, type MenuDish, type PublicMenu } from '@/types/menu'

// Цвета — CSS-переменные: позже можно подставлять фирменный цвет ресторана.
const THEME = {
  '--paper': '#F8F9F7',
  '--ink': '#16201D',
  '--muted': '#5C6A65',
  '--line': '#DCE3DF',
  '--accent': '#0B6A70', // бирюза иникской плитки
  '--soldout-bg': '#E8ECEA',
  '--soldout-ink': '#4B5853',
} as CSSProperties

const DISPLAY = 'font-[family-name:var(--font-display)]'
const BODY = 'font-[family-name:var(--font-body)]'
const LANG_KEY = 'qrmenu:lang'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function MenuView({ menu }: { menu: PublicMenu }) {
  const r = menu.restaurant

  const enabled = useMemo(
    () => LANGS.filter((l) => r.enabled_languages.includes(l)),
    [r.enabled_languages]
  )
  const [lang, setLang] = useState<Lang>(r.default_language)
  const t = UI[lang]

  // Пустые категории не показываем
  const categories = useMemo(
    () => menu.categories.filter((c) => c.dishes.length > 0),
    [menu.categories]
  )
  const [activeId, setActiveId] = useState(categories[0]?.id ?? '')

  const railRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef(false)
  const lockTimer = useRef<number | undefined>(undefined)

  // Язык: сохранённый выбор -> язык телефона -> язык ресторана по умолчанию
  useEffect(() => {
    let next: Lang | null = null
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null
      if (saved && enabled.includes(saved)) next = saved
    } catch {}
    if (!next) {
      const nav = navigator.language.slice(0, 2).toLowerCase() as Lang
      if (enabled.includes(nav)) next = nav
    }
    if (next) setLang(next)
  }, [enabled])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const changeLang = (l: Lang) => {
    setLang(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {}
  }

  // Scroll-spy: подсвечиваем категорию, чей раздел сейчас у верхнего края
  useEffect(() => {
    if (categories.length === 0) return
    let raf = 0

    const update = () => {
      if (lockRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let current = categories[0].id
        for (const c of categories) {
          const el = document.getElementById(`cat-${c.id}`)
          if (el && el.getBoundingClientRect().top - 96 <= 0) current = c.id
        }
        const atBottom =
          window.innerHeight + window.scrollY >= document.body.scrollHeight - 4
        if (atBottom) current = categories[categories.length - 1].id
        setActiveId(current)
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      cancelAnimationFrame(raf)
    }
  }, [categories])

  // Активный чип плавно центрируется в горизонтальной рейке
  useEffect(() => {
    const rail = railRef.current
    const chip = rail?.querySelector<HTMLElement>(`[data-chip="${activeId}"]`)
    if (!rail || !chip) return
    rail.scrollTo({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [activeId])

  const selectCategory = (id: string) => {
    const el = document.getElementById(`cat-${id}`)
    if (!el) return
    lockRef.current = true // пока идёт прокрутка, scroll-spy не перебивает выбор
    window.clearTimeout(lockTimer.current)
    lockTimer.current = window.setTimeout(() => {
      lockRef.current = false
    }, 800)
    setActiveId(id)
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <div
      style={THEME}
      className={`min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)] antialiased ${BODY}`}
    >
      {/* ---------- Шапка ---------- */}
      <header>
        <div className="relative h-28 w-full bg-[color:var(--accent)] sm:h-44">
          {r.cover_url && (
            <Image
              src={r.cover_url}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
          {enabled.length > 1 && (
            <div className="absolute inset-x-0 top-3">
              <div className="mx-auto flex max-w-3xl justify-end px-3">
                <LanguageSwitcher
                  langs={enabled}
                  value={lang}
                  label={t.language}
                  onChange={changeLang}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto flex max-w-3xl items-start gap-4 px-4 pb-5">
          {r.logo_url && (
            <div className="relative -mt-10 h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl border-4 border-[color:var(--paper)] bg-white">
              <Image
                src={r.logo_url}
                alt={r.name}
                fill
                sizes="76px"
                className="object-cover"
              />
            </div>
          )}
          <div className={`min-w-0 flex-1 ${r.logo_url ? 'pt-3' : 'pt-5'}`}>
            <h1 className={`${DISPLAY} text-2xl font-semibold leading-tight`}>
              {r.name}
            </h1>
            {pickText(r.description, lang, r.default_language) && (
              <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-[color:var(--muted)]">
                {pickText(r.description, lang, r.default_language)}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Рейка категорий ---------- */}
      {categories.length > 1 && (
        <nav
          aria-label={t.categories}
          className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[color:var(--paper)]"
        >
          <div
            ref={railRef}
            className="relative mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((c) => {
              const on = c.id === activeId
              return (
                <button
                  key={c.id}
                  type="button"
                  data-chip={c.id}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => selectCategory(c.id)}
                  className={`relative h-12 shrink-0 whitespace-nowrap px-3 text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] ${
                    on
                      ? 'text-[color:var(--ink)]'
                      : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]'
                  }`}
                >
                  {pickText(c.name, lang, r.default_language)}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[color:var(--accent)] transition-opacity ${
                      on ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* ---------- Меню ---------- */}
      <main className="mx-auto max-w-3xl px-4 pb-16">
        {categories.length === 0 ? (
          <div className="py-24 text-center">
            <p className={`${DISPLAY} text-xl font-semibold`}>{t.emptyTitle}</p>
            <p className="mt-2 text-[15px] text-[color:var(--muted)]">{t.emptyText}</p>
          </div>
        ) : (
          categories.map((c) => (
            <section
              key={c.id}
              id={`cat-${c.id}`}
              aria-labelledby={`cat-title-${c.id}`}
              className="scroll-mt-12 pt-7"
            >
              <h2
                id={`cat-title-${c.id}`}
                className={`${DISPLAY} pb-3 text-[22px] font-semibold leading-tight`}
              >
                {pickText(c.name, lang, r.default_language)}
              </h2>
              <ul className="md:grid md:grid-cols-2 md:gap-x-10">
                {c.dishes.map((d) => (
                  <DishItem
                    key={d.id}
                    dish={d}
                    lang={lang}
                    fallback={r.default_language}
                    currency={r.currency}
                    soldOutLabel={t.soldOut}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  )
}

function LanguageSwitcher({
  langs,
  value,
  label,
  onChange,
}: {
  langs: Lang[]
  value: Lang
  label: string
  onChange: (l: Lang) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-white p-1 shadow-sm">
      {langs.map((l) => {
        const on = l === value
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={on}
            onClick={() => onChange(l)}
            className={`h-8 min-w-10 rounded-full px-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
              on
                ? 'bg-[color:var(--ink)] text-white'
                : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]'
            }`}
          >
            {l.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

function DishItem({
  dish,
  lang,
  fallback,
  currency,
  soldOutLabel,
}: {
  dish: MenuDish
  lang: Lang
  fallback: Lang
  currency: string
  soldOutLabel: string
}) {
  const soldOut = !dish.is_available
  const description = pickText(dish.description, lang, fallback)

  return (
    <li className="flex gap-4 border-t border-[color:var(--line)] py-4">
      <div className="min-w-0 flex-1">
        <h3
          className={`${DISPLAY} text-[17px] font-semibold leading-snug ${
            soldOut ? 'text-[color:var(--muted)]' : ''
          }`}
        >
          {pickText(dish.name, lang, fallback)}
        </h3>

        {description && (
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted)]">
            {description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className={`text-base font-bold tabular-nums ${
              soldOut ? 'text-[color:var(--muted)]' : 'text-[color:var(--accent)]'
            }`}
          >
            {formatPrice(dish.price, currency, lang)}
          </span>
          {dish.weight_info && (
            <span className="text-xs text-[color:var(--muted)]">{dish.weight_info}</span>
          )}
          {soldOut && (
            <span className="rounded-full bg-[color:var(--soldout-bg)] px-2.5 py-0.5 text-xs font-semibold text-[color:var(--soldout-ink)]">
              {soldOutLabel}
            </span>
          )}
        </div>
      </div>

      {dish.image_url && (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[color:var(--line)] sm:h-28 sm:w-28">
          <Image
            src={dish.image_url}
            alt=""
            fill
            sizes="(min-width: 640px) 112px, 96px"
            className={`object-cover ${soldOut ? 'opacity-60 grayscale' : ''}`}
          />
        </div>
      )}
    </li>
  )
}
