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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor: string | null
          card_id: string | null
          client_id: string | null
          created_at: string
          detail: Json
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          card_id?: string | null
          client_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
        }
        Update: {
          action?: string
          actor?: string | null
          card_id?: string | null
          client_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_tasks: {
        Row: {
          budget: number
          card_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string | null
          id: string
          objective: string
          platform: string
          results: Json
          starts_on: string | null
          status: Database["public"]["Enums"]["ad_status"]
        }
        Insert: {
          budget?: number
          card_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          id?: string
          objective?: string
          platform: string
          results?: Json
          starts_on?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
        }
        Update: {
          budget?: number
          card_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          id?: string
          objective?: string
          platform?: string
          results?: Json
          starts_on?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ad_tasks_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["job_kind"]
          payload: Json
          result: Json | null
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["job_kind"]
          payload?: Json
          result?: Json | null
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["job_kind"]
          payload?: Json
          result?: Json | null
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          approval_link_id: string
          card_id: string
          comment: string
          created_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
        }
        Insert: {
          approval_link_id: string
          card_id: string
          comment?: string
          created_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
        }
        Update: {
          approval_link_id?: string
          card_id?: string
          comment?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_approval_link_id_fkey"
            columns: ["approval_link_id"]
            isOneToOne: false
            referencedRelation: "approval_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_links: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          token: string
          week_start: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          token: string
          week_start: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          token?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          client_id: string
          created_at: string
          duration_s: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          original_name: string
          r2_key: string
          source: Database["public"]["Enums"]["asset_source"]
          uploaded_by: string | null
          variants: Json
          width: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          original_name?: string
          r2_key: string
          source?: Database["public"]["Enums"]["asset_source"]
          uploaded_by?: string | null
          variants?: Json
          width?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          original_name?: string
          r2_key?: string
          source?: Database["public"]["Enums"]["asset_source"]
          uploaded_by?: string | null
          variants?: Json
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          profile_id: string
          role: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          key: string
          mode: Database["public"]["Enums"]["automation_mode"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          mode?: Database["public"]["Enums"]["automation_mode"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          mode?: Database["public"]["Enums"]["automation_mode"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_contents: {
        Row: {
          caption: string
          card_id: string
          hashtags: string[]
          lang: string
          media_asset_ids: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          caption?: string
          card_id: string
          hashtags?: string[]
          lang: string
          media_asset_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          caption?: string
          card_id?: string
          hashtags?: string[]
          lang?: string
          media_asset_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_contents_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_contents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          assignee: string | null
          client_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          platforms: string[]
          priority: number
          scheduled_at: string | null
          status: Database["public"]["Enums"]["card_status"]
          tags: string[]
          task_type_id: string | null
          title: string
          type: Database["public"]["Enums"]["card_type"]
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          platforms?: string[]
          priority?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          tags?: string[]
          task_type_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          platforms?: string[]
          priority?: number
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          tags?: string[]
          task_type_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      client_availability: {
        Row: {
          client_id: string
          created_at: string
          ends_at: string
          id: string
          note: string
          portal_link_id: string | null
          starts_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          ends_at: string
          id?: string
          note?: string
          portal_link_id?: string | null
          starts_at: string
        }
        Update: {
          client_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          note?: string
          portal_link_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_availability_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_availability_portal_link_id_fkey"
            columns: ["portal_link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ideas: {
        Row: {
          body: string
          card_id: string | null
          client_id: string
          created_at: string
          id: string
          portal_link_id: string | null
          refined: Json | null
          status: Database["public"]["Enums"]["idea_status"]
          title: string
        }
        Insert: {
          body?: string
          card_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          portal_link_id?: string | null
          refined?: Json | null
          status?: Database["public"]["Enums"]["idea_status"]
          title: string
        }
        Update: {
          body?: string
          card_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          portal_link_id?: string | null
          refined?: Json | null
          status?: Database["public"]["Enums"]["idea_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ideas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ideas_portal_link_id_fkey"
            columns: ["portal_link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          asset_id: string | null
          author: string | null
          body: string
          card_id: string | null
          client_id: string
          created_at: string
          id: string
          portal_link_id: string | null
          read_by_client: boolean
          read_by_team: boolean
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          asset_id?: string | null
          author?: string | null
          body: string
          card_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          portal_link_id?: string | null
          read_by_client?: boolean
          read_by_team?: boolean
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          asset_id?: string | null
          author?: string | null
          body?: string
          card_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          portal_link_id?: string | null
          read_by_client?: boolean
          read_by_team?: boolean
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_author_fkey"
            columns: ["author"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_portal_link_id_fkey"
            columns: ["portal_link_id"]
            isOneToOne: false
            referencedRelation: "portal_links"
            referencedColumns: ["id"]
          },
        ]
      }
      client_packages: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          currency: string
          id: string
          monthly: Json
          name: string
          price: number
          starts_on: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          monthly?: Json
          name: string
          price?: number
          starts_on?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          monthly?: Json
          name?: string
          price?: number
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_social_accounts: {
        Row: {
          client_id: string
          created_at: string
          handle: string
          id: string
          platform: string
          postiz_integration_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          handle: string
          id?: string
          platform: string
          postiz_integration_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          handle?: string
          id?: string
          platform?: string
          postiz_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          brand_profile: Json
          colors: Json
          contact: Json
          created_at: string
          glossary: Json
          hashtag_bank: string[]
          id: string
          industry: string
          langs: string[]
          location: Json
          logo_asset_id: string | null
          name: string
          shoot_block_minutes: number | null
          slug: string
        }
        Insert: {
          active?: boolean
          brand_profile?: Json
          colors?: Json
          contact?: Json
          created_at?: string
          glossary?: Json
          hashtag_bank?: string[]
          id?: string
          industry?: string
          langs?: string[]
          location?: Json
          logo_asset_id?: string | null
          name: string
          shoot_block_minutes?: number | null
          slug: string
        }
        Update: {
          active?: boolean
          brand_profile?: Json
          colors?: Json
          contact?: Json
          created_at?: string
          glossary?: Json
          hashtag_bank?: string[]
          id?: string
          industry?: string
          langs?: string[]
          location?: Json
          logo_asset_id?: string | null
          name?: string
          shoot_block_minutes?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_logo_fk"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          asset_id: string | null
          author: string | null
          body: string
          card_id: string
          created_at: string
          id: string
        }
        Insert: {
          asset_id?: string | null
          author?: string | null
          body: string
          card_id: string
          created_at?: string
          id?: string
        }
        Update: {
          asset_id?: string | null
          author?: string | null
          body?: string
          card_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_author_fkey"
            columns: ["author"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          notes: string
          serial: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          notes?: string
          serial?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          notes?: string
          serial?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_on: string
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          note: string
          paid_on: string | null
          status: Database["public"]["Enums"]["payment_status"]
          title: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          note?: string
          paid_on?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          title: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          note?: string
          paid_on?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          token: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          token: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          telegram_chat_id: number | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          telegram_chat_id?: number | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          telegram_chat_id?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          profile_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          profile_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          body_md: string
          client_id: string
          created_at: string
          id: string
          metrics: Json
          week_start: string
        }
        Insert: {
          body_md?: string
          client_id: string
          created_at?: string
          id?: string
          metrics?: Json
          week_start: string
        }
        Update: {
          body_md?: string
          client_id?: string
          created_at?: string
          id?: string
          metrics?: Json
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      shoots: {
        Row: {
          brief_md: string
          card_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          crew: string[]
          ends_at: string
          equipment_ids: string[]
          id: string
          location: Json
          starts_at: string
          status: Database["public"]["Enums"]["shoot_status"]
          tasks_opened: boolean
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          brief_md?: string
          card_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          crew?: string[]
          ends_at: string
          equipment_ids?: string[]
          id?: string
          location?: Json
          starts_at: string
          status?: Database["public"]["Enums"]["shoot_status"]
          tasks_opened?: boolean
          title: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          brief_md?: string
          card_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew?: string[]
          ends_at?: string
          equipment_ids?: string[]
          id?: string
          location?: Json
          starts_at?: string
          status?: Database["public"]["Enums"]["shoot_status"]
          tasks_opened?: boolean
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shoots_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoots_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leaves: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          note: string
          profile_id: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          note?: string
          profile_id: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          note?: string
          profile_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leaves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          body: Json
          card_id: string | null
          client_id: string | null
          created_at: string
          domain: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          title: string
        }
        Insert: {
          body?: Json
          card_id?: string | null
          client_id?: string | null
          created_at?: string
          domain: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          title: string
        }
        Update: {
          body?: Json
          card_id?: string | null
          client_id?: string | null
          created_at?: string
          domain?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          active: boolean
          auto_open: boolean
          created_at: string
          default_assignee: string | null
          default_minutes: number
          depends_on: string | null
          id: string
          name: string
          priority: number
          requires_review: boolean
          workload_points: number
        }
        Insert: {
          active?: boolean
          auto_open?: boolean
          created_at?: string
          default_assignee?: string | null
          default_minutes?: number
          depends_on?: string | null
          id?: string
          name: string
          priority?: number
          requires_review?: boolean
          workload_points?: number
        }
        Update: {
          active?: boolean
          auto_open?: boolean
          created_at?: string
          default_assignee?: string | null
          default_minutes?: number
          depends_on?: string | null
          id?: string
          name?: string
          priority?: number
          requires_review?: boolean
          workload_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_types_default_assignee_fkey"
            columns: ["default_assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_types_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          profile_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          profile_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          reason: string
          starts_on: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          reason?: string
          starts_on: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          reason?: string
          starts_on?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          driver: string | null
          id: string
          name: string
          notes: string
          plate: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          created_at?: string
          driver?: string | null
          id?: string
          name: string
          notes?: string
          plate?: string
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          driver?: string | null
          id?: string
          name?: string
          notes?: string
          plate?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_fkey"
            columns: ["driver"]
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
      claim_ai_jobs: {
        Args: { batch?: number }
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["job_kind"]
          payload: Json
          result: Json | null
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      ad_status: "planned" | "active" | "done" | "cancelled"
      approval_decision: "approved" | "rejected"
      asset_kind: "image" | "video" | "other"
      asset_source: "upload" | "telegram" | "ai" | "render" | "client"
      automation_mode: "suggest" | "semi" | "full"
      card_status:
        | "idea"
        | "copy_draft"
        | "visual_ready"
        | "translated"
        | "approved"
        | "scheduled"
        | "published"
        | "archived"
      card_type: "post" | "reel" | "story" | "reply" | "other"
      idea_status: "new" | "refined" | "accepted" | "rejected"
      job_kind:
        | "caption"
        | "translate"
        | "reply"
        | "plan"
        | "report"
        | "image_variants"
        | "bg_remove"
        | "render_reel"
        | "publish"
        | "idea_refine"
        | "scenario"
        | "poster"
        | "compliance"
        | "edit_video"
        | "edit_photo"
        | "chat"
      job_status: "queued" | "running" | "done" | "error"
      message_sender: "team" | "client"
      payment_kind: "package" | "extra"
      payment_status: "pending" | "paid" | "overdue"
      shoot_status: "planned" | "confirmed" | "done" | "cancelled"
      suggestion_status: "pending" | "accepted" | "dismissed"
      user_role: "admin" | "manager" | "member"
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

// Convenience aliases used across the app and worker.
export type Profile = Tables<'profiles'>;
export type Client = Tables<'clients'>;
export type ClientSocialAccount = Tables<'client_social_accounts'>;
export type Asset = Tables<'assets'>;
export type Card = Tables<'cards'>;
export type CardContent = Tables<'card_contents'>;
export type Comment = Tables<'comments'>;
export type ActivityEntry = Tables<'activity_log'>;
export type AiJob = Tables<'ai_jobs'>;
export type ApprovalLink = Tables<'approval_links'>;
export type ApprovalAction = Tables<'approval_actions'>;
export type Report = Tables<'reports'>;
export type PortalLink = Tables<'portal_links'>;
export type ClientIdea = Tables<'client_ideas'>;
export type ClientAvailability = Tables<'client_availability'>;
export type Vehicle = Tables<'vehicles'>;
export type StaffLeave = Tables<'staff_leaves'>;
export type Shoot = Tables<'shoots'>;
export type ClientPackage = Tables<'client_packages'>;
export type Payment = Tables<'payments'>;
export type AdTask = Tables<'ad_tasks'>;
export type AutomationSetting = Tables<'automation_settings'>;
export type Suggestion = Tables<'suggestions'>;
export type PushSubscription = Tables<'push_subscriptions'>;
export type ClientMessage = Tables<'client_messages'>;
export type AppSetting = Tables<'app_settings'>;
export type AssistantMessage = Tables<'assistant_messages'>;
export type Equipment = Tables<'equipment'>;
export type TaskType = Tables<'task_types'>;
export type VehicleBlock = Tables<'vehicle_blocks'>;

export const PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'youtube',
  'linkedin',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const Constants = {
  public: {
    Enums: {
      ad_status: ["planned", "active", "done", "cancelled"],
      approval_decision: ["approved", "rejected"],
      asset_kind: ["image", "video", "other"],
      asset_source: ["upload", "telegram", "ai", "render", "client"],
      automation_mode: ["suggest", "semi", "full"],
      card_status: [
        "idea",
        "copy_draft",
        "visual_ready",
        "translated",
        "approved",
        "scheduled",
        "published",
        "archived",
      ],
      card_type: ["post", "reel", "story", "reply", "other"],
      idea_status: ["new", "refined", "accepted", "rejected"],
      job_kind: [
        "caption",
        "translate",
        "reply",
        "plan",
        "report",
        "image_variants",
        "bg_remove",
        "render_reel",
        "publish",
        "idea_refine",
        "scenario",
        "poster",
        "compliance",
        "edit_video",
        "edit_photo",
        "chat",
      ],
      job_status: ["queued", "running", "done", "error"],
      message_sender: ["team", "client"],
      payment_kind: ["package", "extra"],
      payment_status: ["pending", "paid", "overdue"],
      shoot_status: ["planned", "confirmed", "done", "cancelled"],
      suggestion_status: ["pending", "accepted", "dismissed"],
      user_role: ["admin", "manager", "member"],
    },
  },
} as const
