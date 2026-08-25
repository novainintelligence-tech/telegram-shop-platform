export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bot_state: {
        Row: {
          chat_id: number
          state: Json
          updated_at: string
        }
        Insert: {
          chat_id: number
          state?: Json
          updated_at?: string
        }
        Update: {
          chat_id?: number
          state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          created_at: string
          first_name: string | null
          id: number
          is_banned: boolean
          telegram_id: number
          updated_at: string
          username: string | null
          wallet_balance: number
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: number
          is_banned?: boolean
          telegram_id: number
          updated_at?: string
          username?: string | null
          wallet_balance?: number
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: number
          is_banned?: boolean
          telegram_id?: number
          updated_at?: string
          username?: string | null
          wallet_balance?: number
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          created_at: string
          id: number
          message_text: string
          sent_count: number
        }
        Insert: {
          created_at?: string
          id?: number
          message_text: string
          sent_count?: number
        }
        Update: {
          created_at?: string
          id?: number
          message_text?: string
          sent_count?: number
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: number
          product_id: number
          quantity: number
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          product_id: number
          quantity?: number
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          product_id?: number
          quantity?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bot_users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: number
          image_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          image_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          image_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: number
          order_id: number
          reason: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          user_id: number
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: number
          order_id: number
          reason: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          user_id: number
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: number
          order_id?: number
          reason?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bot_users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          delivered_asset: string | null
          id: number
          order_id: number
          price: number
          product_id: number | null
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string
          delivered_asset?: string | null
          id?: number
          order_id: number
          price: number
          product_id?: number | null
          product_name: string
          quantity?: number
        }
        Update: {
          created_at?: string
          delivered_asset?: string | null
          id?: number
          order_id?: number
          price?: number
          product_id?: number | null
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          completed_at: string | null
          created_at: string
          dispute_status: Database["public"]["Enums"]["dispute_status"]
          id: number
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          user_id: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount: number
          user_id: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bot_users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_keys: {
        Row: {
          created_at: string
          id: number
          is_sold: boolean
          key_value: string
          order_id: number | null
          product_id: number
          sold_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_sold?: boolean
          key_value: string
          order_id?: number | null
          product_id: number
          sold_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_sold?: boolean
          key_value?: string
          order_id?: number | null
          product_id?: number
          sold_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_keys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: number | null
          created_at: string
          description: string | null
          download_link: string | null
          id: number
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          product_type: Database["public"]["Enums"]["product_type"]
          stock_count: number
          subcategory_id: number | null
          updated_at: string
        }
        Insert: {
          category_id?: number | null
          created_at?: string
          description?: string | null
          download_link?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          product_type?: Database["public"]["Enums"]["product_type"]
          stock_count?: number
          subcategory_id?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: number | null
          created_at?: string
          description?: string | null
          download_link?: string | null
          id?: number
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          stock_count?: number
          subcategory_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          admin_telegram_id: number | null
          amount_tolerance_percent: number
          auto_confirm: boolean
          banner_image_url: string | null
          btc_address: string | null
          channel_username: string | null
          id: number
          min_topup_usd: number
          mini_app_url: string | null
          payment_expiry_minutes: number
          store_name: string
          support_username: string | null
          updated_at: string
          usdc_erc20_address: string | null
          usdt_trc20_address: string | null
          welcome_message: string
        }
        Insert: {
          admin_telegram_id?: number | null
          amount_tolerance_percent?: number
          auto_confirm?: boolean
          banner_image_url?: string | null
          btc_address?: string | null
          channel_username?: string | null
          id?: number
          min_topup_usd?: number
          mini_app_url?: string | null
          payment_expiry_minutes?: number
          store_name?: string
          support_username?: string | null
          updated_at?: string
          usdc_erc20_address?: string | null
          usdt_trc20_address?: string | null
          welcome_message?: string
        }
        Update: {
          admin_telegram_id?: number | null
          amount_tolerance_percent?: number
          auto_confirm?: boolean
          banner_image_url?: string | null
          btc_address?: string | null
          channel_username?: string | null
          id?: number
          min_topup_usd?: number
          mini_app_url?: string | null
          payment_expiry_minutes?: number
          store_name?: string
          support_username?: string | null
          updated_at?: string
          usdc_erc20_address?: string | null
          usdt_trc20_address?: string | null
          welcome_message?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: number | null
          created_at: string
          description: string | null
          id: number
          image_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          category_id?: number | null
          created_at?: string
          description?: string | null
          id?: number
          image_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          category_id?: number | null
          created_at?: string
          description?: string | null
          id?: number
          image_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_updates: {
        Row: {
          created_at: string
          update_id: number
        }
        Insert: {
          created_at?: string
          update_id: number
        }
        Update: {
          created_at?: string
          update_id?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          admin_note: string | null
          amount_usd: number
          asset: Database["public"]["Enums"]["payment_asset"]
          auto_verified: boolean
          completed_at: string | null
          created_at: string
          credited_amount: number | null
          expected_amount: number
          expires_at: string | null
          id: number
          invoice_code: string
          pay_address: string
          status: Database["public"]["Enums"]["transaction_status"]
          submitted_at: string | null
          tx_hash: string | null
          unit_price_usd: number
          updated_at: string
          user_id: number
          verification_note: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_usd: number
          asset: Database["public"]["Enums"]["payment_asset"]
          auto_verified?: boolean
          completed_at?: string | null
          created_at?: string
          credited_amount?: number | null
          expected_amount?: number
          expires_at?: string | null
          id?: number
          invoice_code: string
          pay_address: string
          status?: Database["public"]["Enums"]["transaction_status"]
          submitted_at?: string | null
          tx_hash?: string | null
          unit_price_usd?: number
          updated_at?: string
          user_id: number
          verification_note?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_usd?: number
          asset?: Database["public"]["Enums"]["payment_asset"]
          auto_verified?: boolean
          completed_at?: string | null
          created_at?: string
          credited_amount?: number | null
          expected_amount?: number
          expires_at?: string | null
          id?: number
          invoice_code?: string
          pay_address?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          submitted_at?: string | null
          tx_hash?: string | null
          unit_price_usd?: number
          updated_at?: string
          user_id?: number
          verification_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bot_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: number
          order_id: number | null
          reason: string
          transaction_id: number | null
          user_id: number
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: number
          order_id?: number | null
          reason: string
          transaction_id?: number | null
          user_id: number
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: number
          order_id?: number | null
          reason?: string
          transaction_id?: number | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "bot_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_balance: {
        Args: {
          _amount: number
          _order_id?: number
          _reason: string
          _transaction_id?: number
          _user_id: number
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      dispute_status: "nil" | "opened" | "resolved"
      order_status: "processing" | "completed" | "cancelled"
      payment_asset: "BTC" | "USDT_TRC20" | "USDC_ERC20"
      product_type: "key" | "file"
      transaction_status:
        | "pending"
        | "submitted"
        | "completed"
        | "expired"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      dispute_status: ["nil", "opened", "resolved"],
      order_status: ["processing", "completed", "cancelled"],
      payment_asset: ["BTC", "USDT_TRC20", "USDC_ERC20"],
      product_type: ["key", "file"],
      transaction_status: [
        "pending",
        "submitted",
        "completed",
        "expired",
        "failed",
      ],
    },
  },
} as const
