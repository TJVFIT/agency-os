/**
 * Database types — hand-written to mirror supabase/migrations exactly,
 * in the same shape `supabase gen types typescript` produces.
 *
 * TODO(after `supabase link`): regenerate with
 *   pnpm supabase gen types typescript --linked > lib/db/types.ts
 * and diff against this file — they must agree.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Database['public']['Enums']['user_role'];
          telegram_chat_id: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          role?: Database['public']['Enums']['user_role'];
          telegram_chat_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: Database['public']['Enums']['user_role'];
          telegram_chat_id?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry: string;
          langs: string[];
          brand_profile: Json;
          glossary: Json;
          hashtag_bank: string[];
          colors: Json;
          logo_asset_id: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          industry?: string;
          langs?: string[];
          brand_profile?: Json;
          glossary?: Json;
          hashtag_bank?: string[];
          colors?: Json;
          logo_asset_id?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          industry?: string;
          langs?: string[];
          brand_profile?: Json;
          glossary?: Json;
          hashtag_bank?: string[];
          colors?: Json;
          logo_asset_id?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_logo_fk';
            columns: ['logo_asset_id'];
            isOneToOne: false;
            referencedRelation: 'assets';
            referencedColumns: ['id'];
          },
        ];
      };
      client_social_accounts: {
        Row: {
          id: string;
          client_id: string;
          platform: string;
          handle: string;
          postiz_integration_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          platform: string;
          handle: string;
          postiz_integration_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          platform?: string;
          handle?: string;
          postiz_integration_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_social_accounts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      assets: {
        Row: {
          id: string;
          client_id: string;
          kind: Database['public']['Enums']['asset_kind'];
          r2_key: string;
          original_name: string;
          width: number | null;
          height: number | null;
          duration_s: number | null;
          variants: Json;
          source: Database['public']['Enums']['asset_source'];
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          kind: Database['public']['Enums']['asset_kind'];
          r2_key: string;
          original_name?: string;
          width?: number | null;
          height?: number | null;
          duration_s?: number | null;
          variants?: Json;
          source?: Database['public']['Enums']['asset_source'];
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          kind?: Database['public']['Enums']['asset_kind'];
          r2_key?: string;
          original_name?: string;
          width?: number | null;
          height?: number | null;
          duration_s?: number | null;
          variants?: Json;
          source?: Database['public']['Enums']['asset_source'];
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assets_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assets_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cards: {
        Row: {
          id: string;
          client_id: string;
          type: Database['public']['Enums']['card_type'];
          title: string;
          status: Database['public']['Enums']['card_status'];
          assignee: string | null;
          due_at: string | null;
          scheduled_at: string | null;
          platforms: string[];
          priority: number;
          tags: string[];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          type?: Database['public']['Enums']['card_type'];
          title: string;
          status?: Database['public']['Enums']['card_status'];
          assignee?: string | null;
          due_at?: string | null;
          scheduled_at?: string | null;
          platforms?: string[];
          priority?: number;
          tags?: string[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          type?: Database['public']['Enums']['card_type'];
          title?: string;
          status?: Database['public']['Enums']['card_status'];
          assignee?: string | null;
          due_at?: string | null;
          scheduled_at?: string | null;
          platforms?: string[];
          priority?: number;
          tags?: string[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cards_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_assignee_fkey';
            columns: ['assignee'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      card_contents: {
        Row: {
          card_id: string;
          lang: string;
          caption: string;
          hashtags: string[];
          media_asset_ids: string[];
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          card_id: string;
          lang: string;
          caption?: string;
          hashtags?: string[];
          media_asset_ids?: string[];
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          card_id?: string;
          lang?: string;
          caption?: string;
          hashtags?: string[];
          media_asset_ids?: string[];
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_contents_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'card_contents_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          card_id: string;
          author: string | null;
          body: string;
          asset_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          author?: string | null;
          body: string;
          asset_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          author?: string | null;
          body?: string;
          asset_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_author_fkey';
            columns: ['author'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'assets';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_log: {
        Row: {
          id: number;
          actor: string | null;
          client_id: string | null;
          card_id: string | null;
          action: string;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          actor?: string | null;
          client_id?: string | null;
          card_id?: string | null;
          action: string;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          actor?: string | null;
          client_id?: string | null;
          card_id?: string | null;
          action?: string;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_log_actor_fkey';
            columns: ['actor'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_jobs: {
        Row: {
          id: string;
          kind: Database['public']['Enums']['job_kind'];
          payload: Json;
          status: Database['public']['Enums']['job_status'];
          result: Json | null;
          error: string | null;
          attempts: number;
          run_after: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: Database['public']['Enums']['job_kind'];
          payload?: Json;
          status?: Database['public']['Enums']['job_status'];
          result?: Json | null;
          error?: string | null;
          attempts?: number;
          run_after?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: Database['public']['Enums']['job_kind'];
          payload?: Json;
          status?: Database['public']['Enums']['job_status'];
          result?: Json | null;
          error?: string | null;
          attempts?: number;
          run_after?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_jobs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_links: {
        Row: {
          id: string;
          client_id: string;
          token: string;
          week_start: string;
          expires_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          token: string;
          week_start: string;
          expires_at: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          token?: string;
          week_start?: string;
          expires_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_links_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_links_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_actions: {
        Row: {
          id: string;
          approval_link_id: string;
          card_id: string;
          decision: Database['public']['Enums']['approval_decision'];
          comment: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          approval_link_id: string;
          card_id: string;
          decision: Database['public']['Enums']['approval_decision'];
          comment?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          approval_link_id?: string;
          card_id?: string;
          decision?: Database['public']['Enums']['approval_decision'];
          comment?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_actions_approval_link_id_fkey';
            columns: ['approval_link_id'];
            isOneToOne: false;
            referencedRelation: 'approval_links';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_actions_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          client_id: string;
          week_start: string;
          body_md: string;
          metrics: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          week_start: string;
          body_md?: string;
          metrics?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          week_start?: string;
          body_md?: string;
          metrics?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      my_role: {
        Args: Record<string, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      claim_ai_jobs: {
        Args: { batch?: number };
        Returns: Database['public']['Tables']['ai_jobs']['Row'][];
      };
    };
    Enums: {
      user_role: 'admin' | 'manager' | 'member';
      card_type: 'post' | 'reel' | 'story' | 'reply' | 'other';
      card_status:
        | 'idea'
        | 'copy_draft'
        | 'visual_ready'
        | 'translated'
        | 'approved'
        | 'scheduled'
        | 'published'
        | 'archived';
      asset_kind: 'image' | 'video' | 'other';
      asset_source: 'upload' | 'telegram' | 'ai' | 'render';
      job_kind:
        | 'caption'
        | 'translate'
        | 'reply'
        | 'plan'
        | 'report'
        | 'image_variants'
        | 'bg_remove'
        | 'render_reel'
        | 'publish';
      job_status: 'queued' | 'running' | 'done' | 'error';
      approval_decision: 'approved' | 'rejected';
    };
    CompositeTypes: Record<string, never>;
  };
}

// Convenience aliases used across the app and worker.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

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

export const PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'youtube',
  'linkedin',
] as const;
export type Platform = (typeof PLATFORMS)[number];
