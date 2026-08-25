ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.subcategories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS banner_image_url text;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS mini_app_url text;