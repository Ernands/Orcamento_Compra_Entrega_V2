/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
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
      acoes: {
        Row: {
          chave: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          chave: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_usuario_id: string | null
          after_json: Json | null
          before_json: Json | null
          correlation_id: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_hash: string | null
          occurred_at: string
          origin: string
        }
        Insert: {
          action: string
          actor_usuario_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          correlation_id?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          origin: string
        }
        Update: {
          action?: string
          actor_usuario_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          correlation_id?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          origin?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_master_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          evidence_required: boolean
          guidance: string | null
          id: string
          is_active: boolean
          is_required: boolean
          position: number
          priority: Database["public"]["Enums"]["need_priority"]
          relative_due_days: number | null
          responsibility_type: string | null
          title: string
          updated_at: string
          version_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          evidence_required?: boolean
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          position: number
          priority?: Database["public"]["Enums"]["need_priority"]
          relative_due_days?: number | null
          responsibility_type?: string | null
          title: string
          updated_at?: string
          version_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          evidence_required?: boolean
          guidance?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          position?: number
          priority?: Database["public"]["Enums"]["need_priority"]
          relative_due_days?: number | null
          responsibility_type?: string | null
          title?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_master_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "checklist_master_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_master_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["checklist_version_status"]
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["checklist_version_status"]
          updated_at?: string
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["checklist_version_status"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_master_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_master_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reimbursement_items: {
        Row: {
          approved_amount: number
          created_at: string
          eligible_amount_snapshot: number
          id: string
          notes: string | null
          purchase_code_snapshot: string
          purchase_id: string
          purchase_order_id: string
          received_amount: number
          reimbursement_id: string
          requested_amount: number
          store_id: string
          supplier_name_snapshot: string
          updated_at: string
        }
        Insert: {
          approved_amount?: number
          created_at?: string
          eligible_amount_snapshot: number
          id?: string
          notes?: string | null
          purchase_code_snapshot: string
          purchase_id: string
          purchase_order_id: string
          received_amount?: number
          reimbursement_id: string
          requested_amount: number
          store_id: string
          supplier_name_snapshot: string
          updated_at?: string
        }
        Update: {
          approved_amount?: number
          created_at?: string
          eligible_amount_snapshot?: number
          id?: string
          notes?: string | null
          purchase_code_snapshot?: string
          purchase_id?: string
          purchase_order_id?: string
          received_amount?: number
          reimbursement_id?: string
          requested_amount?: number
          store_id?: string
          supplier_name_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reimbursement_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reimbursement_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reimbursement_items_reimbursement_id_fkey"
            columns: ["reimbursement_id"]
            isOneToOne: false
            referencedRelation: "finance_reimbursements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reimbursement_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reimbursements: {
        Row: {
          codigo_negocio: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          id: string
          notes: string | null
          protocol: string | null
          received_at: string | null
          requested_at: string | null
          status: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          id?: string
          notes?: string | null
          protocol?: string | null
          received_at?: string | null
          requested_at?: string | null
          status?: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          id?: string
          notes?: string | null
          protocol?: string | null
          received_at?: string | null
          requested_at?: string | null
          status?: string
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_reimbursements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reimbursements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_reimbursements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_store_budgets: {
        Row: {
          budget_amount: number
          notes: string | null
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_amount?: number
          notes?: string | null
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_amount?: number
          notes?: string | null
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_store_budgets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_store_budgets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lojas: {
        Row: {
          cidade: string
          codigo_legado: string | null
          codigo_negocio: string
          created_at: string
          created_by: string | null
          data_inauguracao_planejada: string | null
          data_inauguracao_real: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          responsavel_usuario_id: string | null
          status: Database["public"]["Enums"]["store_status"]
          uf: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cidade: string
          codigo_legado?: string | null
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          data_inauguracao_planejada?: string | null
          data_inauguracao_real?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          responsavel_usuario_id?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          uf: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cidade?: string
          codigo_legado?: string | null
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          data_inauguracao_planejada?: string | null
          data_inauguracao_real?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          responsavel_usuario_id?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          uf?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lojas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lojas_responsavel_usuario_id_fkey"
            columns: ["responsavel_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lojas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      perfil_permissoes: {
        Row: {
          created_at: string
          id: string
          perfil_id: string
          permissao_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          perfil_id: string
          permissao_id: string
        }
        Update: {
          created_at?: string
          id?: string
          perfil_id?: string
          permissao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissoes_permissao_id_fkey"
            columns: ["permissao_id"]
            isOneToOne: false
            referencedRelation: "permissoes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissoes: {
        Row: {
          acao_id: string
          ativo: boolean
          chave: string
          created_at: string
          descricao: string | null
          id: string
          modulo_id: string
          updated_at: string
        }
        Insert: {
          acao_id: string
          ativo?: boolean
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo_id: string
          updated_at?: string
        }
        Update: {
          acao_id?: string
          ativo?: boolean
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      store_attachments: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          mime_type: string
          original_name: string
          size_bytes: number
          storage_path: string
          store_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          mime_type: string
          original_name: string
          size_bytes: number
          storage_path: string
          store_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          mime_type?: string
          original_name?: string
          size_bytes?: number
          storage_path?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_attachments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_attachments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      store_implementation_items: {
        Row: {
          category_snapshot: string
          completed_at: string | null
          created_at: string
          description_snapshot: string | null
          due_date: string | null
          evidence_required_snapshot: boolean
          guidance_snapshot: string | null
          id: string
          implementation_id: string
          is_required: boolean
          master_item_id: string | null
          notes: string | null
          position: number
          priority_snapshot: Database["public"]["Enums"]["need_priority"]
          responsibility_type_snapshot: string | null
          responsible_usuario_id: string | null
          status: Database["public"]["Enums"]["implementation_item_status"]
          title_snapshot: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_snapshot: string
          completed_at?: string | null
          created_at?: string
          description_snapshot?: string | null
          due_date?: string | null
          evidence_required_snapshot?: boolean
          guidance_snapshot?: string | null
          id?: string
          implementation_id: string
          is_required?: boolean
          master_item_id?: string | null
          notes?: string | null
          position: number
          priority_snapshot?: Database["public"]["Enums"]["need_priority"]
          responsibility_type_snapshot?: string | null
          responsible_usuario_id?: string | null
          status?: Database["public"]["Enums"]["implementation_item_status"]
          title_snapshot: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_snapshot?: string
          completed_at?: string | null
          created_at?: string
          description_snapshot?: string | null
          due_date?: string | null
          evidence_required_snapshot?: boolean
          guidance_snapshot?: string | null
          id?: string
          implementation_id?: string
          is_required?: boolean
          master_item_id?: string | null
          notes?: string | null
          position?: number
          priority_snapshot?: Database["public"]["Enums"]["need_priority"]
          responsibility_type_snapshot?: string | null
          responsible_usuario_id?: string | null
          status?: Database["public"]["Enums"]["implementation_item_status"]
          title_snapshot?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_implementation_items_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "store_implementations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementation_items_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementation_items_responsible_usuario_id_fkey"
            columns: ["responsible_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementation_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      store_implementations: {
        Row: {
          base_date: string
          checklist_version_id: string
          completed_at: string | null
          coordinator_usuario_id: string | null
          created_at: string
          created_by: string | null
          id: string
          started_at: string | null
          status: Database["public"]["Enums"]["implementation_status"]
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_date: string
          checklist_version_id: string
          completed_at?: string | null
          coordinator_usuario_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["implementation_status"]
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_date?: string
          checklist_version_id?: string
          completed_at?: string | null
          coordinator_usuario_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["implementation_status"]
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_implementations_checklist_version_id_fkey"
            columns: ["checklist_version_id"]
            isOneToOne: false
            referencedRelation: "checklist_master_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementations_coordinator_usuario_id_fkey"
            columns: ["coordinator_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_implementations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      store_needs: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          notes: string | null
          origin: Database["public"]["Enums"]["need_origin"]
          priority: Database["public"]["Enums"]["need_priority"]
          quantity: number
          source_implementation_item_id: string | null
          status: Database["public"]["Enums"]["need_status"]
          store_id: string
          supply_item_id: string | null
          title: string
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["need_origin"]
          priority?: Database["public"]["Enums"]["need_priority"]
          quantity?: number
          source_implementation_item_id?: string | null
          status?: Database["public"]["Enums"]["need_status"]
          store_id: string
          supply_item_id?: string | null
          title: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["need_origin"]
          priority?: Database["public"]["Enums"]["need_priority"]
          quantity?: number
          source_implementation_item_id?: string | null
          status?: Database["public"]["Enums"]["need_status"]
          store_id?: string
          supply_item_id?: string | null
          title?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_needs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_needs_source_implementation_item_id_fkey"
            columns: ["source_implementation_item_id"]
            isOneToOne: false
            referencedRelation: "store_implementation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_needs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_needs_supply_item_id_fkey"
            columns: ["supply_item_id"]
            isOneToOne: false
            referencedRelation: "supply_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_needs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_channels: {
        Row: {
          active: boolean
          channel_type: Database["public"]["Enums"]["supplier_channel_type"]
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          serves_nationally: boolean
          state: string | null
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          channel_type: Database["public"]["Enums"]["supplier_channel_type"]
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          serves_nationally?: boolean
          state?: string | null
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          channel_type?: Database["public"]["Enums"]["supplier_channel_type"]
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          serves_nationally?: boolean
          state?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_channels_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_channels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          codigo_negocio: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          legal_name: string | null
          notes: string | null
          person_type: Database["public"]["Enums"]["supplier_person_type"]
          phone: string | null
          state: string | null
          trade_name: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          codigo_negocio?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          person_type?: Database["public"]["Enums"]["supplier_person_type"]
          phone?: string | null
          state?: string | null
          trade_name: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          codigo_negocio?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          person_type?: Database["public"]["Enums"]["supplier_person_type"]
          phone?: string | null
          state?: string | null
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_freight_profile_stores: {
        Row: {
          created_at: string
          profile_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_freight_profile_stores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "supply_freight_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_freight_profile_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_freight_profiles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          position: number
          state: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          position?: number
          state: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      supply_items: {
        Row: {
          active: boolean
          area_name: string | null
          brand_reference: string | null
          category: string
          codigo_negocio: string
          created_at: string
          created_by: string | null
          default_quantity: number | null
          default_unit: string
          description: string | null
          group_name: string | null
          id: string
          item_type: Database["public"]["Enums"]["supply_item_type"]
          name: string
          product_link: string | null
          subcategory: string | null
          technical_specification: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          area_name?: string | null
          brand_reference?: string | null
          category: string
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          default_quantity?: number | null
          default_unit: string
          description?: string | null
          group_name?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["supply_item_type"]
          name: string
          product_link?: string | null
          subcategory?: string | null
          technical_specification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          area_name?: string | null
          brand_reference?: string | null
          category?: string
          codigo_negocio?: string
          created_at?: string
          created_by?: string | null
          default_quantity?: number | null
          default_unit?: string
          description?: string | null
          group_name?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["supply_item_type"]
          name?: string
          product_link?: string | null
          subcategory?: string | null
          technical_specification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_attachment_stores: {
        Row: {
          attachment_id: string
          created_at: string
          id: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Insert: {
          attachment_id: string
          created_at?: string
          id?: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Update: {
          attachment_id?: string
          created_at?: string
          id?: string
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_attachment_stores_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_attachment_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_amount: number | null
          document_date: string | null
          document_number: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          purchase_id: string
          purchase_order_id: string | null
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_amount?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type?: string
          id?: string
          mime_type: string
          original_name: string
          purchase_id: string
          purchase_order_id?: string | null
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_amount?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type?: string
          id?: string
          mime_type?: string
          original_name?: string
          purchase_id?: string
          purchase_order_id?: string | null
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_attachments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_attachments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_attachments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_destination_stores: {
        Row: {
          allocated_quantity: number | null
          allocation_source: string
          created_at: string
          id: string
          purchase_destination_id: string
          purchase_id: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at: string
        }
        Insert: {
          allocated_quantity?: number | null
          allocation_source?: string
          created_at?: string
          id?: string
          purchase_destination_id: string
          purchase_id: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at?: string
        }
        Update: {
          allocated_quantity?: number | null
          allocation_source?: string
          created_at?: string
          id?: string
          purchase_destination_id?: string
          purchase_id?: string
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_destination_stores_purchase_destination_id_fkey"
            columns: ["purchase_destination_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_destination_stores_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_destination_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_destinations: {
        Row: {
          created_at: string
          destination_count: number
          destination_type: string
          distribution_status: string
          id: string
          label_snapshot: string
          notes_snapshot: string | null
          position: number
          profile_id: string | null
          purchase_item_id: string
          quantity: number
          quoted_delivery_days: number | null
          quoted_shipping_amount: number | null
          quoted_shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          snapshot_source: string
          source_quote_destination_id: string | null
          state_snapshot: string
          store_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_count: number
          destination_type: string
          distribution_status?: string
          id?: string
          label_snapshot: string
          notes_snapshot?: string | null
          position?: number
          profile_id?: string | null
          purchase_item_id: string
          quantity: number
          quoted_delivery_days?: number | null
          quoted_shipping_amount?: number | null
          quoted_shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          snapshot_source?: string
          source_quote_destination_id?: string | null
          state_snapshot: string
          store_id?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_count?: number
          destination_type?: string
          distribution_status?: string
          id?: string
          label_snapshot?: string
          notes_snapshot?: string | null
          position?: number
          profile_id?: string | null
          purchase_item_id?: string
          quantity?: number
          quoted_delivery_days?: number | null
          quoted_shipping_amount?: number | null
          quoted_shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          snapshot_source?: string
          source_quote_destination_id?: string | null
          state_snapshot?: string
          store_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_destinations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "supply_freight_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_destinations_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_destinations_source_quote_destination_id_fkey"
            columns: ["source_quote_destination_id"]
            isOneToOne: false
            referencedRelation: "supply_quote_item_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_destinations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_items: {
        Row: {
          actual_discount_amount: number
          actual_other_costs: number
          actual_shipping_amount: number
          actual_total: number
          actual_unit_price: number | null
          approved_line_total: number
          brand_reference_snapshot: string | null
          created_at: string
          id: string
          item_area_snapshot: string | null
          item_category_snapshot: string | null
          item_code_snapshot: string
          item_context_snapshot_source: string | null
          item_description_snapshot: string | null
          item_name_snapshot: string
          notes: string | null
          offered_brand_model_snapshot: string | null
          product_url_snapshot: string | null
          purchase_id: string
          purchased_quantity: number
          quantity_approved: number
          quote_item_notes_snapshot: string | null
          quoted_delivery_days: number | null
          quoted_discount_amount: number
          quoted_other_costs: number
          quoted_shipping_amount: number | null
          quoted_shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          quoted_unit_price: number
          source_quote_item_id: string | null
          store_code_snapshot: string | null
          store_id: string | null
          supply_item_id: string
          technical_specification_snapshot: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          actual_discount_amount?: number
          actual_other_costs?: number
          actual_shipping_amount?: number
          actual_total?: number
          actual_unit_price?: number | null
          approved_line_total: number
          brand_reference_snapshot?: string | null
          created_at?: string
          id?: string
          item_area_snapshot?: string | null
          item_category_snapshot?: string | null
          item_code_snapshot: string
          item_context_snapshot_source?: string | null
          item_description_snapshot?: string | null
          item_name_snapshot: string
          notes?: string | null
          offered_brand_model_snapshot?: string | null
          product_url_snapshot?: string | null
          purchase_id: string
          purchased_quantity?: number
          quantity_approved: number
          quote_item_notes_snapshot?: string | null
          quoted_delivery_days?: number | null
          quoted_discount_amount?: number
          quoted_other_costs?: number
          quoted_shipping_amount?: number | null
          quoted_shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          quoted_unit_price: number
          source_quote_item_id?: string | null
          store_code_snapshot?: string | null
          store_id?: string | null
          supply_item_id: string
          technical_specification_snapshot?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          actual_discount_amount?: number
          actual_other_costs?: number
          actual_shipping_amount?: number
          actual_total?: number
          actual_unit_price?: number | null
          approved_line_total?: number
          brand_reference_snapshot?: string | null
          created_at?: string
          id?: string
          item_area_snapshot?: string | null
          item_category_snapshot?: string | null
          item_code_snapshot?: string
          item_context_snapshot_source?: string | null
          item_description_snapshot?: string | null
          item_name_snapshot?: string
          notes?: string | null
          offered_brand_model_snapshot?: string | null
          product_url_snapshot?: string | null
          purchase_id?: string
          purchased_quantity?: number
          quantity_approved?: number
          quote_item_notes_snapshot?: string | null
          quoted_delivery_days?: number | null
          quoted_discount_amount?: number
          quoted_other_costs?: number
          quoted_shipping_amount?: number | null
          quoted_shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          quoted_unit_price?: number
          source_quote_item_id?: string | null
          store_code_snapshot?: string | null
          store_id?: string | null
          supply_item_id?: string
          technical_specification_snapshot?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_items_supply_item_id_fkey"
            columns: ["supply_item_id"]
            isOneToOne: false
            referencedRelation: "supply_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_order_items: {
        Row: {
          actual_shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          created_at: string
          destination_label_snapshot: string | null
          destination_state_snapshot: string | null
          discount_amount: number
          expected_delivery_date: string | null
          id: string
          item_code_snapshot: string
          item_name_snapshot: string
          line_total: number | null
          notes: string | null
          order_id: string
          other_costs: number
          purchase_destination_id: string | null
          purchase_item_id: string | null
          quantity: number
          shipping_amount: number | null
          shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          store_distribution_status: string
          unit: string
          unit_price: number
        }
        Insert: {
          actual_shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          created_at?: string
          destination_label_snapshot?: string | null
          destination_state_snapshot?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          id?: string
          item_code_snapshot: string
          item_name_snapshot: string
          line_total?: number | null
          notes?: string | null
          order_id: string
          other_costs?: number
          purchase_destination_id?: string | null
          purchase_item_id?: string | null
          quantity: number
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          store_distribution_status?: string
          unit: string
          unit_price: number
        }
        Update: {
          actual_shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          created_at?: string
          destination_label_snapshot?: string | null
          destination_state_snapshot?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          id?: string
          item_code_snapshot?: string
          item_name_snapshot?: string
          line_total?: number | null
          notes?: string | null
          order_id?: string
          other_costs?: number
          purchase_destination_id?: string | null
          purchase_item_id?: string | null
          quantity?: number
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          store_distribution_status?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_order_items_purchase_destination_id_fkey"
            columns: ["purchase_destination_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_order_items_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_order_line_stores: {
        Row: {
          allocation_source: string
          created_at: string
          id: string
          order_line_id: string
          purchase_destination_store_id: string | null
          quantity: number
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at: string
        }
        Insert: {
          allocation_source?: string
          created_at?: string
          id?: string
          order_line_id: string
          purchase_destination_store_id?: string | null
          quantity: number
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at?: string
        }
        Update: {
          allocation_source?: string
          created_at?: string
          id?: string
          order_line_id?: string
          purchase_destination_store_id?: string | null
          quantity?: number
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_order_line_st_purchase_destination_store_i_fkey"
            columns: ["purchase_destination_store_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_destination_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_order_line_stores_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_order_line_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_name_snapshot: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          purchase_id: string
          purchased_on: string
          source: string
          status: string
          supplier_order_ref: string | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          purchase_id: string
          purchased_on?: string
          source?: string
          status?: string
          supplier_order_ref?: string | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          purchase_id?: string
          purchased_on?: string
          source?: string
          status?: string
          supplier_order_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_orders_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_payments: {
        Row: {
          amount: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          entry_amount: number | null
          first_due_date: string | null
          id: string
          installment_count: number | null
          notes: string | null
          paid_at: string | null
          payment_method: string
          purchase_id: string
          purchase_order_id: string | null
          source_label: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_amount?: number | null
          first_due_date?: string | null
          id?: string
          installment_count?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method: string
          purchase_id: string
          purchase_order_id?: string | null
          source_label?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_amount?: number | null
          first_due_date?: string | null
          id?: string
          installment_count?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          purchase_id?: string
          purchase_order_id?: string | null
          source_label?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_payments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "supply_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchase_stores: {
        Row: {
          created_at: string
          id: string
          purchase_id: string
          store_address_snapshot: string | null
          store_address_snapshot_source: string | null
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_id: string
          store_address_snapshot?: string | null
          store_address_snapshot_source?: string | null
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_id?: string
          store_address_snapshot?: string | null
          store_address_snapshot_source?: string | null
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchase_stores_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supply_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchase_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_purchases: {
        Row: {
          approved_at: string
          approved_by: string | null
          approved_total: number
          channel_type_snapshot:
            | Database["public"]["Enums"]["supplier_channel_type"]
            | null
          codigo_negocio: string
          contact_snapshot: string | null
          created_at: string
          entry_amount_snapshot: number | null
          has_pending_shipping: boolean
          id: string
          installment_count_snapshot: number | null
          notes: string | null
          origin_city_snapshot: string | null
          origin_state_snapshot: string | null
          payment_method_snapshot: string | null
          payment_notes_snapshot: string | null
          quote_code_snapshot: string
          quote_context_snapshot_source: string | null
          quote_date_snapshot: string
          quote_id: string
          reimbursement_status: string
          returned_at: string | null
          returned_by: string | null
          status: string
          supplier_channel_id_snapshot: string | null
          supplier_id: string
          supplier_name_snapshot: string
          updated_at: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          approved_total?: number
          channel_type_snapshot?:
            | Database["public"]["Enums"]["supplier_channel_type"]
            | null
          codigo_negocio?: string
          contact_snapshot?: string | null
          created_at?: string
          entry_amount_snapshot?: number | null
          has_pending_shipping?: boolean
          id?: string
          installment_count_snapshot?: number | null
          notes?: string | null
          origin_city_snapshot?: string | null
          origin_state_snapshot?: string | null
          payment_method_snapshot?: string | null
          payment_notes_snapshot?: string | null
          quote_code_snapshot: string
          quote_context_snapshot_source?: string | null
          quote_date_snapshot: string
          quote_id: string
          reimbursement_status?: string
          returned_at?: string | null
          returned_by?: string | null
          status?: string
          supplier_channel_id_snapshot?: string | null
          supplier_id: string
          supplier_name_snapshot: string
          updated_at?: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          approved_total?: number
          channel_type_snapshot?:
            | Database["public"]["Enums"]["supplier_channel_type"]
            | null
          codigo_negocio?: string
          contact_snapshot?: string | null
          created_at?: string
          entry_amount_snapshot?: number | null
          has_pending_shipping?: boolean
          id?: string
          installment_count_snapshot?: number | null
          notes?: string | null
          origin_city_snapshot?: string | null
          origin_state_snapshot?: string | null
          payment_method_snapshot?: string | null
          payment_notes_snapshot?: string | null
          quote_code_snapshot?: string
          quote_context_snapshot_source?: string | null
          quote_date_snapshot?: string
          quote_id?: string
          reimbursement_status?: string
          returned_at?: string | null
          returned_by?: string | null
          status?: string
          supplier_channel_id_snapshot?: string | null
          supplier_id?: string
          supplier_name_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_purchases_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchases_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "supply_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchases_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quote_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_type?: string
          id?: string
          mime_type: string
          original_name: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_type?: string
          id?: string
          mime_type?: string
          original_name?: string
          quote_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_quote_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_attachments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supply_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quote_item_destination_stores: {
        Row: {
          created_at: string
          id: string
          quote_destination_id: string
          quote_id: string
          snapshot_source: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Insert: {
          created_at?: string
          id?: string
          quote_destination_id: string
          quote_id: string
          snapshot_source?: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
        }
        Update: {
          created_at?: string
          id?: string
          quote_destination_id?: string
          quote_id?: string
          snapshot_source?: string
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_quote_item_destination_stores_quote_destination_id_fkey"
            columns: ["quote_destination_id"]
            isOneToOne: false
            referencedRelation: "supply_quote_item_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_item_destination_stores_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supply_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_item_destination_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quote_item_destinations: {
        Row: {
          created_at: string
          delivery_days: number | null
          destination_count: number
          destination_type: string
          id: string
          label_snapshot: string
          notes: string | null
          position: number
          profile_id: string | null
          quantity: number
          quote_item_id: string
          shipping_amount: number | null
          shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          state_snapshot: string
          store_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_days?: number | null
          destination_count?: number
          destination_type: string
          id?: string
          label_snapshot: string
          notes?: string | null
          position?: number
          profile_id?: string | null
          quantity: number
          quote_item_id: string
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          state_snapshot: string
          store_id?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_days?: number | null
          destination_count?: number
          destination_type?: string
          id?: string
          label_snapshot?: string
          notes?: string | null
          position?: number
          profile_id?: string | null
          quantity?: number
          quote_item_id?: string
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          state_snapshot?: string
          store_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_quote_item_destinations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "supply_freight_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_item_destinations_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "supply_quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_item_destinations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quote_items: {
        Row: {
          captured_at: string | null
          created_at: string
          delivery_days: number | null
          discount_amount: number
          id: string
          minimum_quantity: number | null
          notes: string | null
          offered_brand_model: string | null
          other_costs: number
          position: number
          product_url: string | null
          quantity: number
          quote_id: string
          shipping_amount: number | null
          shipping_type: Database["public"]["Enums"]["supply_shipping_type"]
          store_id: string | null
          store_need_id: string | null
          supply_item_id: string
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          delivery_days?: number | null
          discount_amount?: number
          id?: string
          minimum_quantity?: number | null
          notes?: string | null
          offered_brand_model?: string | null
          other_costs?: number
          position: number
          product_url?: string | null
          quantity: number
          quote_id: string
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          store_id?: string | null
          store_need_id?: string | null
          supply_item_id: string
          unit: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          delivery_days?: number | null
          discount_amount?: number
          id?: string
          minimum_quantity?: number | null
          notes?: string | null
          offered_brand_model?: string | null
          other_costs?: number
          position?: number
          product_url?: string | null
          quantity?: number
          quote_id?: string
          shipping_amount?: number | null
          shipping_type?: Database["public"]["Enums"]["supply_shipping_type"]
          store_id?: string | null
          store_need_id?: string | null
          supply_item_id?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supply_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_items_store_need_id_fkey"
            columns: ["store_need_id"]
            isOneToOne: false
            referencedRelation: "store_needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_items_supply_item_id_fkey"
            columns: ["supply_item_id"]
            isOneToOne: false
            referencedRelation: "supply_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quote_stores: {
        Row: {
          created_at: string
          id: string
          quote_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quote_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quote_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_quote_stores_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "supply_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quote_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_quotes: {
        Row: {
          channel_snapshot: Database["public"]["Enums"]["supplier_channel_type"]
          codigo_negocio: string
          contact_snapshot: string | null
          context_type: Database["public"]["Enums"]["supply_quote_context"]
          created_at: string
          created_by: string | null
          entry_amount: number | null
          id: string
          installment_count: number | null
          notes: string | null
          origin_city_snapshot: string | null
          origin_state_snapshot: string | null
          payment_method: string | null
          payment_notes: string | null
          quote_date: string
          status: Database["public"]["Enums"]["supply_quote_status"]
          supplier_channel_id: string
          supplier_id: string
          supplier_name_snapshot: string
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          channel_snapshot: Database["public"]["Enums"]["supplier_channel_type"]
          codigo_negocio?: string
          contact_snapshot?: string | null
          context_type: Database["public"]["Enums"]["supply_quote_context"]
          created_at?: string
          created_by?: string | null
          entry_amount?: number | null
          id?: string
          installment_count?: number | null
          notes?: string | null
          origin_city_snapshot?: string | null
          origin_state_snapshot?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quote_date: string
          status?: Database["public"]["Enums"]["supply_quote_status"]
          supplier_channel_id: string
          supplier_id: string
          supplier_name_snapshot: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          channel_snapshot?: Database["public"]["Enums"]["supplier_channel_type"]
          codigo_negocio?: string
          contact_snapshot?: string | null
          context_type?: Database["public"]["Enums"]["supply_quote_context"]
          created_at?: string
          created_by?: string | null
          entry_amount?: number | null
          id?: string
          installment_count?: number | null
          notes?: string | null
          origin_city_snapshot?: string | null
          origin_state_snapshot?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          quote_date?: string
          status?: Database["public"]["Enums"]["supply_quote_status"]
          supplier_channel_id?: string
          supplier_id?: string
          supplier_name_snapshot?: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quotes_supplier_channel_id_supplier_id_fkey"
            columns: ["supplier_channel_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_channels"
            referencedColumns: ["id", "supplier_id"]
          },
          {
            foreignKeyName: "supply_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_quotes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_lojas: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          loja_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          loja_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          loja_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_lojas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_lojas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_lojas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_permissoes: {
        Row: {
          created_at: string
          created_by: string | null
          efeito: Database["public"]["Enums"]["permission_effect"]
          expires_at: string | null
          id: string
          loja_id: string | null
          motivo: string | null
          permissao_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          efeito: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          id?: string
          loja_id?: string | null
          motivo?: string | null
          permissao_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          efeito?: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          id?: string
          loja_id?: string | null
          motivo?: string | null
          permissao_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_permissoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permissoes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permissoes_permissao_id_fkey"
            columns: ["permissao_id"]
            isOneToOne: false
            referencedRelation: "permissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          all_stores: boolean
          auth_user_id: string
          codigo_negocio: string
          cpf_last4: string
          created_at: string
          created_by: string | null
          id: string
          last_login_at: string | null
          must_change_password: boolean
          nome: string
          password_changed_at: string | null
          perfil_id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          all_stores?: boolean
          auth_user_id: string
          codigo_negocio?: string
          cpf_last4: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_login_at?: string | null
          must_change_password?: boolean
          nome: string
          password_changed_at?: string | null
          perfil_id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          all_stores?: boolean
          auth_user_id?: string
          codigo_negocio?: string
          cpf_last4?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_login_at?: string | null
          must_change_password?: boolean
          nome?: string
          password_changed_at?: string | null
          perfil_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      works_service_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_amount: number | null
          document_date: string | null
          document_number: string | null
          document_type: string
          id: string
          mime_type: string | null
          notes: string | null
          original_name: string | null
          payment_id: string | null
          service_id: string
          size_bytes: number | null
          status: string
          storage_path: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_amount?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_name?: string | null
          payment_id?: string | null
          service_id: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_amount?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_name?: string | null
          payment_id?: string | null
          service_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "works_service_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_documents_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "works_service_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_documents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "works_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_documents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      works_service_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          label: string
          notes: string | null
          paid_at: string | null
          payment_method: string
          service_id: string
          source_label: string | null
          status: string
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          label: string
          notes?: string | null
          paid_at?: string | null
          payment_method: string
          service_id: string
          source_label?: string | null
          status?: string
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          label?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          service_id?: string
          source_label?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "works_service_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_payments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "works_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_service_payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      works_services: {
        Row: {
          budget_amount: number
          category: string
          codigo_negocio: string
          contracted_amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          progress_percent: number
          provider_name: string | null
          provider_phone: string | null
          provider_tax_id: string | null
          status: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_amount?: number
          category: string
          codigo_negocio?: string
          contracted_amount?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          progress_percent?: number
          provider_name?: string | null
          provider_phone?: string | null
          provider_tax_id?: string | null
          status?: string
          store_city_snapshot: string
          store_code_snapshot: string
          store_id: string
          store_name_snapshot: string
          store_state_snapshot: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_amount?: number
          category?: string
          codigo_negocio?: string
          contracted_amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          progress_percent?: number
          provider_name?: string | null
          provider_phone?: string | null
          provider_tax_id?: string | null
          status?: string
          store_city_snapshot?: string
          store_code_snapshot?: string
          store_id?: string
          store_name_snapshot?: string
          store_state_snapshot?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "works_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_services_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_services_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_user_record: {
        Args: {
          p_actor_auth_user_id: string
          p_all_stores: boolean
          p_auth_user_id: string
          p_cpf_last4: string
          p_cpf_lookup: string
          p_name: string
          p_origin?: string
          p_profile_id: string
          p_status: Database["public"]["Enums"]["user_status"]
          p_store_ids: string[]
          p_technical_email: string
        }
        Returns: string
      }
      admin_mark_password_reset: {
        Args: { p_actor_auth_user_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_update_user_record: {
        Args: {
          p_actor_auth_user_id: string
          p_all_stores: boolean
          p_name: string
          p_profile_id: string
          p_status: Database["public"]["Enums"]["user_status"]
          p_store_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      approve_supply_quote_for_purchase: {
        Args: { p_quote_id: string }
        Returns: string
      }
      auth_begin_login_attempt: {
        Args: { p_cpf_lookup: string; p_ip_hash: string }
        Returns: {
          account_status: Database["public"]["Enums"]["user_status"]
          allowed: boolean
          auth_user_id: string
          blocked_until: string
          technical_email: string
        }[]
      }
      auth_finish_login_attempt: {
        Args: {
          p_auth_user_id?: string
          p_cpf_lookup: string
          p_ip_hash: string
          p_success: boolean
        }
        Returns: undefined
      }
      cancel_supply_purchase_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_supply_purchase_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      create_checklist_version: {
        Args: { p_name: string; p_notes?: string; p_source_version_id?: string }
        Returns: string
      }
      create_supply_purchase_operation_v1: {
        Args: {
          p_expected_delivery_date: string
          p_lines: Json
          p_notes: string
          p_payments: Json
          p_purchase_id: string
          p_purchased_on: string
          p_supplier_order_ref: string
        }
        Returns: Json
      }
      create_supply_purchase_order: {
        Args: {
          p_expected_delivery_date: string
          p_lines: Json
          p_notes: string
          p_purchase_id: string
          p_purchased_on: string
          p_supplier_order_ref: string
        }
        Returns: string
      }
      create_supply_purchase_order_v2: {
        Args: {
          p_expected_delivery_date: string
          p_lines: Json
          p_notes: string
          p_purchase_id: string
          p_purchased_on: string
          p_supplier_order_ref: string
        }
        Returns: string
      }
      delete_store_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      delete_supply_purchase_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      delete_supply_quote: { Args: { p_quote_id: string }; Returns: undefined }
      delete_supply_quote_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      get_auth_context_for_service: {
        Args: { p_auth_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["user_status"]
          mapped_auth_user_id: string
          must_change_password: boolean
          technical_email: string
          usuario_id: string
        }[]
      }
      get_my_capabilities: { Args: never; Returns: string[] }
      link_store_need_item: {
        Args: { p_need_id: string; p_supply_item_id: string }
        Returns: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          notes: string | null
          origin: Database["public"]["Enums"]["need_origin"]
          priority: Database["public"]["Enums"]["need_priority"]
          quantity: number
          source_implementation_item_id: string | null
          status: Database["public"]["Enums"]["need_status"]
          store_id: string
          supply_item_id: string | null
          title: string
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "store_needs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_suppliers_for_management: {
        Args: never
        Returns: {
          active: boolean
          address: string
          city: string
          codigo_negocio: string
          contact_name: string
          document: string
          email: string
          id: string
          legal_name: string
          notes: string
          person_type: Database["public"]["Enums"]["supplier_person_type"]
          phone: string
          state: string
          trade_name: string
          website: string
        }[]
      }
      publish_checklist_version: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      record_own_password_change: {
        Args: { p_auth_user_id: string }
        Returns: undefined
      }
      register_store_attachment: {
        Args: {
          p_category: string
          p_description: string
          p_mime_type: string
          p_original_name: string
          p_size_bytes: number
          p_storage_path: string
          p_store_id: string
        }
        Returns: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          mime_type: string
          original_name: string
          size_bytes: number
          storage_path: string
          store_id: string
        }
        SetofOptions: {
          from: "*"
          to: "store_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_supply_purchase_attachment: {
        Args: {
          p_description: string
          p_document_type: string
          p_mime_type: string
          p_original_name: string
          p_purchase_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_amount: number | null
          document_date: string | null
          document_number: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          purchase_id: string
          purchase_order_id: string | null
          size_bytes: number
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "supply_purchase_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_supply_purchase_attachment_v2: {
        Args: {
          p_description: string
          p_document_amount: string
          p_document_date: string
          p_document_number: string
          p_document_type: string
          p_mime_type: string
          p_original_name: string
          p_purchase_id: string
          p_purchase_order_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_amount: number | null
          document_date: string | null
          document_number: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          purchase_id: string
          purchase_order_id: string | null
          size_bytes: number
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "supply_purchase_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_supply_purchase_attachment_v3: {
        Args: {
          p_description: string
          p_document_amount: string
          p_document_date: string
          p_document_number: string
          p_document_type: string
          p_mime_type: string
          p_original_name: string
          p_purchase_id: string
          p_purchase_order_id: string
          p_size_bytes: number
          p_storage_path: string
          p_store_ids: string[]
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_amount: number | null
          document_date: string | null
          document_number: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          purchase_id: string
          purchase_order_id: string | null
          size_bytes: number
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "supply_purchase_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_supply_quote_attachment: {
        Args: {
          p_description: string
          p_mime_type: string
          p_original_name: string
          p_quote_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "supply_quote_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_supply_quote_attachment_v2: {
        Args: {
          p_description: string
          p_document_type: string
          p_mime_type: string
          p_original_name: string
          p_quote_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_type: string
          id: string
          mime_type: string
          original_name: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "supply_quote_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_supply_purchase_to_quote: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      save_finance_reimbursement_v1: {
        Args: {
          p_items: Json
          p_notes: string
          p_protocol: string
          p_reimbursement_id: string
          p_status: string
          p_store_id: string
        }
        Returns: string
      }
      save_supplier: {
        Args: {
          p_active: boolean
          p_address: string
          p_channel_active: boolean
          p_channel_city: string
          p_channel_id: string
          p_channel_label: string
          p_channel_state: string
          p_channel_type: Database["public"]["Enums"]["supplier_channel_type"]
          p_city: string
          p_contact_name: string
          p_document: string
          p_email: string
          p_legal_name: string
          p_notes: string
          p_person_type: Database["public"]["Enums"]["supplier_person_type"]
          p_phone: string
          p_serves_nationally: boolean
          p_state: string
          p_supplier_id: string
          p_trade_name: string
          p_website: string
        }
        Returns: string
      }
      save_supply_purchase_destination_distribution: {
        Args: { p_allocations: Json; p_purchase_destination_id: string }
        Returns: string
      }
      save_supply_purchase_item: {
        Args: {
          p_actual_discount_amount: number
          p_actual_other_costs: number
          p_actual_shipping_amount: number
          p_actual_unit_price: number
          p_notes: string
          p_purchase_item_id: string
          p_purchased_quantity: number
        }
        Returns: undefined
      }
      save_supply_purchase_order_line_distribution: {
        Args: { p_allocations: Json; p_order_line_id: string }
        Returns: string
      }
      save_supply_purchase_payment: {
        Args: {
          p_amount: number
          p_entry_amount: number
          p_first_due_date: string
          p_installment_count: number
          p_notes: string
          p_paid_at: string
          p_payment_id: string
          p_payment_method: string
          p_purchase_id: string
          p_purchase_order_id: string
          p_source_label: string
          p_status: string
        }
        Returns: string
      }
      save_supply_quote: {
        Args: {
          p_contact: string
          p_context_type: Database["public"]["Enums"]["supply_quote_context"]
          p_items: Json
          p_notes: string
          p_quote_date: string
          p_quote_id: string
          p_status: Database["public"]["Enums"]["supply_quote_status"]
          p_store_ids: string[]
          p_supplier_channel_id: string
          p_supplier_id: string
          p_valid_until: string
        }
        Returns: string
      }
      save_supply_quote_legacy: {
        Args: {
          p_contact: string
          p_context_type: Database["public"]["Enums"]["supply_quote_context"]
          p_items: Json
          p_notes: string
          p_quote_date: string
          p_quote_id: string
          p_status: Database["public"]["Enums"]["supply_quote_status"]
          p_store_ids: string[]
          p_supplier_channel_id: string
          p_supplier_id: string
          p_valid_until: string
        }
        Returns: string
      }
      save_supply_quote_v2: {
        Args: {
          p_contact: string
          p_context_type: Database["public"]["Enums"]["supply_quote_context"]
          p_entry_amount: number
          p_installment_count: number
          p_items: Json
          p_notes: string
          p_payment_method: string
          p_payment_notes: string
          p_quote_date: string
          p_quote_id: string
          p_status: Database["public"]["Enums"]["supply_quote_status"]
          p_store_ids: string[]
          p_supplier_channel_id: string
          p_supplier_id: string
          p_valid_until: string
        }
        Returns: string
      }
      save_supply_quote_v3: {
        Args: {
          p_contact: string
          p_context_type: Database["public"]["Enums"]["supply_quote_context"]
          p_entry_amount: number
          p_installment_count: number
          p_items: Json
          p_notes: string
          p_payment_method: string
          p_payment_notes: string
          p_quote_date: string
          p_quote_id: string
          p_status: Database["public"]["Enums"]["supply_quote_status"]
          p_store_ids: string[]
          p_supplier_channel_id: string
          p_supplier_id: string
          p_valid_until: string
        }
        Returns: string
      }
      set_supply_purchase_reimbursement_status: {
        Args: { p_purchase_id: string; p_status: string }
        Returns: undefined
      }
      set_supply_quote_payment_terms: {
        Args: {
          p_entry_amount: number
          p_installment_count: number
          p_payment_method: string
          p_payment_notes: string
          p_quote_id: string
        }
        Returns: undefined
      }
      set_supply_quote_status: {
        Args: {
          p_quote_id: string
          p_status: Database["public"]["Enums"]["supply_quote_status"]
        }
        Returns: Database["public"]["Enums"]["supply_quote_status"]
      }
      start_store_implementation: {
        Args: {
          p_base_date?: string
          p_checklist_version_id?: string
          p_coordinator_usuario_id?: string
          p_store_id: string
        }
        Returns: string
      }
      update_store_implementation_item: {
        Args: {
          p_due_date?: string
          p_item_id: string
          p_notes?: string
          p_responsible_usuario_id?: string
          p_status: Database["public"]["Enums"]["implementation_item_status"]
        }
        Returns: {
          category_snapshot: string
          completed_at: string | null
          created_at: string
          description_snapshot: string | null
          due_date: string | null
          evidence_required_snapshot: boolean
          guidance_snapshot: string | null
          id: string
          implementation_id: string
          is_required: boolean
          master_item_id: string | null
          notes: string | null
          position: number
          priority_snapshot: Database["public"]["Enums"]["need_priority"]
          responsibility_type_snapshot: string | null
          responsible_usuario_id: string | null
          status: Database["public"]["Enums"]["implementation_item_status"]
          title_snapshot: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "store_implementation_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      checklist_version_status: "draft" | "published" | "archived"
      implementation_item_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "blocked"
        | "not_applicable"
      implementation_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "cancelled"
      need_origin: "manual" | "implementation"
      need_priority: "low" | "normal" | "high" | "critical"
      need_status: "identified" | "under_review" | "resolved" | "cancelled"
      permission_effect: "grant" | "deny"
      store_status: "planning" | "active" | "inactive"
      supplier_channel_type:
        | "local_city"
        | "state_capital"
        | "regional"
        | "national"
        | "ecommerce"
      supplier_person_type: "legal" | "individual"
      supply_item_type: "product" | "service"
      supply_quote_context: "store" | "consolidated"
      supply_quote_status: "draft" | "received" | "expired" | "cancelled"
      supply_shipping_type: "free" | "informed" | "pending"
      user_status: "active" | "inactive" | "blocked"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      checklist_version_status: ["draft", "published", "archived"],
      implementation_item_status: [
        "pending",
        "in_progress",
        "completed",
        "blocked",
        "not_applicable",
      ],
      implementation_status: [
        "not_started",
        "in_progress",
        "completed",
        "cancelled",
      ],
      need_origin: ["manual", "implementation"],
      need_priority: ["low", "normal", "high", "critical"],
      need_status: ["identified", "under_review", "resolved", "cancelled"],
      permission_effect: ["grant", "deny"],
      store_status: ["planning", "active", "inactive"],
      supplier_channel_type: [
        "local_city",
        "state_capital",
        "regional",
        "national",
        "ecommerce",
      ],
      supplier_person_type: ["legal", "individual"],
      supply_item_type: ["product", "service"],
      supply_quote_context: ["store", "consolidated"],
      supply_quote_status: ["draft", "received", "expired", "cancelled"],
      supply_shipping_type: ["free", "informed", "pending"],
      user_status: ["active", "inactive", "blocked"],
    },
  },
} as const
