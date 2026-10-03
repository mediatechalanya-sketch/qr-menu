import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { PublicMenu } from '@/types/menu'

// Публичное чтение: достаточно anon-ключа, RLS отдаёт только активные данные.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** cache() — generateMetadata и страница делают один запрос на двоих. */
export const getPublicMenu = cache(async (slug: string): Promise<PublicMenu | null> => {
  if (!SLUG_RE.test(slug)) return null

  const { data, error } = await supabase.rpc('get_public_menu', { p_slug: slug })
  if (error) throw new Error(`get_public_menu failed: ${error.message}`)

  return (data as PublicMenu | null) ?? null
})
