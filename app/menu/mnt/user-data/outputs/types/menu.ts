export const LANGS = ['tr', 'en', 'ru', 'de'] as const
export type Lang = (typeof LANGS)[number]

/** Мультиязычное поле из JSONB: {"tr": "...", "en": "..."} */
export type I18n = Partial<Record<Lang, string>>

export interface MenuDish {
  id: string
  name: I18n
  description: I18n
  price: number
  image_url: string | null
  weight_info: string | null
  calories: number | null
  tags: string[]
  allergens: string[]
  is_available: boolean // false = стоп-лист
}

export interface MenuCategory {
  id: string
  name: I18n
  dishes: MenuDish[]
}

export interface MenuRestaurant {
  id: string
  slug: string
  name: string
  description: I18n
  logo_url: string | null
  cover_url: string | null
  phone: string | null
  address: string | null
  instagram: string | null
  wifi_name: string | null
  wifi_password: string | null
  currency: string
  default_language: Lang
  enabled_languages: Lang[]
}

/** Ответ RPC get_public_menu */
export interface PublicMenu {
  restaurant: MenuRestaurant
  categories: MenuCategory[]
}
