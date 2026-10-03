import type { I18n, Lang } from '@/types/menu'

/** Берёт текст на выбранном языке, иначе — на языке ресторана, иначе — турецкий. */
export function pickText(
  value: I18n | null | undefined,
  lang: Lang,
  fallback: Lang = 'tr'
): string {
  if (!value) return ''
  return value[lang]?.trim() || value[fallback]?.trim() || value.tr?.trim() || ''
}

const LOCALES: Record<Lang, string> = {
  tr: 'tr-TR',
  en: 'en-GB',
  ru: 'ru-RU',
  de: 'de-DE',
}

/** 420 -> "₺420", 42.5 -> "₺42,50". Для лиры всегда используем tr-TR, чтобы был знак ₺. */
export function formatPrice(price: number, currency: string, lang: Lang): string {
  const locale = currency === 'TRY' ? 'tr-TR' : LOCALES[lang]
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export const UI: Record<
  Lang,
  {
    menu: string
    soldOut: string
    categories: string
    language: string
    emptyTitle: string
    emptyText: string
  }
> = {
  tr: {
    menu: 'Menü',
    soldOut: 'Tükendi',
    categories: 'Kategoriler',
    language: 'Dil',
    emptyTitle: 'Menü henüz hazır değil',
    emptyText: 'Lütfen daha sonra tekrar bakın.',
  },
  en: {
    menu: 'Menu',
    soldOut: 'Sold out',
    categories: 'Categories',
    language: 'Language',
    emptyTitle: 'The menu isn’t ready yet',
    emptyText: 'Please check back soon.',
  },
  ru: {
    menu: 'Меню',
    soldOut: 'Закончилось',
    categories: 'Категории',
    language: 'Язык',
    emptyTitle: 'Меню пока не готово',
    emptyText: 'Загляните чуть позже.',
  },
  de: {
    menu: 'Speisekarte',
    soldOut: 'Ausverkauft',
    categories: 'Kategorien',
    language: 'Sprache',
    emptyTitle: 'Die Speisekarte ist noch nicht fertig',
    emptyText: 'Bitte schauen Sie später noch einmal vorbei.',
  },
}
