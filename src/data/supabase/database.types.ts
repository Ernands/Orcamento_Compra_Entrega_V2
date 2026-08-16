export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type EmptyRelationships = [];

export interface Database {
  public: {
    Tables: {
      perfis: {
        Row: {
          id: string;
          chave: string;
          nome: string;
          descricao: string | null;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chave: string;
          nome: string;
          descricao?: string | null;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['perfis']['Insert']>;
        Relationships: EmptyRelationships;
      };
      usuarios: {
        Row: {
          id: string;
          codigo_negocio: string;
          auth_user_id: string;
          perfil_id: string;
          nome: string;
          cpf_last4: string;
          status: 'active' | 'inactive' | 'blocked';
          must_change_password: boolean;
          all_stores: boolean;
          last_login_at: string | null;
          password_changed_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          codigo_negocio: string;
          auth_user_id: string;
          perfil_id: string;
          nome: string;
          cpf_last4: string;
          status?: 'active' | 'inactive' | 'blocked';
          must_change_password?: boolean;
          all_stores?: boolean;
          last_login_at?: string | null;
          password_changed_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['usuarios']['Insert']>;
        Relationships: EmptyRelationships;
      };
      lojas: {
        Row: {
          id: string;
          codigo_negocio: string;
          codigo_legado: string | null;
          nome: string;
          cidade: string;
          uf: string;
          endereco: string | null;
          responsavel_usuario_id: string | null;
          status: 'planning' | 'active' | 'inactive';
          data_inauguracao_planejada: string | null;
          data_inauguracao_real: string | null;
          observacoes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          codigo_negocio: string;
          codigo_legado?: string | null;
          nome: string;
          cidade: string;
          uf: string;
          endereco?: string | null;
          responsavel_usuario_id?: string | null;
          status?: 'planning' | 'active' | 'inactive';
          data_inauguracao_planejada?: string | null;
          data_inauguracao_real?: string | null;
          observacoes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['lojas']['Insert']>;
        Relationships: EmptyRelationships;
      };
      usuario_lojas: {
        Row: {
          id: string;
          usuario_id: string;
          loja_id: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          usuario_id: string;
          loja_id: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['usuario_lojas']['Insert']>;
        Relationships: EmptyRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_create_user_record: {
        Args: {
          p_actor_auth_user_id: string | null;
          p_auth_user_id: string;
          p_technical_email: string;
          p_cpf_lookup: string;
          p_cpf_last4: string;
          p_name: string;
          p_profile_id: string;
          p_store_ids: string[];
          p_all_stores: boolean;
          p_status: 'active' | 'inactive' | 'blocked';
          p_origin: string;
        };
        Returns: string;
      };
      get_my_capabilities: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
