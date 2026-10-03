import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Literata, Onest } from 'next/font/google'
import { getPublicMenu } from '@/lib/menu'
import { pickText, UI } from '@/lib/i18n'
import MenuView from './menu-view'

// Оба шрифта поддерживают турецкий (ı, İ, ş, ğ) и кириллицу.
const display = Literata({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-display',
  display: 'swap',
})
const body = Onest({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-body',
  display: 'swap',
})

// Меню кэшируется на 30 секунд: правки цен и стоп-лист видны почти сразу.
export const revalidate = 30

type Props = { params: Promise<{ restaurant_slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { restaurant_slug } = await params
  const menu = await getPublicMenu(restaurant_slug)
  if (!menu) return { title: 'Menu' }

  const r = menu.restaurant
  const lang = r.default_language
  const image = r.cover_url ?? r.logo_url ?? undefined

  return {
    title: `${r.name} — ${UI[lang].menu}`,
    description: pickText(r.description, lang) || undefined,
    openGraph: { title: r.name, images: image },
  }
}

export default async function MenuPage({ params }: Props) {
  const { restaurant_slug } = await params
  const menu = await getPublicMenu(restaurant_slug)
  if (!menu) notFound()

  return (
    <div className={`${display.variable} ${body.variable}`}>
      <MenuView menu={menu} />
    </div>
  )
}
