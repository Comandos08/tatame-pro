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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
          is_official: boolean
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
          is_official?: boolean
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
          is_official?: boolean
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
          category: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          profile_id: string | null
          tenant_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          profile_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          category?: string | null
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      billing_environment_config: {
        Row: {
          created_at: string
          id: string
          stripe_env: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          stripe_env?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          stripe_env?: string
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      council_decisions: {
        Row: {
          council_id: string
          created_at: string
          created_by: string | null
          decision_type: Database["public"]["Enums"]["council_decision_type"]
          description: string | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["council_decision_status"]
          target_tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          council_id: string
          created_at?: string
          created_by?: string | null
          decision_type: Database["public"]["Enums"]["council_decision_type"]
          description?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["council_decision_status"]
          target_tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          council_id?: string
          created_at?: string
          created_by?: string | null
          decision_type?: Database["public"]["Enums"]["council_decision_type"]
          description?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["council_decision_status"]
          target_tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_decisions_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "councils"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_decisions_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "council_decisions_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      council_members: {
        Row: {
          council_id: string
          joined_at: string
          role: Database["public"]["Enums"]["council_role"]
          user_id: string
        }
        Insert: {
          council_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["council_role"]
          user_id: string
        }
        Update: {
          council_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["council_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_members_council_id_fkey"
            columns: ["council_id"]
            isOneToOne: false
            referencedRelation: "councils"
            referencedColumns: ["id"]
          },
        ]
      }
      councils: {
        Row: {
          created_at: string
          description: string | null
          federation_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          federation_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          federation_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "councils_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_logs: {
        Row: {
          created_at: string
          current_hash: string
          decision_type: string
          id: string
          metadata: Json | null
          operation: string | null
          previous_hash: string | null
          reason_code: string
          severity: Database["public"]["Enums"]["security_severity"]
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_hash: string
          decision_type: string
          id?: string
          metadata?: Json | null
          operation?: string | null
          previous_hash?: string | null
          reason_code: string
          severity?: Database["public"]["Enums"]["security_severity"]
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_hash?: string
          decision_type?: string
          id?: string
          metadata?: Json | null
          operation?: string | null
          previous_hash?: string | null
          reason_code?: string
          severity?: Database["public"]["Enums"]["security_severity"]
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "decision_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_tenants: {
        Row: {
          athletes_count: number | null
          billing_email: string | null
          creator_email: string | null
          deleted_at: string | null
          deletion_reason: string | null
          events_count: number | null
          id: string
          memberships_count: number | null
          metadata: Json | null
          original_tenant_id: string
          tenant_name: string
          tenant_slug: string
          trial_started_at: string | null
        }
        Insert: {
          athletes_count?: number | null
          billing_email?: string | null
          creator_email?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          events_count?: number | null
          id?: string
          memberships_count?: number | null
          metadata?: Json | null
          original_tenant_id: string
          tenant_name: string
          tenant_slug: string
          trial_started_at?: string | null
        }
        Update: {
          athletes_count?: number | null
          billing_email?: string | null
          creator_email?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          events_count?: number | null
          id?: string
          memberships_count?: number | null
          metadata?: Json | null
          original_tenant_id?: string
          tenant_name?: string
          tenant_slug?: string
          trial_started_at?: string | null
        }
        Relationships: []
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
          revoked_at: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["digital_card_status"]
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
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["digital_card_status"]
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
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["digital_card_status"]
          tenant_id?: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_cards_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "membership_verification"
            referencedColumns: ["membership_id"]
          },
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
          is_official: boolean
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
          is_official?: boolean
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
          is_official?: boolean
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      document_public_tokens: {
        Row: {
          created_at: string
          document_id: string
          document_type: Database["public"]["Enums"]["institutional_document_type"]
          revoked_at: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: Database["public"]["Enums"]["institutional_document_type"]
          revoked_at?: string | null
          tenant_id: string
          token?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: Database["public"]["Enums"]["institutional_document_type"]
          revoked_at?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_public_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "document_public_tokens_tenant_id_fkey"
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      event_bracket_matches: {
        Row: {
          athlete1_registration_id: string | null
          athlete2_registration_id: string | null
          bracket_id: string
          category_id: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          meta: Json
          position: number
          recorded_by: string | null
          round: number
          status: string
          tenant_id: string
          updated_at: string
          winner_registration_id: string | null
        }
        Insert: {
          athlete1_registration_id?: string | null
          athlete2_registration_id?: string | null
          bracket_id: string
          category_id: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          meta?: Json
          position: number
          recorded_by?: string | null
          round: number
          status?: string
          tenant_id: string
          updated_at?: string
          winner_registration_id?: string | null
        }
        Update: {
          athlete1_registration_id?: string | null
          athlete2_registration_id?: string | null
          bracket_id?: string
          category_id?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          meta?: Json
          position?: number
          recorded_by?: string | null
          round?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          winner_registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_bracket_matches_athlete1_registration_id_fkey"
            columns: ["athlete1_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_athlete2_registration_id_fkey"
            columns: ["athlete2_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_bracket_id_fkey"
            columns: ["bracket_id"]
            isOneToOne: false
            referencedRelation: "event_brackets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "event_bracket_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bracket_matches_winner_registration_id_fkey"
            columns: ["winner_registration_id"]
            isOneToOne: false
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_brackets: {
        Row: {
          category_id: string
          created_at: string
          deleted_at: string | null
          event_id: string
          generated_at: string
          generated_by: string | null
          id: string
          meta: Json
          notes: string | null
          published_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          category_id: string
          created_at?: string
          deleted_at?: string | null
          event_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          published_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          published_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_brackets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_brackets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_brackets_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_brackets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "event_brackets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          belt_max_id: string | null
          belt_min_id: string | null
          created_at: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          event_id: string
          gender: Database["public"]["Enums"]["category_gender"] | null
          id: string
          is_active: boolean | null
          max_age: number | null
          max_participants: number | null
          max_weight: number | null
          min_age: number | null
          min_weight: number | null
          name: string
          price_cents: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          belt_max_id?: string | null
          belt_min_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id: string
          gender?: Database["public"]["Enums"]["category_gender"] | null
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          max_participants?: number | null
          max_weight?: number | null
          min_age?: number | null
          min_weight?: number | null
          name: string
          price_cents?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          belt_max_id?: string | null
          belt_min_id?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          event_id?: string
          gender?: Database["public"]["Enums"]["category_gender"] | null
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          max_participants?: number | null
          max_weight?: number | null
          min_age?: number | null
          min_weight?: number | null
          name?: string
          price_cents?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_categories_belt_max_id_fkey"
            columns: ["belt_max_id"]
            isOneToOne: false
            referencedRelation: "grading_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_categories_belt_min_id_fkey"
            columns: ["belt_min_id"]
            isOneToOne: false
            referencedRelation: "grading_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_categories_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "event_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          athlete_id: string
          category_id: string
          created_at: string | null
          event_id: string
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          registered_by: string | null
          status: Database["public"]["Enums"]["event_registration_status"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          category_id: string
          created_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          registered_by?: string | null
          status?: Database["public"]["Enums"]["event_registration_status"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          category_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          registered_by?: string | null
          status?: Database["public"]["Enums"]["event_registration_status"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "event_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_results: {
        Row: {
          athlete_id: string
          category_id: string
          created_at: string | null
          created_by: string | null
          event_id: string
          id: string
          notes: string | null
          position: number
          tenant_id: string
        }
        Insert: {
          athlete_id: string
          category_id: string
          created_at?: string | null
          created_by?: string | null
          event_id: string
          id?: string
          notes?: string | null
          position: number
          tenant_id: string
        }
        Update: {
          athlete_id?: string
          category_id?: string
          created_at?: string | null
          created_by?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes_public_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "event_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_url: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          end_date: string
          id: string
          is_public: boolean
          location: string | null
          name: string
          sport_type: string | null
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_public?: boolean
          location?: string | null
          name: string
          sport_type?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_public?: boolean
          location?: string | null
          name?: string
          sport_type?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      federation_roles: {
        Row: {
          created_at: string
          federation_id: string
          id: string
          role: Database["public"]["Enums"]["federation_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          federation_id: string
          id?: string
          role: Database["public"]["Enums"]["federation_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          federation_id?: string
          id?: string
          role?: Database["public"]["Enums"]["federation_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "federation_roles_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
        ]
      }
      federation_tenants: {
        Row: {
          federation_id: string
          joined_at: string
          left_at: string | null
          tenant_id: string
        }
        Insert: {
          federation_id: string
          joined_at?: string
          left_at?: string | null
          tenant_id: string
        }
        Update: {
          federation_id?: string
          joined_at?: string
          left_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "federation_tenants_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federation_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "federation_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      federations: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["federation_status"]
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["federation_status"]
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["federation_status"]
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
          applicant_data: Json | null
          applicant_profile_id: string | null
          athlete_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_profile_id: string | null
          created_at: string | null
          currency: string
          documents_uploaded: Json | null
          end_date: string | null
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id: string | null
          price_cents: number
          rejected_at: string | null
          rejected_by_profile_id: string | null
          rejection_reason: string | null
          renewal_reminder_sent: boolean | null
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
          applicant_data?: Json | null
          applicant_profile_id?: string | null
          athlete_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          currency?: string
          documents_uploaded?: Json | null
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id?: string | null
          price_cents?: number
          rejected_at?: string | null
          rejected_by_profile_id?: string | null
          rejection_reason?: string | null
          renewal_reminder_sent?: boolean | null
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
          applicant_data?: Json | null
          applicant_profile_id?: string | null
          athlete_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          currency?: string
          documents_uploaded?: Json | null
          end_date?: string | null
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preferred_coach_id?: string | null
          price_cents?: number
          rejected_at?: string | null
          rejected_by_profile_id?: string | null
          rejection_reason?: string | null
          renewal_reminder_sent?: boolean | null
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      observability_dismissed_alerts: {
        Row: {
          alert_id: string
          dismissed_at: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          alert_id: string
          dismissed_at?: string
          id?: string
          source?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          dismissed_at?: string
          id?: string
          source?: string
          user_id?: string
        }
        Relationships: []
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
      platform_landing_config: {
        Row: {
          hero_enabled: boolean
          hero_image_url: string | null
          id: string
          updated_at: string
        }
        Insert: {
          hero_enabled?: boolean
          hero_image_url?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          hero_enabled?: boolean
          hero_image_url?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_partners: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          logo_url: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          logo_url: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          logo_url?: string
          name?: string
        }
        Relationships: []
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
          wizard_completed: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          wizard_completed?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          wizard_completed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          current_hash: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          operation: string | null
          previous_hash: string | null
          severity: Database["public"]["Enums"]["security_severity"]
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_hash?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          operation?: string | null
          previous_hash?: string | null
          severity?: Database["public"]["Enums"]["security_severity"]
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_hash?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          operation?: string | null
          previous_hash?: string | null
          severity?: Database["public"]["Enums"]["security_severity"]
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          stripe_price_id_live: string | null
          stripe_price_id_test: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          stripe_price_id_live?: string | null
          stripe_price_id_test?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          stripe_price_id_live?: string | null
          stripe_price_id_test?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      superadmin_impersonations: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          ended_at: string | null
          ended_by_profile_id: string | null
          expires_at: string
          id: string
          metadata: Json | null
          reason: string | null
          status: string
          superadmin_user_id: string
          target_tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          ended_at?: string | null
          ended_by_profile_id?: string | null
          expires_at: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          status?: string
          superadmin_user_id: string
          target_tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          ended_at?: string | null
          ended_by_profile_id?: string | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          status?: string
          superadmin_user_id?: string
          target_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_impersonations_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superadmin_impersonations_ended_by_profile_id_fkey"
            columns: ["ended_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superadmin_impersonations_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "superadmin_impersonations_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
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
          deletion_reason: string | null
          grace_period_ends_at: string | null
          id: string
          is_manual_override: boolean | null
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          plan_name: string
          plan_price_id: string
          scheduled_delete_at: string | null
          status: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end_notification_sent: boolean | null
          trial_expires_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          deletion_reason?: string | null
          grace_period_ends_at?: string | null
          id?: string
          is_manual_override?: boolean | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          plan_name?: string
          plan_price_id?: string
          scheduled_delete_at?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end_notification_sent?: boolean | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          deletion_reason?: string | null
          grace_period_ends_at?: string | null
          id?: string
          is_manual_override?: boolean | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          plan_name?: string
          plan_price_id?: string
          scheduled_delete_at?: string | null
          status?: Database["public"]["Enums"]["billing_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_end_notification_sent?: boolean | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
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
          creation_source: string
          default_locale: string | null
          description: string | null
          diploma_template_url: string | null
          id: string
          is_active: boolean | null
          lifecycle_status: Database["public"]["Enums"]["tenant_lifecycle_status"]
          logo_url: string | null
          name: string
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          onboarding_completed_by: string | null
          primary_color: string | null
          slug: string
          sport_types: string[] | null
          status: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          billing_email?: string | null
          card_template_url?: string | null
          created_at?: string | null
          creation_source?: string
          default_locale?: string | null
          description?: string | null
          diploma_template_url?: string | null
          id?: string
          is_active?: boolean | null
          lifecycle_status?: Database["public"]["Enums"]["tenant_lifecycle_status"]
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_completed_by?: string | null
          primary_color?: string | null
          slug: string
          sport_types?: string[] | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_email?: string | null
          card_template_url?: string | null
          created_at?: string | null
          creation_source?: string
          default_locale?: string | null
          description?: string | null
          diploma_template_url?: string | null
          id?: string
          is_active?: boolean | null
          lifecycle_status?: Database["public"]["Enums"]["tenant_lifecycle_status"]
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_completed_by?: string | null
          primary_color?: string | null
          slug?: string
          sport_types?: string[] | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_onboarding_completed_by_fkey"
            columns: ["onboarding_completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
          },
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
      athlete_current_grading: {
        Row: {
          athlete_id: string | null
          grading_level_id: string | null
          level_code: string | null
          level_name: string | null
          order_index: number | null
          promotion_date: string | null
          scheme_name: string | null
          sport_type: string | null
          tenant_id: string | null
        }
        Relationships: [
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
            referencedRelation: "membership_verification"
            referencedColumns: ["tenant_id"]
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
      job_execution_summary: {
        Row: {
          failures_24h: number | null
          items_processed_24h: number | null
          items_processed_7d: number | null
          job_name: string | null
          last_failure_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          runs_24h: number | null
          runs_7d: number | null
          success_24h: number | null
        }
        Relationships: []
      }
      membership_verification: {
        Row: {
          athlete_name: string | null
          card_created_at: string | null
          card_valid_until: string | null
          content_hash_sha256: string | null
          digital_card_id: string | null
          end_date: string | null
          grading_sport_type: string | null
          level_code: string | null
          level_name: string | null
          membership_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          pdf_url: string | null
          scheme_name: string | null
          sport_types: string[] | null
          start_date: string | null
          status: Database["public"]["Enums"]["membership_status"] | null
          tenant_id: string | null
          tenant_name: string | null
          tenant_slug: string | null
          type: Database["public"]["Enums"]["membership_type"] | null
        }
        Relationships: []
      }
      observability_critical_events: {
        Row: {
          category: string | null
          created_at: string | null
          event_type: string | null
          id: string | null
          metadata: Json | null
          severity: string | null
          source: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      security_timeline: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          operation: string | null
          reason_code: string | null
          severity: string | null
          source: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Relationships: []
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
      can_act_as_federation: {
        Args: { _federation_id: string; _user_id: string }
        Returns: boolean
      }
      can_approve_membership: {
        Args: { _membership_id: string }
        Returns: boolean
      }
      can_view_federation: {
        Args: { _federation_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      coach_has_issued_diploma: {
        Args: { _coach_id: string }
        Returns: boolean
      }
      explain_security_decision: {
        Args: { p_decision_id: string }
        Returns: {
          created_at: string
          decision_type: string
          explanation: string
          id: string
          metadata: Json
          operation: string
          reason_code: string
          severity: string
        }[]
      }
      find_memberships_by_tmp_storage_path: {
        Args: { p_storage_path: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      generate_document_token: {
        Args: {
          p_document_id: string
          p_document_type: Database["public"]["Enums"]["institutional_document_type"]
          p_tenant_id: string
        }
        Returns: string
      }
      generate_event_bracket_rpc: {
        Args: {
          p_category_id: string
          p_event_id: string
          p_generated_by: string
          p_registrations: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      get_next_diploma_serial: {
        Args: { p_sport_type: string; p_tenant_id: string }
        Returns: string
      }
      get_security_timeline: {
        Args: {
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_operation?: string
          p_severity?: string
          p_source?: string
          p_tenant_id?: string
          p_to_date?: string
        }
        Returns: {
          created_at: string
          event_type: string
          id: string
          ip_address: string
          metadata: Json
          operation: string
          reason_code: string
          severity: string
          source: string
          tenant_id: string
          user_agent: string
          user_id: string
        }[]
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_federation_role: {
        Args: {
          _federation_id: string
          _role: Database["public"]["Enums"]["federation_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      is_council_member: {
        Args: { _council_id: string; _user_id: string }
        Returns: boolean
      }
      is_federation_admin: { Args: { _user_id: string }; Returns: boolean }
      is_head_coach_of_academy: {
        Args: { _academy_id: string }
        Returns: boolean
      }
      is_institutional_document_valid: {
        Args: {
          p_billing_status: string
          p_document_status: string
          p_revoked_at?: string
          p_tenant_status: string
        }
        Returns: boolean
      }
      is_member_of_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant_id: string }; Returns: boolean }
      membership_has_digital_card: {
        Args: { _membership_id: string }
        Returns: boolean
      }
      record_match_result_rpc: {
        Args: {
          p_match_id: string
          p_recorded_by: string
          p_winner_registration_id: string
        }
        Returns: Json
      }
      revoke_document_token: { Args: { p_token: string }; Returns: boolean }
      soft_delete_event: { Args: { p_event_id: string }; Returns: boolean }
      tenant_has_active_billing: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      user_has_completed_wizard: {
        Args: { _user_id: string }
        Returns: boolean
      }
      user_has_tenant_context: { Args: { _user_id: string }; Returns: boolean }
      verify_decision_log_chain: {
        Args: { p_tenant_id: string }
        Returns: {
          actual_previous: string
          expected_previous: string
          is_valid: boolean
          log_id: string
        }[]
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
        | "TRIAL_EXPIRED"
        | "PENDING_DELETE"
      category_gender: "MALE" | "FEMALE" | "MIXED"
      council_decision_status: "OPEN" | "APPROVED" | "REJECTED"
      council_decision_type:
        | "TENANT_ADMISSION"
        | "TENANT_SUSPENSION"
        | "POLICY_APPROVAL"
      council_role: "CHAIR" | "MEMBER"
      digital_card_status:
        | "DRAFT"
        | "ACTIVE"
        | "SUSPENDED"
        | "EXPIRED"
        | "REVOKED"
      diploma_status: "DRAFT" | "ISSUED" | "REVOKED"
      document_type:
        | "ID_DOCUMENT"
        | "MEDICAL_CERTIFICATE"
        | "ADDRESS_PROOF"
        | "OTHER"
      event_registration_status: "PENDING" | "CONFIRMED" | "CANCELED"
      event_status:
        | "DRAFT"
        | "PUBLISHED"
        | "REGISTRATION_OPEN"
        | "REGISTRATION_CLOSED"
        | "ONGOING"
        | "FINISHED"
        | "ARCHIVED"
        | "CANCELLED"
      federation_role: "FED_ADMIN" | "COUNCIL_MEMBER" | "OBSERVER"
      federation_status: "ACTIVE" | "SUSPENDED"
      gender_type: "MALE" | "FEMALE" | "OTHER"
      guardian_relationship: "PARENT" | "GUARDIAN" | "OTHER"
      institutional_document_type: "digital_card" | "diploma"
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
      security_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      tenant_lifecycle_status: "SETUP" | "ACTIVE" | "BLOCKED"
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
        "TRIAL_EXPIRED",
        "PENDING_DELETE",
      ],
      category_gender: ["MALE", "FEMALE", "MIXED"],
      council_decision_status: ["OPEN", "APPROVED", "REJECTED"],
      council_decision_type: [
        "TENANT_ADMISSION",
        "TENANT_SUSPENSION",
        "POLICY_APPROVAL",
      ],
      council_role: ["CHAIR", "MEMBER"],
      digital_card_status: [
        "DRAFT",
        "ACTIVE",
        "SUSPENDED",
        "EXPIRED",
        "REVOKED",
      ],
      diploma_status: ["DRAFT", "ISSUED", "REVOKED"],
      document_type: [
        "ID_DOCUMENT",
        "MEDICAL_CERTIFICATE",
        "ADDRESS_PROOF",
        "OTHER",
      ],
      event_registration_status: ["PENDING", "CONFIRMED", "CANCELED"],
      event_status: [
        "DRAFT",
        "PUBLISHED",
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
        "ONGOING",
        "FINISHED",
        "ARCHIVED",
        "CANCELLED",
      ],
      federation_role: ["FED_ADMIN", "COUNCIL_MEMBER", "OBSERVER"],
      federation_status: ["ACTIVE", "SUSPENDED"],
      gender_type: ["MALE", "FEMALE", "OTHER"],
      guardian_relationship: ["PARENT", "GUARDIAN", "OTHER"],
      institutional_document_type: ["digital_card", "diploma"],
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
      security_severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      tenant_lifecycle_status: ["SETUP", "ACTIVE", "BLOCKED"],
    },
  },
} as const
