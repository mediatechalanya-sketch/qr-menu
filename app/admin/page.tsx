import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Literata, Onest } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import type { AdminCategory, AdminRestaurant } from '@/types/admin'
import DashboardView from './dashboard-view'

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

export const metadata: Metadata = {
  title: 'Панель управления',
  robots: { index: false, follow: false },
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/dashboard')

  // Берём первый ресторан владельца. RLS всё равно отдаёт только его данные.
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, slug, name, currency')
    .eq('owner_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle<AdminRestaurant>()

  if (!restaurant) {
    return (
      <div className={`${display.variable} ${body.variable}`}>
        <main className="mx-auto max-w-md px-4 py-24 text-center font-[family-name:var(--font-body)]">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Ресторан не найден
          </h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            К вашему аккаунту пока не привязано ни одного ресторана.
          </p>
        </main>
      </div>
    )
  }

  // Все категории и блюда, включая скрытые и из стоп-листа
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, sort_order, dishes(id, name, price, image_url, is_available, is_active, sort_order)')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order')
    .order('sort_order', { referencedTable: 'dishes' })

  if (error) throw new Error(`Не удалось загрузить меню: ${error.message}`)

  return (
    <div className={`${display.variable} ${body.variable}`}>
      <DashboardView
        restaurant={restaurant}
        categories={(categories ?? []) as unknown as AdminCategory[]}
      />
    </div>
  )
}
