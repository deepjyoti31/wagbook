// GENERATED FILE. Do not edit by hand.
// Run `npm run gen:db` after changing anything in supabase/migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          id: number;
          org_id: string;
          at: string;
          actor: string | null;
          action: string;
          table_name: string;
          row_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
        };
        Insert: {
          id?: number;
          org_id: string;
          at?: string;
          actor?: string | null;
          action: string;
          table_name: string;
          row_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
        };
        Update: {
          id?: number;
          org_id?: string;
          at?: string;
          actor?: string | null;
          action?: string;
          table_name?: string;
          row_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_items: {
        Row: {
          id: string;
          org_id: string;
          booking_id: string;
          service_id: string | null;
          description: string;
          quantity: number;
          unit_price_minor: number;
          tax_rate_bp: number;
          sac_code: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          booking_id: string;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price_minor: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          booking_id?: string;
          service_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_items_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "booking_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          kind: Database["public"]["Enums"]["booking_kind"];
          status: Database["public"]["Enums"]["booking_status"];
          start_date: string;
          end_date: string;
          kennel_id: string | null;
          rate_minor: number;
          discount_minor: number;
          tax_rate_bp: number;
          sac_code: string | null;
          expected_arrival: string | null;
          expected_departure: string | null;
          checked_in_at: string | null;
          checked_in_by: string | null;
          checked_out_at: string | null;
          checked_out_by: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          belongings: string | null;
          notes: string | null;
          source: string;
          group_id: string | null;
          public_token: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          kind?: Database["public"]["Enums"]["booking_kind"];
          status?: Database["public"]["Enums"]["booking_status"];
          start_date: string;
          end_date: string;
          kennel_id?: string | null;
          rate_minor: number;
          discount_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          expected_arrival?: string | null;
          expected_departure?: string | null;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          belongings?: string | null;
          notes?: string | null;
          source?: string;
          group_id?: string | null;
          public_token?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          pet_id?: string;
          kind?: Database["public"]["Enums"]["booking_kind"];
          status?: Database["public"]["Enums"]["booking_status"];
          start_date?: string;
          end_date?: string;
          kennel_id?: string | null;
          rate_minor?: number;
          discount_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          expected_arrival?: string | null;
          expected_departure?: string | null;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          belongings?: string | null;
          notes?: string | null;
          source?: string;
          group_id?: string | null;
          public_token?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "bookings_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "bookings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_org_id_kennel_id_fkey";
            columns: ["org_id", "kennel_id"];
            isOneToOne: false;
            referencedRelation: "kennels";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      care_items: {
        Row: {
          id: string;
          org_id: string;
          pet_id: string | null;
          kind: Database["public"]["Enums"]["care_kind"];
          label: string;
          details: string | null;
          due_time: string;
          requires_photo: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          pet_id?: string | null;
          kind: Database["public"]["Enums"]["care_kind"];
          label: string;
          details?: string | null;
          due_time: string;
          requires_photo?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          pet_id?: string | null;
          kind?: Database["public"]["Enums"]["care_kind"];
          label?: string;
          details?: string | null;
          due_time?: string;
          requires_photo?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "care_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "care_items_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      care_tasks: {
        Row: {
          id: string;
          org_id: string;
          booking_id: string;
          pet_id: string;
          care_item_id: string | null;
          task_date: string;
          kind: Database["public"]["Enums"]["care_kind"];
          label: string;
          details: string | null;
          due_time: string | null;
          status: Database["public"]["Enums"]["task_status"];
          done_at: string | null;
          done_by: string | null;
          note: string | null;
          photo_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          booking_id: string;
          pet_id: string;
          care_item_id?: string | null;
          task_date: string;
          kind: Database["public"]["Enums"]["care_kind"];
          label: string;
          details?: string | null;
          due_time?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          done_at?: string | null;
          done_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          booking_id?: string;
          pet_id?: string;
          care_item_id?: string | null;
          task_date?: string;
          kind?: Database["public"]["Enums"]["care_kind"];
          label?: string;
          details?: string | null;
          due_time?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          done_at?: string | null;
          done_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "care_tasks_org_id_booking_id_pet_id_fkey";
            columns: ["org_id", "booking_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id", "pet_id"];
          },
          {
            foreignKeyName: "care_tasks_org_id_care_item_id_fkey";
            columns: ["org_id", "care_item_id"];
            isOneToOne: false;
            referencedRelation: "care_items";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "care_tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          org_id: string;
          full_name: string;
          phone: string;
          alt_phone: string | null;
          email: string | null;
          address: string | null;
          city: string | null;
          postal_code: string | null;
          gst_state_code: string | null;
          tax_id: string | null;
          emergency_name: string | null;
          emergency_phone: string | null;
          notes: string | null;
          consent_at: string | null;
          consent_source: string | null;
          created_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          full_name: string;
          phone: string;
          alt_phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          postal_code?: string | null;
          gst_state_code?: string | null;
          tax_id?: string | null;
          emergency_name?: string | null;
          emergency_phone?: string | null;
          notes?: string | null;
          consent_at?: string | null;
          consent_source?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          full_name?: string;
          phone?: string;
          alt_phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          postal_code?: string | null;
          gst_state_code?: string | null;
          tax_id?: string | null;
          emergency_name?: string | null;
          emergency_phone?: string | null;
          notes?: string | null;
          consent_at?: string | null;
          consent_source?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          org_id: string;
          spent_on: string;
          category: string;
          vendor: string | null;
          description: string | null;
          amount_minor: number;
          method: Database["public"]["Enums"]["payment_method"] | null;
          booking_id: string | null;
          is_reimbursable: boolean;
          receipt_path: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          spent_on: string;
          category: string;
          vendor?: string | null;
          description?: string | null;
          amount_minor: number;
          method?: Database["public"]["Enums"]["payment_method"] | null;
          booking_id?: string | null;
          is_reimbursable?: boolean;
          receipt_path?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          spent_on?: string;
          category?: string;
          vendor?: string | null;
          description?: string | null;
          amount_minor?: number;
          method?: Database["public"]["Enums"]["payment_method"] | null;
          booking_id?: string | null;
          is_reimbursable?: boolean;
          receipt_path?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "expenses_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      incidents: {
        Row: {
          id: string;
          org_id: string;
          pet_id: string;
          booking_id: string | null;
          occurred_at: string;
          category: string;
          severity: Database["public"]["Enums"]["incident_severity"];
          description: string;
          action_taken: string | null;
          vet_visited: boolean;
          parent_notified_at: string | null;
          parent_notified_by: string | null;
          resolved_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          pet_id: string;
          booking_id?: string | null;
          occurred_at?: string;
          category: string;
          severity?: Database["public"]["Enums"]["incident_severity"];
          description: string;
          action_taken?: string | null;
          vet_visited?: boolean;
          parent_notified_at?: string | null;
          parent_notified_by?: string | null;
          resolved_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          pet_id?: string;
          booking_id?: string | null;
          occurred_at?: string;
          category?: string;
          severity?: Database["public"]["Enums"]["incident_severity"];
          description?: string;
          action_taken?: string | null;
          vet_visited?: boolean;
          parent_notified_at?: string | null;
          parent_notified_by?: string | null;
          resolved_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "incidents_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      intake_submissions: {
        Row: {
          id: string;
          org_id: string;
          status: Database["public"]["Enums"]["intake_status"];
          parent_name: string;
          parent_phone: string;
          requested_start: string | null;
          requested_end: string | null;
          payload: Json;
          consent_at: string;
          consent_text: string;
          client_id: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          status?: Database["public"]["Enums"]["intake_status"];
          parent_name: string;
          parent_phone: string;
          requested_start?: string | null;
          requested_end?: string | null;
          payload: Json;
          consent_at: string;
          consent_text: string;
          client_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          status?: Database["public"]["Enums"]["intake_status"];
          parent_name?: string;
          parent_phone?: string;
          requested_start?: string | null;
          requested_end?: string | null;
          payload?: Json;
          consent_at?: string;
          consent_text?: string;
          client_id?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "intake_submissions_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "intake_submissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_counters: {
        Row: {
          org_id: string;
          fiscal_year: string;
          last_seq: number;
        };
        Insert: {
          org_id: string;
          fiscal_year: string;
          last_seq?: number;
        };
        Update: {
          org_id?: string;
          fiscal_year?: string;
          last_seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_counters_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_lines: {
        Row: {
          id: string;
          org_id: string;
          invoice_id: string;
          sort_order: number;
          description: string;
          sac_code: string | null;
          quantity: number;
          unit_price_minor: number;
          discount_minor: number;
          taxable_minor: number;
          tax_rate_bp: number;
          cgst_minor: number;
          sgst_minor: number;
          igst_minor: number;
          tax_minor: number;
          total_minor: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          invoice_id: string;
          sort_order?: number;
          description: string;
          sac_code?: string | null;
          quantity: number;
          unit_price_minor: number;
          discount_minor?: number;
          taxable_minor: number;
          tax_rate_bp?: number;
          cgst_minor?: number;
          sgst_minor?: number;
          igst_minor?: number;
          tax_minor?: number;
          total_minor: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          invoice_id?: string;
          sort_order?: number;
          description?: string;
          sac_code?: string | null;
          quantity?: number;
          unit_price_minor?: number;
          discount_minor?: number;
          taxable_minor?: number;
          tax_rate_bp?: number;
          cgst_minor?: number;
          sgst_minor?: number;
          igst_minor?: number;
          tax_minor?: number;
          total_minor?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_lines_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_lines_org_id_invoice_id_fkey";
            columns: ["org_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          booking_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          number: string | null;
          fiscal_year: string | null;
          seq: number | null;
          issued_on: string | null;
          issued_by: string | null;
          is_tax_invoice: boolean;
          currency: string;
          seller: Json | null;
          buyer: Json | null;
          place_of_supply_state_code: string | null;
          subtotal_minor: number;
          discount_minor: number;
          taxable_minor: number;
          cgst_minor: number;
          sgst_minor: number;
          igst_minor: number;
          tax_minor: number;
          round_off_minor: number;
          total_minor: number;
          notes: string | null;
          public_token: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          booking_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          number?: string | null;
          fiscal_year?: string | null;
          seq?: number | null;
          issued_on?: string | null;
          issued_by?: string | null;
          is_tax_invoice?: boolean;
          currency?: string;
          seller?: Json | null;
          buyer?: Json | null;
          place_of_supply_state_code?: string | null;
          subtotal_minor?: number;
          discount_minor?: number;
          taxable_minor?: number;
          cgst_minor?: number;
          sgst_minor?: number;
          igst_minor?: number;
          tax_minor?: number;
          round_off_minor?: number;
          total_minor?: number;
          notes?: string | null;
          public_token?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          booking_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          number?: string | null;
          fiscal_year?: string | null;
          seq?: number | null;
          issued_on?: string | null;
          issued_by?: string | null;
          is_tax_invoice?: boolean;
          currency?: string;
          seller?: Json | null;
          buyer?: Json | null;
          place_of_supply_state_code?: string | null;
          subtotal_minor?: number;
          discount_minor?: number;
          taxable_minor?: number;
          cgst_minor?: number;
          sgst_minor?: number;
          igst_minor?: number;
          tax_minor?: number;
          round_off_minor?: number;
          total_minor?: number;
          notes?: string | null;
          public_token?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "invoices_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      kennels: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          zone: string | null;
          notes: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          zone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          zone?: string | null;
          notes?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kennels_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          org_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["member_role"];
          display_name: string;
          phone: string | null;
          is_active: boolean;
          accepted_at: string | null;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          display_name: string;
          phone?: string | null;
          is_active?: boolean;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          display_name?: string;
          phone?: string | null;
          is_active?: boolean;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          legal_name: string | null;
          phone: string | null;
          whatsapp_phone: string | null;
          email: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country_code: string;
          time_zone: string;
          currency: string;
          locale: string;
          tax_mode: Database["public"]["Enums"]["tax_mode"];
          tax_label: string | null;
          tax_id: string | null;
          gst_state_code: string | null;
          default_tax_rate_bp: number;
          prices_include_tax: boolean;
          invoice_prefix: string;
          fiscal_year_start_month: number;
          round_invoice_totals: boolean;
          upi_vpa: string | null;
          upi_payee_name: string | null;
          check_in_time: string;
          check_out_time: string;
          allow_overbooking: boolean;
          play_sessions_per_day: number;
          play_session_minutes: number;
          intake_enabled: boolean;
          intake_notice: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          legal_name?: string | null;
          phone?: string | null;
          whatsapp_phone?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country_code?: string;
          time_zone?: string;
          currency?: string;
          locale?: string;
          tax_mode?: Database["public"]["Enums"]["tax_mode"];
          tax_label?: string | null;
          tax_id?: string | null;
          gst_state_code?: string | null;
          default_tax_rate_bp?: number;
          prices_include_tax?: boolean;
          invoice_prefix?: string;
          fiscal_year_start_month?: number;
          round_invoice_totals?: boolean;
          upi_vpa?: string | null;
          upi_payee_name?: string | null;
          check_in_time?: string;
          check_out_time?: string;
          allow_overbooking?: boolean;
          play_sessions_per_day?: number;
          play_session_minutes?: number;
          intake_enabled?: boolean;
          intake_notice?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          legal_name?: string | null;
          phone?: string | null;
          whatsapp_phone?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country_code?: string;
          time_zone?: string;
          currency?: string;
          locale?: string;
          tax_mode?: Database["public"]["Enums"]["tax_mode"];
          tax_label?: string | null;
          tax_id?: string | null;
          gst_state_code?: string | null;
          default_tax_rate_bp?: number;
          prices_include_tax?: boolean;
          invoice_prefix?: string;
          fiscal_year_start_month?: number;
          round_invoice_totals?: boolean;
          upi_vpa?: string | null;
          upi_payee_name?: string | null;
          check_in_time?: string;
          check_out_time?: string;
          allow_overbooking?: boolean;
          play_sessions_per_day?: number;
          play_session_minutes?: number;
          intake_enabled?: boolean;
          intake_notice?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      payments: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          booking_id: string | null;
          invoice_id: string | null;
          direction: string;
          amount_minor: number;
          method: Database["public"]["Enums"]["payment_method"];
          reference: string | null;
          received_on: string;
          note: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          booking_id?: string | null;
          invoice_id?: string | null;
          direction?: string;
          amount_minor: number;
          method: Database["public"]["Enums"]["payment_method"];
          reference?: string | null;
          received_on: string;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          booking_id?: string | null;
          invoice_id?: string | null;
          direction?: string;
          amount_minor?: number;
          method?: Database["public"]["Enums"]["payment_method"];
          reference?: string | null;
          received_on?: string;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "payments_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "payments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_org_id_invoice_id_fkey";
            columns: ["org_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      peak_periods: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          start_date: string;
          end_date: string;
          no_refund: boolean;
          play_session_minutes: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          start_date: string;
          end_date: string;
          no_refund?: boolean;
          play_session_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          no_refund?: boolean;
          play_session_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peak_periods_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      pets: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          name: string;
          species: string;
          breed: string | null;
          sex: Database["public"]["Enums"]["pet_sex"];
          is_neutered: boolean | null;
          date_of_birth: string | null;
          weight_kg: number | null;
          color: string | null;
          microchip: string | null;
          photo_path: string | null;
          food_notes: string | null;
          medical_notes: string | null;
          allergies: string | null;
          behaviour_notes: string | null;
          flags: string[];
          vet_name: string | null;
          vet_phone: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          name: string;
          species?: string;
          breed?: string | null;
          sex?: Database["public"]["Enums"]["pet_sex"];
          is_neutered?: boolean | null;
          date_of_birth?: string | null;
          weight_kg?: number | null;
          color?: string | null;
          microchip?: string | null;
          photo_path?: string | null;
          food_notes?: string | null;
          medical_notes?: string | null;
          allergies?: string | null;
          behaviour_notes?: string | null;
          flags?: string[];
          vet_name?: string | null;
          vet_phone?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          name?: string;
          species?: string;
          breed?: string | null;
          sex?: Database["public"]["Enums"]["pet_sex"];
          is_neutered?: boolean | null;
          date_of_birth?: string | null;
          weight_kg?: number | null;
          color?: string | null;
          microchip?: string | null;
          photo_path?: string | null;
          food_notes?: string | null;
          medical_notes?: string | null;
          allergies?: string | null;
          behaviour_notes?: string | null;
          flags?: string[];
          vet_name?: string | null;
          vet_phone?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pets_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "pets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      play_sessions: {
        Row: {
          id: string;
          org_id: string;
          yard_id: string;
          booking_id: string;
          pet_id: string;
          session_date: string;
          starts_at: string;
          duration_minutes: number;
          status: Database["public"]["Enums"]["task_status"];
          done_at: string | null;
          done_by: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          yard_id: string;
          booking_id: string;
          pet_id: string;
          session_date: string;
          starts_at: string;
          duration_minutes: number;
          status?: Database["public"]["Enums"]["task_status"];
          done_at?: string | null;
          done_by?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          yard_id?: string;
          booking_id?: string;
          pet_id?: string;
          session_date?: string;
          starts_at?: string;
          duration_minutes?: number;
          status?: Database["public"]["Enums"]["task_status"];
          done_at?: string | null;
          done_by?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "play_sessions_org_id_booking_id_pet_id_fkey";
            columns: ["org_id", "booking_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id", "pet_id"];
          },
          {
            foreignKeyName: "play_sessions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "play_sessions_org_id_yard_id_fkey";
            columns: ["org_id", "yard_id"];
            isOneToOne: false;
            referencedRelation: "play_yards";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      play_yards: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "play_yards_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          org_id: string;
          kind: Database["public"]["Enums"]["service_kind"];
          name: string;
          unit: string;
          price_minor: number;
          tax_rate_bp: number | null;
          sac_code: string | null;
          is_default: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: Database["public"]["Enums"]["service_kind"];
          name: string;
          unit?: string;
          price_minor: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: Database["public"]["Enums"]["service_kind"];
          name?: string;
          unit?: string;
          price_minor?: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_default?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      stay_updates: {
        Row: {
          id: string;
          org_id: string;
          booking_id: string;
          pet_id: string;
          body: string;
          media_paths: string[];
          is_visible_to_parent: boolean;
          shared_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          booking_id: string;
          pet_id: string;
          body: string;
          media_paths?: string[];
          is_visible_to_parent?: boolean;
          shared_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          booking_id?: string;
          pet_id?: string;
          body?: string;
          media_paths?: string[];
          is_visible_to_parent?: boolean;
          shared_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stay_updates_org_id_booking_id_pet_id_fkey";
            columns: ["org_id", "booking_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id", "pet_id"];
          },
          {
            foreignKeyName: "stay_updates_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      vaccinations: {
        Row: {
          id: string;
          org_id: string;
          pet_id: string;
          vaccine: string;
          given_on: string | null;
          valid_until: string | null;
          certificate_path: string | null;
          notes: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          pet_id: string;
          vaccine: string;
          given_on?: string | null;
          valid_until?: string | null;
          certificate_path?: string | null;
          notes?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          pet_id?: string;
          vaccine?: string;
          given_on?: string | null;
          valid_until?: string | null;
          certificate_path?: string | null;
          notes?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vaccinations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
    };
    Views: {
      invoice_balances: {
        Row: {
          invoice_id: string | null;
          org_id: string | null;
          client_id: string | null;
          booking_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"] | null;
          number: string | null;
          total_minor: number | null;
          paid_minor: number | null;
          due_minor: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_intake: {
        Args: { p_submission: string };
        Returns: string;
      };
      available_kennels: {
        Args: { p_org: string; p_kind: Database["public"]["Enums"]["booking_kind"]; p_start: string; p_end: string };
        Returns: Database["public"]["Tables"]["kennels"]["Row"][];
      };
      create_organization: {
        Args: { p_name: string; p_slug: string; p_display_name: string };
        Returns: string;
      };
      default_intake_notice: {
        Args: { p_org_name: string };
        Returns: string;
      };
      fiscal_year_label: {
        Args: { p_date: string; p_start_month?: number };
        Returns: string;
      };
      generate_care_tasks: {
        Args: { p_org: string; p_date: string };
        Returns: number;
      };
      get_public_intake_form: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_public_invoice: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_public_stay: {
        Args: { p_token: string };
        Returns: Json;
      };
      invite_member_by_email: {
        Args: { p_org: string; p_email: string; p_role: Database["public"]["Enums"]["member_role"]; p_display_name: string };
        Returns: undefined;
      };
      issue_invoice: {
        Args: { p_invoice: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      my_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: { org_id: string; org_name: string; role: Database["public"]["Enums"]["member_role"]; invited_at: string }[];
      };
      my_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_org_ids_with_role: {
        Args: { p_roles: Database["public"]["Enums"]["member_role"][] };
        Returns: string[];
      };
      new_token: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      occupancy_by_day: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { day: string; occupied: number; capacity: number }[];
      };
      respond_to_invitation: {
        Args: { p_org: string; p_accept: boolean };
        Returns: undefined;
      };
      safe_date: {
        Args: { p_text: string };
        Returns: string;
      };
      stay_range: {
        Args: { p_kind: Database["public"]["Enums"]["booking_kind"]; p_start: string; p_end: string };
        Returns: unknown;
      };
      storage_org_id: {
        Args: { p_object_name: string };
        Returns: string;
      };
      submit_intake: {
        Args: { p_slug: string; p_payload: Json };
        Returns: boolean;
      };
      void_invoice: {
        Args: { p_invoice: string; p_reason: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
    };
    Enums: {
      booking_kind: "boarding" | "daycare";
      booking_status: "requested" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
      care_kind: "meal" | "medication" | "walk" | "play" | "cleaning" | "other";
      incident_severity: "low" | "medium" | "high";
      intake_status: "new" | "accepted" | "rejected" | "spam";
      invoice_status: "draft" | "issued" | "void";
      member_role: "owner" | "manager" | "staff";
      payment_method: "upi" | "cash" | "card" | "bank_transfer" | "other";
      pet_sex: "male" | "female" | "unknown";
      service_kind: "boarding" | "daycare" | "addon";
      task_status: "pending" | "done" | "skipped";
      tax_mode: "none" | "simple" | "gst_india";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

/** Row type of a table, e.g. Tables<"bookings">. */
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
/** Shape accepted when inserting into a table. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
/** Shape accepted when updating a table. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
/** Union of an enum's labels, e.g. Enums<"booking_status">. */
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
