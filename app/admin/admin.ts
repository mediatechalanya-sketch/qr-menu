import type { I18n } from '@/types/menu'

export interface AdminRestaurant {
  id: string
  slug: string
  name: string
  currency: string
}

export interface AdminDish {
  id: string
  name: I18n
  price: number
  image_url: string | null
  is_available: boolean // false = стоп-лист
  is_active: boolean // false = скрыто из меню
  sort_order: number
}

export interface AdminCategory {
  id: string
  name: I18n
  sort_order: number
  dishes: AdminDish[]
}
