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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          actor: string
          details_json: Json | null
          event: string
          id: string
          invoice_id: string | null
          timestamp: string
        }
        Insert: {
          actor: string
          details_json?: Json | null
          event: string
          id?: string
          invoice_id?: string | null
          timestamp?: string
        }
        Update: {
          actor?: string
          details_json?: Json | null
          event?: string
          id?: string
          invoice_id?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          extracted_json: Json | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          pdf_path: string | null
          status: string
          supplier_id: string | null
          total: number | null
          verdict: string | null
        }
        Insert: {
          created_at?: string
          extracted_json?: Json | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          pdf_path?: string | null
          status?: string
          supplier_id?: string | null
          total?: number | null
          verdict?: string | null
        }
        Update: {
          created_at?: string
          extracted_json?: Json | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          pdf_path?: string | null
          status?: string
          supplier_id?: string | null
          total?: number | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          email: string
          id: string
          name: string
          role: string
        }
        Insert: {
          email: string
          id?: string
          name: string
          role: string
        }
        Update: {
          email?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          account_name: string | null
          account_number: string | null
          aliases: string[]
          bank_name: string | null
          company_number: string | null
          created_at: string
          email_domain: string | null
          id: string
          internal_owner_staff_id: string | null
          legal_name: string
          phone_on_file: string | null
          sort_code: string | null
          status: string
          usual_terms_days: number | null
          vat_number: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          aliases?: string[]
          bank_name?: string | null
          company_number?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          internal_owner_staff_id?: string | null
          legal_name: string
          phone_on_file?: string | null
          sort_code?: string | null
          status?: string
          usual_terms_days?: number | null
          vat_number?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          aliases?: string[]
          bank_name?: string | null
          company_number?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          internal_owner_staff_id?: string | null
          legal_name?: string
          phone_on_file?: string | null
          sort_code?: string | null
          status?: string
          usual_terms_days?: number | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_internal_owner_staff_id_fkey"
            columns: ["internal_owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
