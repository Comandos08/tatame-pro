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
      academies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          postal_code: string | null
          slug: string
          sport_type: string | null
          state: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          slug: string
          sport_type?: string | null
          state?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          slug?: string
          sport_type?: string | null
          state?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_coaches: {
        Row: {
          academy_id: string
          coach_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          role: Database["public"]["Enums"]["academy_coach_role"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          academy_id: string
          coach_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["academy_coach_role"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          academy_id?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["academy_coach_role"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_coaches_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_coaches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_gradings: {
        Row: {
          academy_id: string | null
          athlete_id: string
          coach_id: string | null
          created_at: string | null
          diploma_id: string | null
          grading_level_id: string
          id: string
          notes: string | null
          promotion_date: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          academy_id?: string | null
          athlete_id: string
          coach_id?: string | null
          created_at?: string | null
          diploma_id?: string | null
          grading_level_id: string
          id?: string
          notes?: string | null
          promotion_date?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          academy_id?: string | null
          athlete_id?: string
          coach_id?: string | null
          created_at?: string | null
          diploma_id?: string | null
          grading_level_id?: string
          id?: string
          notes?: string | null
          promotion_date?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_gradings_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_diploma_id_fkey"
            columns: ["diploma_id"]
            isOneToOne: false
            referencedRelation: "diplomas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_grading_level_id_fkey"
            columns: ["grading_level_id"]
            isOneToOne: false
            referencedRelation: "grading_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_gradings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          birth_date: string
          city: string | null
          country: string | null
          created_at: string | null
          current_academy_id: string | null
          current_main_coach_id: string | null
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
          current_academy_id?: string | null
          current_main_coach_id?: string | null
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
          current_academy_id?: string | null
          current_main_coach_id?: string | null
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
            foreignKeyName: "athletes_current_academy_id_fkey"
            columns: ["current_academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_current_main_coach_id_fkey"
            columns: ["current_main_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
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
      audit_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          profile_id: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          profile_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          profile_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          main_sport: string | null
          profile_id: string | null
          rank: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          main_sport?: string | null
          profile_id?: string | null
          rank?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          main_sport?: string | null
          profile_id?: string | null
          rank?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_cards: {
        Row: {
          content_hash_sha256: string | null
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
          content_hash_sha256?: string | null
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
          content_hash_sha256?: string | null
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
      diplomas: {
        Row: {
          academy_id: string | null
          athlete_id: string
          coach_id: string | null
          content_hash_sha256: string | null
          created_at: string | null
          grading_level_id: string
          id: string
          issued_at: string | null
          pdf_url: string | null
          promotion_date: string
          qr_code_data: string | null
          qr_code_image_url: string | null
          revoked_at: string | null
          revoked_reason: string | null
          serial_number: string
          status: Database["public"]["Enums"]["diploma_status"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          academy_id?: string | null
          athlete_id: string
          coach_id?: string | null
          content_hash_sha256?: string | null
          created_at?: string | null
          grading_level_id: string
          id?: string
          issued_at?: string | null
          pdf_url?: string | null
          promotion_date: string
          qr_code_data?: string | null
          qr_code_image_url?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["diploma_status"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          academy_id?: string | null
          athlete_id?: string
          coach_id?: string | null
          content_hash_sha256?: string | null
          created_at?: string | null
          grading_level_id?: string
          id?: string
          issued_at?: string | null
          pdf_url?: string | null
          promotion_date?: string
          qr_code_data?: string | null
          qr_code_image_url?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["diploma_status"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diplomas_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomas_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomas_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomas_grading_level_id_fkey"
            columns: ["grading_level_id"]
            isOneToOne: false
            referencedRelation: "grading_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomas_tenant_id_fkey"
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
            foreignKeyName: "documents_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
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
      grading_levels: {
        Row: {
          code: string
          created_at: string | null
          display_name: string
          grading_scheme_id: string
          id: string
          is_active: boolean | null
          min_age: number | null
          min_time_months: number | null
          order_index: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          display_name: string
          grading_scheme_id: string
          id?: string
          is_active?: boolean | null
          min_age?: number | null
          min_time_months?: number | null
          order_index?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          display_name?: string
          grading_scheme_id?: string
          id?: string
          is_active?: boolean | null
          min_age?: number | null
          min_time_months?: number | null
          order_index?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_levels_grading_scheme_id_fkey"
            columns: ["grading_scheme_id"]
            isOneToOne: false
            referencedRelation: "grading_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_schemes: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          sport_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          sport_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          sport_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_schemes_tenant_id_fkey"
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
            foreignKeyName: "guardian_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
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
          academy_id: string | null
          athlete_id: string
          created_at: string | null
          currency: string
          end_date: string | null
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id: string | null
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
          webhook_processed_at: string | null
        }
        Insert: {
          academy_id?: string | null
          athlete_id: string
          created_at?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id?: string | null
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
          webhook_processed_at?: string | null
        }
        Update: {
          academy_id?: string | null
          athlete_id?: string
          created_at?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id?: string | null
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
          webhook_processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
      password_resets: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          profile_id: string
          token: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          profile_id: string
          token: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          profile_id?: string
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "password_resets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      tenant_billing: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_name: string
          plan_price_id: string
          status: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end_notification_sent: boolean | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          plan_price_id?: string
          status?: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end_notification_sent?: boolean | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          plan_price_id?: string
          status?: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_end_notification_sent?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          paid_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_email: string | null
          card_template_url: string | null
          created_at: string | null
          default_locale: string | null
          description: string | null
          diploma_template_url: string | null
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
          billing_email?: string | null
          card_template_url?: string | null
          created_at?: string | null
          default_locale?: string | null
          description?: string | null
          diploma_template_url?: string | null
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
          billing_email?: string | null
          card_template_url?: string | null
          created_at?: string | null
          default_locale?: string | null
          description?: string | null
          diploma_template_url?: string | null
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
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      athletes_public_verification: {
        Row: {
          full_name: string | null
          id: string | null
          tenant_id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          tenant_id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      athlete_has_active_membership: {
        Args: { _athlete_id: string }
        Returns: boolean
      }
      athlete_has_issued_diploma: {
        Args: { _athlete_id: string }
        Returns: boolean
      }
      can_approve_membership: {
        Args: { _membership_id: string }
        Returns: boolean
      }
      coach_has_issued_diploma: {
        Args: { _coach_id: string }
        Returns: boolean
      }
      get_next_diploma_serial: {
        Args: { p_sport_type: string; p_tenant_id: string }
        Returns: string
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      is_head_coach_of_academy: {
        Args: { _academy_id: string }
        Returns: boolean
      }
      is_member_of_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant_id: string }; Returns: boolean }
      membership_has_digital_card: {
        Args: { _membership_id: string }
        Returns: boolean
      }
      tenant_has_active_billing: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
    }
    Enums: {
      academy_coach_role: "HEAD_COACH" | "ASSISTANT_COACH" | "INSTRUCTOR"
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
      billing_status:
        | "ACTIVE"
        | "PAST_DUE"
        | "CANCELED"
        | "INCOMPLETE"
        | "TRIALING"
        | "UNPAID"
      diploma_status: "DRAFT" | "ISSUED" | "REVOKED"
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
      academy_coach_role: ["HEAD_COACH", "ASSISTANT_COACH", "INSTRUCTOR"],
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
      billing_status: [
        "ACTIVE",
        "PAST_DUE",
        "CANCELED",
        "INCOMPLETE",
        "TRIALING",
        "UNPAID",
      ],
      diploma_status: ["DRAFT", "ISSUED", "REVOKED"],
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
