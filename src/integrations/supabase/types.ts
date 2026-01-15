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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      athletes: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          birth_date: string
          city: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          id: string
          national_id: string | null
          phone: string | null
          postal_code: string | null
          profile_id: string | null
          state: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          birth_date: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"]
          id?: string
          national_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          state?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          birth_date?: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          national_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          state?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_cards: {
        Row: {
          created_at: string | null
          id: string
          membership_id: string
          pdf_url: string | null
          qr_code_data: string | null
          qr_code_image_url: string | null
          tenant_id: string
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          membership_id: string
          pdf_url?: string | null
          qr_code_data?: string | null
          qr_code_image_url?: string | null
          tenant_id: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          membership_id?: string
          pdf_url?: string | null
          qr_code_data?: string | null
          qr_code_image_url?: string | null
          tenant_id?: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_cards_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          athlete_id: string
          created_at: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          ocr_data: Json | null
          tenant_id: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          ocr_data?: Json | null
          tenant_id: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          ocr_data?: Json | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_links: {
        Row: {
          athlete_id: string
          created_at: string | null
          guardian_id: string
          id: string
          is_primary: boolean | null
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          tenant_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          guardian_id: string
          id?: string
          is_primary?: boolean | null
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          tenant_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          guardian_id?: string
          id?: string
          is_primary?: boolean | null
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_links_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          national_id: string | null
          phone: string | null
          profile_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          national_id?: string | null
          phone?: string | null
          profile_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          national_id?: string | null
          phone?: string | null
          profile_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          athlete_id: string
          created_at: string | null
          currency: string
          end_date: string | null
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_cents: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["membership_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["membership_type"]
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_cents?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["membership_type"]
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          price_cents?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["membership_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          name: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          sport_types: string[] | null
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          sport_types?: string[] | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          sport_types?: string[] | null
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      is_member_of_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "SUPERADMIN_GLOBAL"
        | "ADMIN_TENANT"
        | "STAFF_ORGANIZACAO"
        | "COACH_PRINCIPAL"
        | "COACH_ASSISTENTE"
        | "INSTRUTOR"
        | "RECEPCAO"
        | "ATLETA"
        | "RESPONSAVELLEGAL"
      document_type:
        | "ID_DOCUMENT"
        | "MEDICAL_CERTIFICATE"
        | "ADDRESS_PROOF"
        | "OTHER"
      gender_type: "MALE" | "FEMALE" | "OTHER"
      guardian_relationship: "PARENT" | "GUARDIAN" | "OTHER"
      membership_status:
        | "DRAFT"
        | "PENDING_PAYMENT"
        | "PENDING_REVIEW"
        | "APPROVED"
        | "ACTIVE"
        | "EXPIRED"
        | "CANCELLED"
      membership_type: "FIRST_MEMBERSHIP" | "RENEWAL"
      payment_status: "NOT_PAID" | "PAID" | "FAILED"
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
      app_role: [
        "SUPERADMIN_GLOBAL",
        "ADMIN_TENANT",
        "STAFF_ORGANIZACAO",
        "COACH_PRINCIPAL",
        "COACH_ASSISTENTE",
        "INSTRUTOR",
        "RECEPCAO",
        "ATLETA",
        "RESPONSAVELLEGAL",
      ],
      document_type: [
        "ID_DOCUMENT",
        "MEDICAL_CERTIFICATE",
        "ADDRESS_PROOF",
        "OTHER",
      ],
      gender_type: ["MALE", "FEMALE", "OTHER"],
      guardian_relationship: ["PARENT", "GUARDIAN", "OTHER"],
      membership_status: [
        "DRAFT",
        "PENDING_PAYMENT",
        "PENDING_REVIEW",
        "APPROVED",
        "ACTIVE",
        "EXPIRED",
        "CANCELLED",
      ],
      membership_type: ["FIRST_MEMBERSHIP", "RENEWAL"],
      payment_status: ["NOT_PAID", "PAID", "FAILED"],
    },
  },
} as const
