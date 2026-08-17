export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      acoes: {
        Row: {
          chave: string;
          created_at: string;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          chave: string;
          created_at?: string;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          chave?: string;
          created_at?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_usuario_id: string | null;
          after_json: Json | null;
          before_json: Json | null;
          correlation_id: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_hash: string | null;
          occurred_at: string;
          origin: string;
        };
        Insert: {
          action: string;
          actor_usuario_id?: string | null;
          after_json?: Json | null;
          before_json?: Json | null;
          correlation_id?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_hash?: string | null;
          occurred_at?: string;
          origin: string;
        };
        Update: {
          action?: string;
          actor_usuario_id?: string | null;
          after_json?: Json | null;
          before_json?: Json | null;
          correlation_id?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_hash?: string | null;
          occurred_at?: string;
          origin?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_usuario_id_fkey';
            columns: ['actor_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      checklist_master_items: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          evidence_required: boolean;
          guidance: string | null;
          id: string;
          is_active: boolean;
          is_required: boolean;
          position: number;
          priority: Database['public']['Enums']['need_priority'];
          relative_due_days: number | null;
          responsibility_type: string | null;
          title: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          description?: string | null;
          evidence_required?: boolean;
          guidance?: string | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          position: number;
          priority?: Database['public']['Enums']['need_priority'];
          relative_due_days?: number | null;
          responsibility_type?: string | null;
          title: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          evidence_required?: boolean;
          guidance?: string | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          position?: number;
          priority?: Database['public']['Enums']['need_priority'];
          relative_due_days?: number | null;
          responsibility_type?: string | null;
          title?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'checklist_master_items_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_master_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      checklist_master_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          published_at: string | null;
          published_by: string | null;
          status: Database['public']['Enums']['checklist_version_status'];
          updated_at: string;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          status?: Database['public']['Enums']['checklist_version_status'];
          updated_at?: string;
          version_number?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          status?: Database['public']['Enums']['checklist_version_status'];
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'checklist_master_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'checklist_master_versions_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      lojas: {
        Row: {
          cidade: string;
          codigo_legado: string | null;
          codigo_negocio: string;
          created_at: string;
          created_by: string | null;
          data_inauguracao_planejada: string | null;
          data_inauguracao_real: string | null;
          endereco: string | null;
          id: string;
          nome: string;
          observacoes: string | null;
          responsavel_usuario_id: string | null;
          status: Database['public']['Enums']['store_status'];
          uf: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cidade: string;
          codigo_legado?: string | null;
          codigo_negocio?: string;
          created_at?: string;
          created_by?: string | null;
          data_inauguracao_planejada?: string | null;
          data_inauguracao_real?: string | null;
          endereco?: string | null;
          id?: string;
          nome: string;
          observacoes?: string | null;
          responsavel_usuario_id?: string | null;
          status?: Database['public']['Enums']['store_status'];
          uf: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cidade?: string;
          codigo_legado?: string | null;
          codigo_negocio?: string;
          created_at?: string;
          created_by?: string | null;
          data_inauguracao_planejada?: string | null;
          data_inauguracao_real?: string | null;
          endereco?: string | null;
          id?: string;
          nome?: string;
          observacoes?: string | null;
          responsavel_usuario_id?: string | null;
          status?: Database['public']['Enums']['store_status'];
          uf?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'lojas_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lojas_responsavel_usuario_id_fkey';
            columns: ['responsavel_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lojas_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      modulos: {
        Row: {
          ativo: boolean;
          chave: string;
          created_at: string;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          chave: string;
          created_at?: string;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          chave?: string;
          created_at?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      perfil_permissoes: {
        Row: {
          created_at: string;
          id: string;
          perfil_id: string;
          permissao_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          perfil_id: string;
          permissao_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          perfil_id?: string;
          permissao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'perfil_permissoes_perfil_id_fkey';
            columns: ['perfil_id'];
            isOneToOne: false;
            referencedRelation: 'perfis';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'perfil_permissoes_permissao_id_fkey';
            columns: ['permissao_id'];
            isOneToOne: false;
            referencedRelation: 'permissoes';
            referencedColumns: ['id'];
          },
        ];
      };
      perfis: {
        Row: {
          ativo: boolean;
          chave: string;
          created_at: string;
          descricao: string | null;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          chave: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          chave?: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      permissoes: {
        Row: {
          acao_id: string;
          ativo: boolean;
          chave: string;
          created_at: string;
          descricao: string | null;
          id: string;
          modulo_id: string;
          updated_at: string;
        };
        Insert: {
          acao_id: string;
          ativo?: boolean;
          chave: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          modulo_id: string;
          updated_at?: string;
        };
        Update: {
          acao_id?: string;
          ativo?: boolean;
          chave?: string;
          created_at?: string;
          descricao?: string | null;
          id?: string;
          modulo_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'permissoes_acao_id_fkey';
            columns: ['acao_id'];
            isOneToOne: false;
            referencedRelation: 'acoes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'permissoes_modulo_id_fkey';
            columns: ['modulo_id'];
            isOneToOne: false;
            referencedRelation: 'modulos';
            referencedColumns: ['id'];
          },
        ];
      };
      store_attachments: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          id: string;
          mime_type: string;
          original_name: string;
          size_bytes: number;
          storage_path: string;
          store_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          id?: string;
          mime_type: string;
          original_name: string;
          size_bytes: number;
          storage_path: string;
          store_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          id?: string;
          mime_type?: string;
          original_name?: string;
          size_bytes?: number;
          storage_path?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_attachments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_attachments_deleted_by_fkey';
            columns: ['deleted_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_attachments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
        ];
      };
      store_implementation_items: {
        Row: {
          category_snapshot: string;
          completed_at: string | null;
          created_at: string;
          description_snapshot: string | null;
          due_date: string | null;
          evidence_required_snapshot: boolean;
          guidance_snapshot: string | null;
          id: string;
          implementation_id: string;
          is_required: boolean;
          master_item_id: string | null;
          notes: string | null;
          position: number;
          priority_snapshot: Database['public']['Enums']['need_priority'];
          responsibility_type_snapshot: string | null;
          responsible_usuario_id: string | null;
          status: Database['public']['Enums']['implementation_item_status'];
          title_snapshot: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category_snapshot: string;
          completed_at?: string | null;
          created_at?: string;
          description_snapshot?: string | null;
          due_date?: string | null;
          evidence_required_snapshot?: boolean;
          guidance_snapshot?: string | null;
          id?: string;
          implementation_id: string;
          is_required?: boolean;
          master_item_id?: string | null;
          notes?: string | null;
          position: number;
          priority_snapshot?: Database['public']['Enums']['need_priority'];
          responsibility_type_snapshot?: string | null;
          responsible_usuario_id?: string | null;
          status?: Database['public']['Enums']['implementation_item_status'];
          title_snapshot: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category_snapshot?: string;
          completed_at?: string | null;
          created_at?: string;
          description_snapshot?: string | null;
          due_date?: string | null;
          evidence_required_snapshot?: boolean;
          guidance_snapshot?: string | null;
          id?: string;
          implementation_id?: string;
          is_required?: boolean;
          master_item_id?: string | null;
          notes?: string | null;
          position?: number;
          priority_snapshot?: Database['public']['Enums']['need_priority'];
          responsibility_type_snapshot?: string | null;
          responsible_usuario_id?: string | null;
          status?: Database['public']['Enums']['implementation_item_status'];
          title_snapshot?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'store_implementation_items_implementation_id_fkey';
            columns: ['implementation_id'];
            isOneToOne: false;
            referencedRelation: 'store_implementations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementation_items_master_item_id_fkey';
            columns: ['master_item_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_master_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementation_items_responsible_usuario_id_fkey';
            columns: ['responsible_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementation_items_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      store_implementations: {
        Row: {
          base_date: string;
          checklist_version_id: string;
          completed_at: string | null;
          coordinator_usuario_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          started_at: string | null;
          status: Database['public']['Enums']['implementation_status'];
          store_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          base_date: string;
          checklist_version_id: string;
          completed_at?: string | null;
          coordinator_usuario_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['implementation_status'];
          store_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_date?: string;
          checklist_version_id?: string;
          completed_at?: string | null;
          coordinator_usuario_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['implementation_status'];
          store_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'store_implementations_checklist_version_id_fkey';
            columns: ['checklist_version_id'];
            isOneToOne: false;
            referencedRelation: 'checklist_master_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementations_coordinator_usuario_id_fkey';
            columns: ['coordinator_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_implementations_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      store_needs: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          notes: string | null;
          origin: Database['public']['Enums']['need_origin'];
          priority: Database['public']['Enums']['need_priority'];
          quantity: number;
          source_implementation_item_id: string | null;
          status: Database['public']['Enums']['need_status'];
          store_id: string;
          supply_item_id: string | null;
          title: string;
          unit: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          notes?: string | null;
          origin?: Database['public']['Enums']['need_origin'];
          priority?: Database['public']['Enums']['need_priority'];
          quantity?: number;
          source_implementation_item_id?: string | null;
          status?: Database['public']['Enums']['need_status'];
          store_id: string;
          supply_item_id?: string | null;
          title: string;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          notes?: string | null;
          origin?: Database['public']['Enums']['need_origin'];
          priority?: Database['public']['Enums']['need_priority'];
          quantity?: number;
          source_implementation_item_id?: string | null;
          status?: Database['public']['Enums']['need_status'];
          store_id?: string;
          supply_item_id?: string | null;
          title?: string;
          unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'store_needs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_needs_source_implementation_item_id_fkey';
            columns: ['source_implementation_item_id'];
            isOneToOne: false;
            referencedRelation: 'store_implementation_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_needs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_needs_supply_item_id_fkey';
            columns: ['supply_item_id'];
            isOneToOne: false;
            referencedRelation: 'supply_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_needs_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      supplier_channels: {
        Row: {
          active: boolean;
          channel_type: Database['public']['Enums']['supplier_channel_type'];
          city: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string | null;
          serves_nationally: boolean;
          state: string | null;
          supplier_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          channel_type: Database['public']['Enums']['supplier_channel_type'];
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          serves_nationally?: boolean;
          state?: string | null;
          supplier_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          channel_type?: Database['public']['Enums']['supplier_channel_type'];
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          serves_nationally?: boolean;
          state?: string | null;
          supplier_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_channels_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_channels_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_channels_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: {
          active: boolean;
          address: string | null;
          city: string | null;
          codigo_negocio: string;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          document: string | null;
          email: string | null;
          id: string;
          legal_name: string | null;
          notes: string | null;
          person_type: Database['public']['Enums']['supplier_person_type'];
          phone: string | null;
          state: string | null;
          trade_name: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          city?: string | null;
          codigo_negocio?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          document?: string | null;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          notes?: string | null;
          person_type?: Database['public']['Enums']['supplier_person_type'];
          phone?: string | null;
          state?: string | null;
          trade_name: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          city?: string | null;
          codigo_negocio?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          document?: string | null;
          email?: string | null;
          id?: string;
          legal_name?: string | null;
          notes?: string | null;
          person_type?: Database['public']['Enums']['supplier_person_type'];
          phone?: string | null;
          state?: string | null;
          trade_name?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'suppliers_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      supply_items: {
        Row: {
          active: boolean;
          area_name: string | null;
          brand_reference: string | null;
          category: string;
          codigo_negocio: string;
          created_at: string;
          created_by: string | null;
          default_quantity: number | null;
          default_unit: string;
          description: string | null;
          group_name: string | null;
          id: string;
          item_type: Database['public']['Enums']['supply_item_type'];
          name: string;
          product_link: string | null;
          subcategory: string | null;
          technical_specification: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          area_name?: string | null;
          brand_reference?: string | null;
          category: string;
          codigo_negocio?: string;
          created_at?: string;
          created_by?: string | null;
          default_quantity?: number | null;
          default_unit: string;
          description?: string | null;
          group_name?: string | null;
          id?: string;
          item_type: Database['public']['Enums']['supply_item_type'];
          name: string;
          product_link?: string | null;
          subcategory?: string | null;
          technical_specification?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          area_name?: string | null;
          brand_reference?: string | null;
          category?: string;
          codigo_negocio?: string;
          created_at?: string;
          created_by?: string | null;
          default_quantity?: number | null;
          default_unit?: string;
          description?: string | null;
          group_name?: string | null;
          id?: string;
          item_type?: Database['public']['Enums']['supply_item_type'];
          name?: string;
          product_link?: string | null;
          subcategory?: string | null;
          technical_specification?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'supply_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_items_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      supply_quote_items: {
        Row: {
          captured_at: string | null;
          created_at: string;
          delivery_days: number | null;
          discount_amount: number;
          id: string;
          minimum_quantity: number | null;
          notes: string | null;
          offered_brand_model: string | null;
          other_costs: number;
          product_url: string | null;
          quantity: number;
          quote_id: string;
          shipping_amount: number | null;
          shipping_type: Database['public']['Enums']['supply_shipping_type'];
          store_id: string | null;
          store_need_id: string | null;
          supply_item_id: string;
          unit: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          captured_at?: string | null;
          created_at?: string;
          delivery_days?: number | null;
          discount_amount?: number;
          id?: string;
          minimum_quantity?: number | null;
          notes?: string | null;
          offered_brand_model?: string | null;
          other_costs?: number;
          product_url?: string | null;
          quantity: number;
          quote_id: string;
          shipping_amount?: number | null;
          shipping_type?: Database['public']['Enums']['supply_shipping_type'];
          store_id?: string | null;
          store_need_id?: string | null;
          supply_item_id: string;
          unit: string;
          unit_price: number;
          updated_at?: string;
        };
        Update: {
          captured_at?: string | null;
          created_at?: string;
          delivery_days?: number | null;
          discount_amount?: number;
          id?: string;
          minimum_quantity?: number | null;
          notes?: string | null;
          offered_brand_model?: string | null;
          other_costs?: number;
          product_url?: string | null;
          quantity?: number;
          quote_id?: string;
          shipping_amount?: number | null;
          shipping_type?: Database['public']['Enums']['supply_shipping_type'];
          store_id?: string | null;
          store_need_id?: string | null;
          supply_item_id?: string;
          unit?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supply_quote_items_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'supply_quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quote_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quote_items_store_need_id_fkey';
            columns: ['store_need_id'];
            isOneToOne: false;
            referencedRelation: 'store_needs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quote_items_supply_item_id_fkey';
            columns: ['supply_item_id'];
            isOneToOne: false;
            referencedRelation: 'supply_items';
            referencedColumns: ['id'];
          },
        ];
      };
      supply_quote_stores: {
        Row: {
          created_at: string;
          id: string;
          quote_id: string;
          store_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          quote_id: string;
          store_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          quote_id?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supply_quote_stores_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'supply_quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quote_stores_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
        ];
      };
      supply_quotes: {
        Row: {
          channel_snapshot: Database['public']['Enums']['supplier_channel_type'];
          codigo_negocio: string;
          contact_snapshot: string | null;
          context_type: Database['public']['Enums']['supply_quote_context'];
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          origin_city_snapshot: string | null;
          origin_state_snapshot: string | null;
          quote_date: string;
          status: Database['public']['Enums']['supply_quote_status'];
          supplier_channel_id: string;
          supplier_id: string;
          supplier_name_snapshot: string;
          updated_at: string;
          updated_by: string | null;
          valid_until: string | null;
        };
        Insert: {
          channel_snapshot: Database['public']['Enums']['supplier_channel_type'];
          codigo_negocio?: string;
          contact_snapshot?: string | null;
          context_type: Database['public']['Enums']['supply_quote_context'];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          origin_city_snapshot?: string | null;
          origin_state_snapshot?: string | null;
          quote_date: string;
          status?: Database['public']['Enums']['supply_quote_status'];
          supplier_channel_id: string;
          supplier_id: string;
          supplier_name_snapshot: string;
          updated_at?: string;
          updated_by?: string | null;
          valid_until?: string | null;
        };
        Update: {
          channel_snapshot?: Database['public']['Enums']['supplier_channel_type'];
          codigo_negocio?: string;
          contact_snapshot?: string | null;
          context_type?: Database['public']['Enums']['supply_quote_context'];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          origin_city_snapshot?: string | null;
          origin_state_snapshot?: string | null;
          quote_date?: string;
          status?: Database['public']['Enums']['supply_quote_status'];
          supplier_channel_id?: string;
          supplier_id?: string;
          supplier_name_snapshot?: string;
          updated_at?: string;
          updated_by?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'supply_quotes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quotes_supplier_channel_id_supplier_id_fkey';
            columns: ['supplier_channel_id', 'supplier_id'];
            isOneToOne: false;
            referencedRelation: 'supplier_channels';
            referencedColumns: ['id', 'supplier_id'];
          },
          {
            foreignKeyName: 'supply_quotes_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_quotes_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      usuario_lojas: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          loja_id: string;
          usuario_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          loja_id: string;
          usuario_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          loja_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usuario_lojas_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuario_lojas_loja_id_fkey';
            columns: ['loja_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuario_lojas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      usuario_permissoes: {
        Row: {
          created_at: string;
          created_by: string | null;
          efeito: Database['public']['Enums']['permission_effect'];
          expires_at: string | null;
          id: string;
          loja_id: string | null;
          motivo: string | null;
          permissao_id: string;
          usuario_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          efeito: Database['public']['Enums']['permission_effect'];
          expires_at?: string | null;
          id?: string;
          loja_id?: string | null;
          motivo?: string | null;
          permissao_id: string;
          usuario_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          efeito?: Database['public']['Enums']['permission_effect'];
          expires_at?: string | null;
          id?: string;
          loja_id?: string | null;
          motivo?: string | null;
          permissao_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usuario_permissoes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuario_permissoes_loja_id_fkey';
            columns: ['loja_id'];
            isOneToOne: false;
            referencedRelation: 'lojas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuario_permissoes_permissao_id_fkey';
            columns: ['permissao_id'];
            isOneToOne: false;
            referencedRelation: 'permissoes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuario_permissoes_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      usuarios: {
        Row: {
          all_stores: boolean;
          auth_user_id: string;
          codigo_negocio: string;
          cpf_last4: string;
          created_at: string;
          created_by: string | null;
          id: string;
          last_login_at: string | null;
          must_change_password: boolean;
          nome: string;
          password_changed_at: string | null;
          perfil_id: string;
          status: Database['public']['Enums']['user_status'];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          all_stores?: boolean;
          auth_user_id: string;
          codigo_negocio?: string;
          cpf_last4: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last_login_at?: string | null;
          must_change_password?: boolean;
          nome: string;
          password_changed_at?: string | null;
          perfil_id: string;
          status?: Database['public']['Enums']['user_status'];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          all_stores?: boolean;
          auth_user_id?: string;
          codigo_negocio?: string;
          cpf_last4?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          last_login_at?: string | null;
          must_change_password?: boolean;
          nome?: string;
          password_changed_at?: string | null;
          perfil_id?: string;
          status?: Database['public']['Enums']['user_status'];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'usuarios_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuarios_perfil_id_fkey';
            columns: ['perfil_id'];
            isOneToOne: false;
            referencedRelation: 'perfis';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usuarios_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_create_user_record: {
        Args: {
          p_actor_auth_user_id: string;
          p_all_stores: boolean;
          p_auth_user_id: string;
          p_cpf_last4: string;
          p_cpf_lookup: string;
          p_name: string;
          p_origin?: string;
          p_profile_id: string;
          p_status: Database['public']['Enums']['user_status'];
          p_store_ids: string[];
          p_technical_email: string;
        };
        Returns: string;
      };
      admin_mark_password_reset: {
        Args: { p_actor_auth_user_id: string; p_user_id: string };
        Returns: undefined;
      };
      admin_update_user_record: {
        Args: {
          p_actor_auth_user_id: string;
          p_all_stores: boolean;
          p_name: string;
          p_profile_id: string;
          p_status: Database['public']['Enums']['user_status'];
          p_store_ids: string[];
          p_user_id: string;
        };
        Returns: undefined;
      };
      auth_begin_login_attempt: {
        Args: { p_cpf_lookup: string; p_ip_hash: string };
        Returns: {
          account_status: Database['public']['Enums']['user_status'];
          allowed: boolean;
          auth_user_id: string;
          blocked_until: string;
          technical_email: string;
        }[];
      };
      auth_finish_login_attempt: {
        Args: {
          p_auth_user_id?: string;
          p_cpf_lookup: string;
          p_ip_hash: string;
          p_success: boolean;
        };
        Returns: undefined;
      };
      create_checklist_version: {
        Args: { p_name: string; p_notes?: string; p_source_version_id?: string };
        Returns: string;
      };
      delete_store_attachment: {
        Args: { p_attachment_id: string };
        Returns: string;
      };
      get_auth_context_for_service: {
        Args: { p_auth_user_id: string };
        Returns: {
          account_status: Database['public']['Enums']['user_status'];
          mapped_auth_user_id: string;
          must_change_password: boolean;
          technical_email: string;
          usuario_id: string;
        }[];
      };
      get_my_capabilities: { Args: never; Returns: string[] };
      link_store_need_item: {
        Args: { p_need_id: string; p_supply_item_id: string };
        Returns: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          notes: string | null;
          origin: Database['public']['Enums']['need_origin'];
          priority: Database['public']['Enums']['need_priority'];
          quantity: number;
          source_implementation_item_id: string | null;
          status: Database['public']['Enums']['need_status'];
          store_id: string;
          supply_item_id: string | null;
          title: string;
          unit: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'store_needs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      list_suppliers_for_management: {
        Args: never;
        Returns: {
          active: boolean;
          address: string;
          city: string;
          codigo_negocio: string;
          contact_name: string;
          document: string;
          email: string;
          id: string;
          legal_name: string;
          notes: string;
          person_type: Database['public']['Enums']['supplier_person_type'];
          phone: string;
          state: string;
          trade_name: string;
          website: string;
        }[];
      };
      publish_checklist_version: {
        Args: { p_version_id: string };
        Returns: undefined;
      };
      record_own_password_change: {
        Args: { p_auth_user_id: string };
        Returns: undefined;
      };
      register_store_attachment: {
        Args: {
          p_category: string;
          p_description: string;
          p_mime_type: string;
          p_original_name: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_store_id: string;
        };
        Returns: {
          category: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          id: string;
          mime_type: string;
          original_name: string;
          size_bytes: number;
          storage_path: string;
          store_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'store_attachments';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_supplier: {
        Args: {
          p_active: boolean;
          p_address: string;
          p_channel_active: boolean;
          p_channel_city: string;
          p_channel_id: string;
          p_channel_label: string;
          p_channel_state: string;
          p_channel_type: Database['public']['Enums']['supplier_channel_type'];
          p_city: string;
          p_contact_name: string;
          p_document: string;
          p_email: string;
          p_legal_name: string;
          p_notes: string;
          p_person_type: Database['public']['Enums']['supplier_person_type'];
          p_phone: string;
          p_serves_nationally: boolean;
          p_state: string;
          p_supplier_id: string;
          p_trade_name: string;
          p_website: string;
        };
        Returns: string;
      };
      save_supply_quote: {
        Args: {
          p_contact: string;
          p_context_type: Database['public']['Enums']['supply_quote_context'];
          p_items: Json;
          p_notes: string;
          p_quote_date: string;
          p_quote_id: string;
          p_status: Database['public']['Enums']['supply_quote_status'];
          p_store_ids: string[];
          p_supplier_channel_id: string;
          p_supplier_id: string;
          p_valid_until: string;
        };
        Returns: string;
      };
      set_supply_quote_status: {
        Args: {
          p_quote_id: string;
          p_status: Database['public']['Enums']['supply_quote_status'];
        };
        Returns: Database['public']['Enums']['supply_quote_status'];
      };
      start_store_implementation: {
        Args: {
          p_base_date?: string;
          p_checklist_version_id?: string;
          p_coordinator_usuario_id?: string;
          p_store_id: string;
        };
        Returns: string;
      };
      update_store_implementation_item: {
        Args: {
          p_due_date?: string;
          p_item_id: string;
          p_notes?: string;
          p_responsible_usuario_id?: string;
          p_status: Database['public']['Enums']['implementation_item_status'];
        };
        Returns: {
          category_snapshot: string;
          completed_at: string | null;
          created_at: string;
          description_snapshot: string | null;
          due_date: string | null;
          evidence_required_snapshot: boolean;
          guidance_snapshot: string | null;
          id: string;
          implementation_id: string;
          is_required: boolean;
          master_item_id: string | null;
          notes: string | null;
          position: number;
          priority_snapshot: Database['public']['Enums']['need_priority'];
          responsibility_type_snapshot: string | null;
          responsible_usuario_id: string | null;
          status: Database['public']['Enums']['implementation_item_status'];
          title_snapshot: string;
          updated_at: string;
          updated_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'store_implementation_items';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      checklist_version_status: 'draft' | 'published' | 'archived';
      implementation_item_status:
        'pending' | 'in_progress' | 'completed' | 'blocked' | 'not_applicable';
      implementation_status: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
      need_origin: 'manual' | 'implementation';
      need_priority: 'low' | 'normal' | 'high' | 'critical';
      need_status: 'identified' | 'under_review' | 'resolved' | 'cancelled';
      permission_effect: 'grant' | 'deny';
      store_status: 'planning' | 'active' | 'inactive';
      supplier_channel_type: 'local_city' | 'state_capital' | 'regional' | 'national' | 'ecommerce';
      supplier_person_type: 'legal' | 'individual';
      supply_item_type: 'product' | 'service';
      supply_quote_context: 'store' | 'consolidated';
      supply_quote_status: 'draft' | 'received' | 'expired' | 'cancelled';
      supply_shipping_type: 'free' | 'informed' | 'pending';
      user_status: 'active' | 'inactive' | 'blocked';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      checklist_version_status: ['draft', 'published', 'archived'],
      implementation_item_status: [
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'not_applicable',
      ],
      implementation_status: ['not_started', 'in_progress', 'completed', 'cancelled'],
      need_origin: ['manual', 'implementation'],
      need_priority: ['low', 'normal', 'high', 'critical'],
      need_status: ['identified', 'under_review', 'resolved', 'cancelled'],
      permission_effect: ['grant', 'deny'],
      store_status: ['planning', 'active', 'inactive'],
      supplier_channel_type: ['local_city', 'state_capital', 'regional', 'national', 'ecommerce'],
      supplier_person_type: ['legal', 'individual'],
      supply_item_type: ['product', 'service'],
      supply_quote_context: ['store', 'consolidated'],
      supply_quote_status: ['draft', 'received', 'expired', 'cancelled'],
      supply_shipping_type: ['free', 'informed', 'pending'],
      user_status: ['active', 'inactive', 'blocked'],
    },
  },
} as const;
