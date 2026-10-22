// GENERATED FILE. Do not edit by hand.
// Run `npm run gen:db` after changing anything in supabase/migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      appointment_items: {
        Row: {
          id: string;
          org_id: string;
          appointment_id: string;
          service_id: string;
          description: string;
          quantity: number;
          unit_price_minor: number;
          tax_rate_bp: number;
          sac_code: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          appointment_id: string;
          service_id: string;
          description: string;
          quantity?: number;
          unit_price_minor: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          appointment_id?: string;
          service_id?: string;
          description?: string;
          quantity?: number;
          unit_price_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_items_org_id_appointment_id_fkey";
            columns: ["org_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointment_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_items_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "appointment_services";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      appointment_places: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          opens: string;
          closes: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          opens?: string;
          closes?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          opens?: string;
          closes?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_places_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_service_prices: {
        Row: {
          id: string;
          org_id: string;
          service_id: string;
          size: Database["public"]["Enums"]["size_band"] | null;
          coat: Database["public"]["Enums"]["pet_coat"] | null;
          breed: string | null;
          price_minor: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          service_id: string;
          size?: Database["public"]["Enums"]["size_band"] | null;
          coat?: Database["public"]["Enums"]["pet_coat"] | null;
          breed?: string | null;
          price_minor: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          service_id?: string;
          size?: Database["public"]["Enums"]["size_band"] | null;
          coat?: Database["public"]["Enums"]["pet_coat"] | null;
          breed?: string | null;
          price_minor?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_service_prices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_service_prices_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "appointment_services";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      appointment_services: {
        Row: {
          id: string;
          org_id: string;
          kind: Database["public"]["Enums"]["appointment_kind"];
          name: string;
          minutes: number;
          cleanup_minutes: number;
          place_id: string | null;
          pricing: Database["public"]["Enums"]["appointment_pricing"];
          price_minor: number;
          tax_rate_bp: number | null;
          sac_code: string | null;
          skill: Database["public"]["Enums"]["staff_skill"] | null;
          checks_vaccinations: boolean;
          is_addon: boolean;
          max_people: number | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: Database["public"]["Enums"]["appointment_kind"];
          name: string;
          minutes?: number;
          cleanup_minutes?: number;
          place_id?: string | null;
          pricing?: Database["public"]["Enums"]["appointment_pricing"];
          price_minor?: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          skill?: Database["public"]["Enums"]["staff_skill"] | null;
          checks_vaccinations?: boolean;
          is_addon?: boolean;
          max_people?: number | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: Database["public"]["Enums"]["appointment_kind"];
          name?: string;
          minutes?: number;
          cleanup_minutes?: number;
          place_id?: string | null;
          pricing?: Database["public"]["Enums"]["appointment_pricing"];
          price_minor?: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          skill?: Database["public"]["Enums"]["staff_skill"] | null;
          checks_vaccinations?: boolean;
          is_addon?: boolean;
          max_people?: number | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_services_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_services_org_id_place_id_fkey";
            columns: ["org_id", "place_id"];
            isOneToOne: false;
            referencedRelation: "appointment_places";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          service_id: string;
          kind: Database["public"]["Enums"]["appointment_kind"];
          place_id: string | null;
          booking_id: string | null;
          course_id: string | null;
          in_package: boolean;
          status: Database["public"]["Enums"]["appointment_status"];
          starts_at: string;
          ends_at: string;
          cleanup_minutes: number;
          held_until: string;
          staff_id: string | null;
          price_minor: number | null;
          tax_rate_bp: number;
          sac_code: string | null;
          vaccinations_checked_at: string | null;
          vaccinations_checked_by: string | null;
          life_jacket: boolean | null;
          guest_pet_id: string | null;
          guest_vaccinations_checked_at: string | null;
          guest_vaccinations_checked_by: string | null;
          people: number | null;
          notes: string | null;
          after_notes: string | null;
          homework: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          done_at: string | null;
          done_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          service_id: string;
          kind?: Database["public"]["Enums"]["appointment_kind"];
          place_id?: string | null;
          booking_id?: string | null;
          course_id?: string | null;
          in_package?: boolean;
          status?: Database["public"]["Enums"]["appointment_status"];
          starts_at: string;
          ends_at: string;
          cleanup_minutes?: number;
          held_until?: string;
          staff_id?: string | null;
          price_minor?: number | null;
          tax_rate_bp?: number;
          sac_code?: string | null;
          vaccinations_checked_at?: string | null;
          vaccinations_checked_by?: string | null;
          life_jacket?: boolean | null;
          guest_pet_id?: string | null;
          guest_vaccinations_checked_at?: string | null;
          guest_vaccinations_checked_by?: string | null;
          people?: number | null;
          notes?: string | null;
          after_notes?: string | null;
          homework?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          done_at?: string | null;
          done_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          pet_id?: string;
          service_id?: string;
          kind?: Database["public"]["Enums"]["appointment_kind"];
          place_id?: string | null;
          booking_id?: string | null;
          course_id?: string | null;
          in_package?: boolean;
          status?: Database["public"]["Enums"]["appointment_status"];
          starts_at?: string;
          ends_at?: string;
          cleanup_minutes?: number;
          held_until?: string;
          staff_id?: string | null;
          price_minor?: number | null;
          tax_rate_bp?: number;
          sac_code?: string | null;
          vaccinations_checked_at?: string | null;
          vaccinations_checked_by?: string | null;
          life_jacket?: boolean | null;
          guest_pet_id?: string | null;
          guest_vaccinations_checked_at?: string | null;
          guest_vaccinations_checked_by?: string | null;
          people?: number | null;
          notes?: string | null;
          after_notes?: string | null;
          homework?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          done_at?: string | null;
          done_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_org_id_booking_id_pet_id_fkey";
            columns: ["org_id", "booking_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id", "pet_id"];
          },
          {
            foreignKeyName: "appointments_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_course_id_fkey";
            columns: ["org_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_org_id_guest_pet_id_fkey";
            columns: ["org_id", "guest_pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_place_id_fkey";
            columns: ["org_id", "place_id"];
            isOneToOne: false;
            referencedRelation: "appointment_places";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "appointment_services";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "appointments_org_id_staff_id_fkey";
            columns: ["org_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["org_id", "user_id"];
          },
        ];
      };
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
      batches: {
        Row: {
          id: string;
          org_id: string;
          number: string;
          recipe_id: string;
          version_id: string;
          cooked_on: string;
          grams: number;
          packs: number;
          use_by: string;
          cook_id: string | null;
          boarders_on: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          number: string;
          recipe_id: string;
          version_id: string;
          cooked_on: string;
          grams: number;
          packs: number;
          use_by: string;
          cook_id?: string | null;
          boarders_on?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          number?: string;
          recipe_id?: string;
          version_id?: string;
          cooked_on?: string;
          grams?: number;
          packs?: number;
          use_by?: string;
          cook_id?: string | null;
          boarders_on?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "batches_org_id_recipe_id_fkey";
            columns: ["org_id", "recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "batches_org_id_version_id_fkey";
            columns: ["org_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "recipe_versions";
            referencedColumns: ["org_id", "id"];
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
          in_package: boolean;
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
          in_package?: boolean;
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
          in_package?: boolean;
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
          alone_rate_minor: number | null;
          boarding_from: string | null;
          day_rate_minor: number | null;
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
          cancel_asked_at: string | null;
          cancelled_by_kennel: boolean;
          belongings: string | null;
          gate_notes: string | null;
          vaccinations_checked_at: string | null;
          vaccinations_checked_by: string | null;
          notes: string | null;
          source: string;
          group_id: string | null;
          series_id: string | null;
          pass_id: string | null;
          package_id: string | null;
          package_price_minor: number | null;
          waitlisted_at: string | null;
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
          alone_rate_minor?: number | null;
          boarding_from?: string | null;
          day_rate_minor?: number | null;
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
          cancel_asked_at?: string | null;
          cancelled_by_kennel?: boolean;
          belongings?: string | null;
          gate_notes?: string | null;
          vaccinations_checked_at?: string | null;
          vaccinations_checked_by?: string | null;
          notes?: string | null;
          source?: string;
          group_id?: string | null;
          series_id?: string | null;
          pass_id?: string | null;
          package_id?: string | null;
          package_price_minor?: number | null;
          waitlisted_at?: string | null;
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
          alone_rate_minor?: number | null;
          boarding_from?: string | null;
          day_rate_minor?: number | null;
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
          cancel_asked_at?: string | null;
          cancelled_by_kennel?: boolean;
          belongings?: string | null;
          gate_notes?: string | null;
          vaccinations_checked_at?: string | null;
          vaccinations_checked_by?: string | null;
          notes?: string | null;
          source?: string;
          group_id?: string | null;
          series_id?: string | null;
          pass_id?: string | null;
          package_id?: string | null;
          package_price_minor?: number | null;
          waitlisted_at?: string | null;
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
          {
            foreignKeyName: "bookings_package_fkey";
            columns: ["org_id", "package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "bookings_pass_fkey";
            columns: ["org_id", "pass_id"];
            isOneToOne: false;
            referencedRelation: "passes";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      cancellation_rules: {
        Row: {
          org_id: string;
          applies_to: Database["public"]["Enums"]["cancel_applies_to"];
          notice_hours: number;
          weekday_on_time: Database["public"]["Enums"]["cancel_outcome"];
          weekday_late: Database["public"]["Enums"]["cancel_outcome"];
          weekend_on_time: Database["public"]["Enums"]["cancel_outcome"];
          weekend_late: Database["public"]["Enums"]["cancel_outcome"];
          updated_at: string;
        };
        Insert: {
          org_id: string;
          applies_to: Database["public"]["Enums"]["cancel_applies_to"];
          notice_hours?: number;
          weekday_on_time?: Database["public"]["Enums"]["cancel_outcome"];
          weekday_late?: Database["public"]["Enums"]["cancel_outcome"];
          weekend_on_time?: Database["public"]["Enums"]["cancel_outcome"];
          weekend_late?: Database["public"]["Enums"]["cancel_outcome"];
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          applies_to?: Database["public"]["Enums"]["cancel_applies_to"];
          notice_hours?: number;
          weekday_on_time?: Database["public"]["Enums"]["cancel_outcome"];
          weekday_late?: Database["public"]["Enums"]["cancel_outcome"];
          weekend_on_time?: Database["public"]["Enums"]["cancel_outcome"];
          weekend_late?: Database["public"]["Enums"]["cancel_outcome"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_rules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
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
      client_addresses: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          kind: Database["public"]["Enums"]["address_kind"];
          line: string;
          area: string | null;
          postal_code: string;
          map_url: string | null;
          door_note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          kind?: Database["public"]["Enums"]["address_kind"];
          line: string;
          area?: string | null;
          postal_code: string;
          map_url?: string | null;
          door_note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          kind?: Database["public"]["Enums"]["address_kind"];
          line?: string;
          area?: string | null;
          postal_code?: string;
          map_url?: string | null;
          door_note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_addresses_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "client_addresses_org_id_fkey";
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
          bill_translation: string | null;
          request_token: string | null;
          created_by: string | null;
          deleted_at: string | null;
          erased_at: string | null;
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
          bill_translation?: string | null;
          request_token?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          erased_at?: string | null;
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
          bill_translation?: string | null;
          request_token?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          erased_at?: string | null;
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
      courses: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          service_id: string;
          name: string;
          sessions: number;
          price_minor: number;
          starts_on: string;
          invoice_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          service_id: string;
          name: string;
          sessions: number;
          price_minor: number;
          starts_on: string;
          invoice_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          pet_id?: string;
          service_id?: string;
          name?: string;
          sessions?: number;
          price_minor?: number;
          starts_on?: string;
          invoice_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_invoice_fkey";
            columns: ["org_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "courses_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "courses_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "courses_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "appointment_services";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      credit_note_lines: {
        Row: {
          id: string;
          org_id: string;
          credit_note_id: string;
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
        };
        Insert: {
          id?: string;
          org_id: string;
          credit_note_id: string;
          sort_order?: number;
          description: string;
          sac_code?: string | null;
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
        };
        Update: {
          id?: string;
          org_id?: string;
          credit_note_id?: string;
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
        };
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_org_id_credit_note_id_fkey";
            columns: ["org_id", "credit_note_id"];
            isOneToOne: false;
            referencedRelation: "credit_notes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "credit_note_lines_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_notes: {
        Row: {
          id: string;
          org_id: string;
          invoice_id: string;
          number: string;
          fiscal_year: string;
          seq: number;
          issued_on: string;
          issued_by: string | null;
          reason: string;
          currency: string;
          subtotal_minor: number;
          discount_minor: number;
          taxable_minor: number;
          cgst_minor: number;
          sgst_minor: number;
          igst_minor: number;
          tax_minor: number;
          round_off_minor: number;
          total_minor: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          invoice_id: string;
          number: string;
          fiscal_year: string;
          seq: number;
          issued_on: string;
          issued_by?: string | null;
          reason: string;
          currency: string;
          subtotal_minor: number;
          discount_minor: number;
          taxable_minor: number;
          cgst_minor: number;
          sgst_minor: number;
          igst_minor: number;
          tax_minor: number;
          round_off_minor: number;
          total_minor: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          invoice_id?: string;
          number?: string;
          fiscal_year?: string;
          seq?: number;
          issued_on?: string;
          issued_by?: string | null;
          reason?: string;
          currency?: string;
          subtotal_minor?: number;
          discount_minor?: number;
          taxable_minor?: number;
          cgst_minor?: number;
          sgst_minor?: number;
          igst_minor?: number;
          tax_minor?: number;
          round_off_minor?: number;
          total_minor?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_notes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_notes_org_id_invoice_id_fkey";
            columns: ["org_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      credit_uses: {
        Row: {
          id: string;
          org_id: string;
          credit_id: string;
          payment_id: string;
          amount_minor: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          credit_id: string;
          payment_id: string;
          amount_minor: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          credit_id?: string;
          payment_id?: string;
          amount_minor?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_uses_org_id_credit_id_fkey";
            columns: ["org_id", "credit_id"];
            isOneToOne: false;
            referencedRelation: "credits";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "credit_uses_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_uses_payment_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      credits: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          kind: Database["public"]["Enums"]["credit_kind"];
          amount_minor: number;
          expires_on: string;
          reason: string;
          payment_id: string | null;
          booking_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          kind: Database["public"]["Enums"]["credit_kind"];
          amount_minor: number;
          expires_on: string;
          reason: string;
          payment_id?: string | null;
          booking_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          kind?: Database["public"]["Enums"]["credit_kind"];
          amount_minor?: number;
          expires_on?: string;
          reason?: string;
          payment_id?: string | null;
          booking_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credits_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "credits_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "credits_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credits_payment_fkey";
            columns: ["payment_id"];
            isOneToOne: true;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      day_packs: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          days: number;
          price_minor: number;
          valid_days: number;
          tax_rate_bp: number | null;
          sac_code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          days: number;
          price_minor: number;
          valid_days: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          days?: number;
          price_minor?: number;
          valid_days?: number;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "day_packs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      deliveries: {
        Row: {
          id: string;
          org_id: string;
          kind: Database["public"]["Enums"]["delivery_kind"];
          client_id: string;
          pet_id: string;
          subscription_id: string | null;
          product_id: string | null;
          delivery_date: string;
          slot: Database["public"]["Enums"]["delivery_slot"];
          address_id: string | null;
          covers_days: number | null;
          grams: number;
          packs: number;
          quantity: number;
          recipe_id: string | null;
          version_id: string | null;
          unit_price_minor: number;
          price_minor: number;
          delivery_charge_minor: number;
          tax_rate_bp: number;
          sac_code: string | null;
          status: Database["public"]["Enums"]["delivery_status"];
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          superseded: boolean;
          batch_id: string | null;
          packed_at: string | null;
          packed_by: string | null;
          run_id: string | null;
          run_position: number | null;
          delivered_at: string | null;
          proof_path: string | null;
          replaces_id: string | null;
          appointment_id: string | null;
          inscription: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: Database["public"]["Enums"]["delivery_kind"];
          client_id: string;
          pet_id: string;
          subscription_id?: string | null;
          product_id?: string | null;
          delivery_date: string;
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          covers_days?: number | null;
          grams?: number;
          packs?: number;
          quantity?: number;
          recipe_id?: string | null;
          version_id?: string | null;
          unit_price_minor?: number;
          price_minor?: number;
          delivery_charge_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          superseded?: boolean;
          batch_id?: string | null;
          packed_at?: string | null;
          packed_by?: string | null;
          run_id?: string | null;
          run_position?: number | null;
          delivered_at?: string | null;
          proof_path?: string | null;
          replaces_id?: string | null;
          appointment_id?: string | null;
          inscription?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: Database["public"]["Enums"]["delivery_kind"];
          client_id?: string;
          pet_id?: string;
          subscription_id?: string | null;
          product_id?: string | null;
          delivery_date?: string;
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          covers_days?: number | null;
          grams?: number;
          packs?: number;
          quantity?: number;
          recipe_id?: string | null;
          version_id?: string | null;
          unit_price_minor?: number;
          price_minor?: number;
          delivery_charge_minor?: number;
          tax_rate_bp?: number;
          sac_code?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          superseded?: boolean;
          batch_id?: string | null;
          packed_at?: string | null;
          packed_by?: string | null;
          run_id?: string | null;
          run_position?: number | null;
          delivered_at?: string | null;
          proof_path?: string | null;
          replaces_id?: string | null;
          appointment_id?: string | null;
          inscription?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliveries_org_id_address_id_fkey";
            columns: ["org_id", "address_id"];
            isOneToOne: false;
            referencedRelation: "client_addresses";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_appointment_id_fkey";
            columns: ["org_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_batch_id_fkey";
            columns: ["org_id", "batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliveries_org_id_product_id_fkey";
            columns: ["org_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "food_products";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_recipe_id_fkey";
            columns: ["org_id", "recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_replaces_id_fkey";
            columns: ["org_id", "replaces_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_run_id_fkey";
            columns: ["org_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "delivery_runs";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_subscription_id_fkey";
            columns: ["org_id", "subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "deliveries_org_id_version_id_fkey";
            columns: ["org_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "recipe_versions";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      delivery_problems: {
        Row: {
          id: string;
          org_id: string;
          delivery_id: string;
          kind: Database["public"]["Enums"]["problem_kind"];
          note: string | null;
          photo_path: string | null;
          reported_at: string;
          reported_by: string | null;
          outcome: Database["public"]["Enums"]["problem_outcome"] | null;
          replacement_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          delivery_id: string;
          kind: Database["public"]["Enums"]["problem_kind"];
          note?: string | null;
          photo_path?: string | null;
          reported_at?: string;
          reported_by?: string | null;
          outcome?: Database["public"]["Enums"]["problem_outcome"] | null;
          replacement_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          delivery_id?: string;
          kind?: Database["public"]["Enums"]["problem_kind"];
          note?: string | null;
          photo_path?: string | null;
          reported_at?: string;
          reported_by?: string | null;
          outcome?: Database["public"]["Enums"]["problem_outcome"] | null;
          replacement_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_problems_org_id_delivery_id_fkey";
            columns: ["org_id", "delivery_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "delivery_problems_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_problems_org_id_replacement_id_fkey";
            columns: ["org_id", "replacement_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      delivery_runs: {
        Row: {
          id: string;
          org_id: string;
          run_date: string;
          slot: Database["public"]["Enums"]["delivery_slot"];
          rider_id: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          run_date: string;
          slot: Database["public"]["Enums"]["delivery_slot"];
          rider_id: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          run_date?: string;
          slot?: Database["public"]["Enums"]["delivery_slot"];
          rider_id?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_runs_org_id_fkey";
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
      food_orders: {
        Row: {
          id: string;
          org_id: string;
          public_token: string;
          kind: Database["public"]["Enums"]["food_order_kind"];
          status: Database["public"]["Enums"]["food_order_status"];
          client_id: string | null;
          subscription_id: string | null;
          parent_name: string | null;
          phone: string | null;
          pet_name: string | null;
          weight_g: number | null;
          plan: Database["public"]["Enums"]["food_plan"] | null;
          grams_per_day: number | null;
          weekdays: number[] | null;
          slot: Database["public"]["Enums"]["delivery_slot"] | null;
          line: string | null;
          area: string | null;
          postal_code: string | null;
          door_note: string | null;
          starts_on: string | null;
          until_date: string | null;
          grams: number | null;
          amount_minor: number | null;
          note: string | null;
          consent_text: string | null;
          paid_claimed_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          public_token?: string;
          kind: Database["public"]["Enums"]["food_order_kind"];
          status: Database["public"]["Enums"]["food_order_status"];
          client_id?: string | null;
          subscription_id?: string | null;
          parent_name?: string | null;
          phone?: string | null;
          pet_name?: string | null;
          weight_g?: number | null;
          plan?: Database["public"]["Enums"]["food_plan"] | null;
          grams_per_day?: number | null;
          weekdays?: number[] | null;
          slot?: Database["public"]["Enums"]["delivery_slot"] | null;
          line?: string | null;
          area?: string | null;
          postal_code?: string | null;
          door_note?: string | null;
          starts_on?: string | null;
          until_date?: string | null;
          grams?: number | null;
          amount_minor?: number | null;
          note?: string | null;
          consent_text?: string | null;
          paid_claimed_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          public_token?: string;
          kind?: Database["public"]["Enums"]["food_order_kind"];
          status?: Database["public"]["Enums"]["food_order_status"];
          client_id?: string | null;
          subscription_id?: string | null;
          parent_name?: string | null;
          phone?: string | null;
          pet_name?: string | null;
          weight_g?: number | null;
          plan?: Database["public"]["Enums"]["food_plan"] | null;
          grams_per_day?: number | null;
          weekdays?: number[] | null;
          slot?: Database["public"]["Enums"]["delivery_slot"] | null;
          line?: string | null;
          area?: string | null;
          postal_code?: string | null;
          door_note?: string | null;
          starts_on?: string | null;
          until_date?: string | null;
          grams?: number | null;
          amount_minor?: number | null;
          note?: string | null;
          consent_text?: string | null;
          paid_claimed_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "food_orders_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "food_orders_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "food_orders_org_id_subscription_id_fkey";
            columns: ["org_id", "subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      food_products: {
        Row: {
          id: string;
          org_id: string;
          kind: Database["public"]["Enums"]["food_product_kind"];
          name: string;
          price_minor: number;
          trial_grams: number | null;
          tax_rate_bp: number | null;
          sac_code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: Database["public"]["Enums"]["food_product_kind"];
          name: string;
          price_minor: number;
          trial_grams?: number | null;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: Database["public"]["Enums"]["food_product_kind"];
          name?: string;
          price_minor?: number;
          trial_grams?: number | null;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "food_products_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      health_overrides: {
        Row: {
          id: string;
          org_id: string;
          booking_id: string | null;
          appointment_id: string | null;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          booking_id?: string | null;
          appointment_id?: string | null;
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          booking_id?: string | null;
          appointment_id?: string | null;
          reason?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "health_overrides_org_id_appointment_id_fkey";
            columns: ["org_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "health_overrides_org_id_booking_id_fkey";
            columns: ["org_id", "booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "health_overrides_org_id_fkey";
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
          upload_token: string;
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
          upload_token?: string;
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
          upload_token?: string;
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
      invitation_links: {
        Row: {
          id: string;
          org_id: string;
          token: string;
          role: Database["public"]["Enums"]["member_role"];
          display_name: string;
          created_by: string | null;
          created_at: string;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          token?: string;
          role: Database["public"]["Enums"]["member_role"];
          display_name: string;
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          token?: string;
          role?: Database["public"]["Enums"]["member_role"];
          display_name?: string;
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitation_links_org_id_fkey";
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
          series: string;
          fiscal_year: string;
          last_seq: number;
        };
        Insert: {
          org_id: string;
          series?: string;
          fiscal_year: string;
          last_seq?: number;
        };
        Update: {
          org_id?: string;
          series?: string;
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
          group_id: string | null;
          series_id: string | null;
          series_month: string | null;
          subscription_id: string | null;
          period_start: string | null;
          period_end: string | null;
          delivery_id: string | null;
          appointment_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          number: string | null;
          fiscal_year: string | null;
          seq: number | null;
          issued_on: string | null;
          issued_by: string | null;
          is_tax_invoice: boolean;
          prices_include_tax: boolean;
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
          group_id?: string | null;
          series_id?: string | null;
          series_month?: string | null;
          subscription_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          delivery_id?: string | null;
          appointment_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          number?: string | null;
          fiscal_year?: string | null;
          seq?: number | null;
          issued_on?: string | null;
          issued_by?: string | null;
          is_tax_invoice?: boolean;
          prices_include_tax?: boolean;
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
          group_id?: string | null;
          series_id?: string | null;
          series_month?: string | null;
          subscription_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          delivery_id?: string | null;
          appointment_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          number?: string | null;
          fiscal_year?: string | null;
          seq?: number | null;
          issued_on?: string | null;
          issued_by?: string | null;
          is_tax_invoice?: boolean;
          prices_include_tax?: boolean;
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
            foreignKeyName: "invoices_delivery_fkey";
            columns: ["org_id", "delivery_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "invoices_org_id_appointment_id_fkey";
            columns: ["org_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["org_id", "id"];
          },
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
          {
            foreignKeyName: "invoices_subscription_fkey";
            columns: ["org_id", "subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["org_id", "id"];
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
          language: string;
          skills: Database["public"]["Enums"]["staff_skill"][];
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
          language?: string;
          skills?: Database["public"]["Enums"]["staff_skill"][];
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
          language?: string;
          skills?: Database["public"]["Enums"]["staff_skill"][];
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
          play_changeover_minutes: number;
          play_day_start: string;
          play_day_end: string;
          play_break_start: string | null;
          play_break_end: string | null;
          intake_enabled: boolean;
          requests_enabled: boolean;
          intake_notice: string | null;
          parent_language: string;
          offers_appointments: boolean;
          offers_kitchen: boolean;
          offers_food_delivery: boolean;
          portion_small_bp: number;
          portion_medium_bp: number;
          portion_large_bp: number;
          small_dog_max_g: number;
          medium_dog_max_g: number;
          topper_share_bp: number;
          goal_change_bp: number;
          food_pack_g: number;
          food_cutoff_hours: number;
          monthly_food_discount_bp: number;
          cook_margin_bp: number;
          problem_window_hours: number;
          food_orders_enabled: boolean;
          item_lead_hours: number;
          weekend_days: number[];
          credit_months: number;
          health_check: string;
          deworm_days: number | null;
          tick_days: number | null;
          neuter_months: number | null;
          review_url: string | null;
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
          play_changeover_minutes?: number;
          play_day_start?: string;
          play_day_end?: string;
          play_break_start?: string | null;
          play_break_end?: string | null;
          intake_enabled?: boolean;
          requests_enabled?: boolean;
          intake_notice?: string | null;
          parent_language?: string;
          offers_appointments?: boolean;
          offers_kitchen?: boolean;
          offers_food_delivery?: boolean;
          portion_small_bp?: number;
          portion_medium_bp?: number;
          portion_large_bp?: number;
          small_dog_max_g?: number;
          medium_dog_max_g?: number;
          topper_share_bp?: number;
          goal_change_bp?: number;
          food_pack_g?: number;
          food_cutoff_hours?: number;
          monthly_food_discount_bp?: number;
          cook_margin_bp?: number;
          problem_window_hours?: number;
          food_orders_enabled?: boolean;
          item_lead_hours?: number;
          weekend_days?: number[];
          credit_months?: number;
          health_check?: string;
          deworm_days?: number | null;
          tick_days?: number | null;
          neuter_months?: number | null;
          review_url?: string | null;
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
          play_changeover_minutes?: number;
          play_day_start?: string;
          play_day_end?: string;
          play_break_start?: string | null;
          play_break_end?: string | null;
          intake_enabled?: boolean;
          requests_enabled?: boolean;
          intake_notice?: string | null;
          parent_language?: string;
          offers_appointments?: boolean;
          offers_kitchen?: boolean;
          offers_food_delivery?: boolean;
          portion_small_bp?: number;
          portion_medium_bp?: number;
          portion_large_bp?: number;
          small_dog_max_g?: number;
          medium_dog_max_g?: number;
          topper_share_bp?: number;
          goal_change_bp?: number;
          food_pack_g?: number;
          food_cutoff_hours?: number;
          monthly_food_discount_bp?: number;
          cook_margin_bp?: number;
          problem_window_hours?: number;
          food_orders_enabled?: boolean;
          item_lead_hours?: number;
          weekend_days?: number[];
          credit_months?: number;
          health_check?: string;
          deworm_days?: number | null;
          tick_days?: number | null;
          neuter_months?: number | null;
          review_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      package_parts: {
        Row: {
          id: string;
          org_id: string;
          package_id: string;
          service_id: string | null;
          extra_id: string | null;
          on_day: Database["public"]["Enums"]["package_day"] | null;
          quantity: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          package_id: string;
          service_id?: string | null;
          extra_id?: string | null;
          on_day?: Database["public"]["Enums"]["package_day"] | null;
          quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          package_id?: string;
          service_id?: string | null;
          extra_id?: string | null;
          on_day?: Database["public"]["Enums"]["package_day"] | null;
          quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "package_parts_org_id_extra_id_fkey";
            columns: ["org_id", "extra_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "package_parts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "package_parts_org_id_package_id_fkey";
            columns: ["org_id", "package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "package_parts_org_id_service_id_fkey";
            columns: ["org_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "appointment_services";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      packages: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          kind: Database["public"]["Enums"]["booking_kind"];
          price_minor: number | null;
          tax_rate_bp: number | null;
          sac_code: string | null;
          about: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          kind?: Database["public"]["Enums"]["booking_kind"];
          price_minor?: number | null;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          about?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          kind?: Database["public"]["Enums"]["booking_kind"];
          price_minor?: number | null;
          tax_rate_bp?: number | null;
          sac_code?: string | null;
          about?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "packages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      passes: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          day_pack_id: string | null;
          name: string;
          days: number;
          price_minor: number;
          starts_on: string;
          valid_until: string;
          invoice_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          day_pack_id?: string | null;
          name: string;
          days: number;
          price_minor: number;
          starts_on: string;
          valid_until: string;
          invoice_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          day_pack_id?: string | null;
          name?: string;
          days?: number;
          price_minor?: number;
          starts_on?: string;
          valid_until?: string;
          invoice_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passes_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "passes_org_id_day_pack_id_fkey";
            columns: ["org_id", "day_pack_id"];
            isOneToOne: false;
            referencedRelation: "day_packs";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "passes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passes_org_id_invoice_id_fkey";
            columns: ["org_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["org_id", "id"];
          },
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
          is_holiday: boolean;
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
          is_holiday?: boolean;
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
          is_holiday?: boolean;
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
      pet_food: {
        Row: {
          org_id: string;
          pet_id: string;
          plan: Database["public"]["Enums"]["food_plan"];
          goal: Database["public"]["Enums"]["food_goal"];
          grams_by_hand: number | null;
          by_hand_note: string | null;
          boarder_food: Database["public"]["Enums"]["boarder_food"];
          kibble_brand: string | null;
          kibble_g_per_day: number | null;
          avoid: string | null;
          started_on: string | null;
          reviewed_on: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          pet_id: string;
          plan?: Database["public"]["Enums"]["food_plan"];
          goal?: Database["public"]["Enums"]["food_goal"];
          grams_by_hand?: number | null;
          by_hand_note?: string | null;
          boarder_food?: Database["public"]["Enums"]["boarder_food"];
          kibble_brand?: string | null;
          kibble_g_per_day?: number | null;
          avoid?: string | null;
          started_on?: string | null;
          reviewed_on?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          pet_id?: string;
          plan?: Database["public"]["Enums"]["food_plan"];
          goal?: Database["public"]["Enums"]["food_goal"];
          grams_by_hand?: number | null;
          by_hand_note?: string | null;
          boarder_food?: Database["public"]["Enums"]["boarder_food"];
          kibble_brand?: string | null;
          kibble_g_per_day?: number | null;
          avoid?: string | null;
          started_on?: string | null;
          reviewed_on?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_food_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_food_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: true;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      pet_grooming: {
        Row: {
          org_id: string;
          pet_id: string;
          usual_cut: string | null;
          products: string | null;
          skin: string | null;
          behaviour: string | null;
          every_weeks: number | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          pet_id: string;
          usual_cut?: string | null;
          products?: string | null;
          skin?: string | null;
          behaviour?: string | null;
          every_weeks?: number | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          pet_id?: string;
          usual_cut?: string | null;
          products?: string | null;
          skin?: string | null;
          behaviour?: string | null;
          every_weeks?: number | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_grooming_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_grooming_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: true;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      pet_weights: {
        Row: {
          id: string;
          org_id: string;
          pet_id: string;
          weighed_on: string;
          weight_g: number;
          body_condition: number | null;
          notes: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          pet_id: string;
          weighed_on: string;
          weight_g: number;
          body_condition?: number | null;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          pet_id?: string;
          weighed_on?: string;
          weight_g?: number;
          body_condition?: number | null;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_weights_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_weights_org_id_pet_id_fkey";
            columns: ["org_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "id"];
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
          weight_g: number | null;
          target_weight_g: number | null;
          color: string | null;
          coat: Database["public"]["Enums"]["pet_coat"] | null;
          dewormed_on: string | null;
          tick_treated_on: string | null;
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
          weight_g?: number | null;
          target_weight_g?: number | null;
          color?: string | null;
          coat?: Database["public"]["Enums"]["pet_coat"] | null;
          dewormed_on?: string | null;
          tick_treated_on?: string | null;
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
          weight_g?: number | null;
          target_weight_g?: number | null;
          color?: string | null;
          coat?: Database["public"]["Enums"]["pet_coat"] | null;
          dewormed_on?: string | null;
          tick_treated_on?: string | null;
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
          client_id: string;
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
          client_id: string;
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
          client_id?: string;
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
      recipe_ingredients: {
        Row: {
          org_id: string;
          version_id: string;
          item_id: string;
          quantity_per_kg: number;
        };
        Insert: {
          org_id: string;
          version_id: string;
          item_id: string;
          quantity_per_kg: number;
        };
        Update: {
          org_id?: string;
          version_id?: string;
          item_id?: string;
          quantity_per_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_org_id_item_id_fkey";
            columns: ["org_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "stock_items";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "recipe_ingredients_org_id_version_id_fkey";
            columns: ["org_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "recipe_versions";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      recipe_versions: {
        Row: {
          id: string;
          org_id: string;
          recipe_id: string;
          version: number;
          good_for: string | null;
          cooked_yield_bp: number | null;
          kcal_per_kg: number | null;
          protein_g_per_kg: number | null;
          signed_off_by: string | null;
          signed_off_on: string | null;
          lab_tested_on: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          recipe_id: string;
          version: number;
          good_for?: string | null;
          cooked_yield_bp?: number | null;
          kcal_per_kg?: number | null;
          protein_g_per_kg?: number | null;
          signed_off_by?: string | null;
          signed_off_on?: string | null;
          lab_tested_on?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          recipe_id?: string;
          version?: number;
          good_for?: string | null;
          cooked_yield_bp?: number | null;
          kcal_per_kg?: number | null;
          protein_g_per_kg?: number | null;
          signed_off_by?: string | null;
          signed_off_on?: string | null;
          lab_tested_on?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_versions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_versions_org_id_recipe_id_fkey";
            columns: ["org_id", "recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          rotation_position: number | null;
          use_by_days: number;
          storage_note: string | null;
          is_retired: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          rotation_position?: number | null;
          use_by_days?: number;
          storage_note?: string | null;
          is_retired?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          rotation_position?: number | null;
          use_by_days?: number;
          storage_note?: string | null;
          is_retired?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      recovery_codes: {
        Row: {
          id: string;
          user_id: string;
          factor_id: string;
          code_hash: string;
          used_at: string | null;
          used_in_session: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          factor_id: string;
          code_hash: string;
          used_at?: string | null;
          used_in_session?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          factor_id?: string;
          code_hash?: string;
          used_at?: string | null;
          used_in_session?: string | null;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      reminders_sent: {
        Row: {
          id: string;
          org_id: string;
          kind: string;
          subject_id: string;
          sent_on: string;
          sent_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: string;
          subject_id: string;
          sent_on: string;
          sent_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          kind?: string;
          subject_id?: string;
          sent_on?: string;
          sent_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_sent_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      required_vaccines: {
        Row: {
          id: string;
          org_id: string;
          vaccine: string;
          months_valid: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          vaccine: string;
          months_valid?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          vaccine?: string;
          months_valid?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "required_vaccines_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      service_areas: {
        Row: {
          id: string;
          org_id: string;
          postal_code: string;
          name: string;
          delivery_charge_minor: number | null;
          trip_charge_minor: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          postal_code: string;
          name: string;
          delivery_charge_minor?: number | null;
          trip_charge_minor?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          postal_code?: string;
          name?: string;
          delivery_charge_minor?: number | null;
          trip_charge_minor?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_areas_org_id_fkey";
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
          shared_price_minor: number | null;
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
          shared_price_minor?: number | null;
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
          shared_price_minor?: number | null;
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
      stock_costs: {
        Row: {
          org_id: string;
          move_id: string;
          cost_minor: number;
          bill_number: string | null;
          bill_path: string | null;
          expense_id: string | null;
          created_at: string;
        };
        Insert: {
          org_id: string;
          move_id: string;
          cost_minor: number;
          bill_number?: string | null;
          bill_path?: string | null;
          expense_id?: string | null;
          created_at?: string;
        };
        Update: {
          org_id?: string;
          move_id?: string;
          cost_minor?: number;
          bill_number?: string | null;
          bill_path?: string | null;
          expense_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_costs_org_id_expense_id_fkey";
            columns: ["org_id", "expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "stock_costs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_costs_org_id_move_id_fkey";
            columns: ["org_id", "move_id"];
            isOneToOne: true;
            referencedRelation: "stock_moves";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      stock_items: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          unit: Database["public"]["Enums"]["stock_unit"];
          kind: Database["public"]["Enums"]["stock_kind"];
          supplier_id: string | null;
          low_level: number | null;
          never_in_recipe: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          unit: Database["public"]["Enums"]["stock_unit"];
          kind: Database["public"]["Enums"]["stock_kind"];
          supplier_id?: string | null;
          low_level?: number | null;
          never_in_recipe?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          unit?: Database["public"]["Enums"]["stock_unit"];
          kind?: Database["public"]["Enums"]["stock_kind"];
          supplier_id?: string | null;
          low_level?: number | null;
          never_in_recipe?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_items_org_id_supplier_id_fkey";
            columns: ["org_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      stock_moves: {
        Row: {
          id: string;
          org_id: string;
          item_id: string;
          kind: Database["public"]["Enums"]["stock_move_kind"];
          quantity: number;
          happened_on: string;
          supplier_id: string | null;
          use_by: string | null;
          reason: Database["public"]["Enums"]["waste_reason"] | null;
          counted: number | null;
          batch_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          item_id: string;
          kind: Database["public"]["Enums"]["stock_move_kind"];
          quantity: number;
          happened_on: string;
          supplier_id?: string | null;
          use_by?: string | null;
          reason?: Database["public"]["Enums"]["waste_reason"] | null;
          counted?: number | null;
          batch_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          item_id?: string;
          kind?: Database["public"]["Enums"]["stock_move_kind"];
          quantity?: number;
          happened_on?: string;
          supplier_id?: string | null;
          use_by?: string | null;
          reason?: Database["public"]["Enums"]["waste_reason"] | null;
          counted?: number | null;
          batch_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_moves_batch_fkey";
            columns: ["org_id", "batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "stock_moves_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_moves_org_id_item_id_fkey";
            columns: ["org_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "stock_items";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "stock_moves_org_id_supplier_id_fkey";
            columns: ["org_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          product_id: string;
          plan: Database["public"]["Enums"]["food_plan"];
          grams_per_day: number;
          weekdays: number[];
          slot: Database["public"]["Enums"]["delivery_slot"];
          address_id: string | null;
          starts_on: string;
          pay_period: Database["public"]["Enums"]["pay_period"];
          source: Database["public"]["Enums"]["customer_source"];
          paused_from: string | null;
          paused_until: string | null;
          cancelled_on: string | null;
          cancel_reason: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          pet_id: string;
          product_id: string;
          plan?: Database["public"]["Enums"]["food_plan"];
          grams_per_day: number;
          weekdays: number[];
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          starts_on: string;
          pay_period?: Database["public"]["Enums"]["pay_period"];
          source?: Database["public"]["Enums"]["customer_source"];
          paused_from?: string | null;
          paused_until?: string | null;
          cancelled_on?: string | null;
          cancel_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          pet_id?: string;
          product_id?: string;
          plan?: Database["public"]["Enums"]["food_plan"];
          grams_per_day?: number;
          weekdays?: number[];
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          starts_on?: string;
          pay_period?: Database["public"]["Enums"]["pay_period"];
          source?: Database["public"]["Enums"]["customer_source"];
          paused_from?: string | null;
          paused_until?: string | null;
          cancelled_on?: string | null;
          cancel_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_address_id_fkey";
            columns: ["org_id", "address_id"];
            isOneToOne: false;
            referencedRelation: "client_addresses";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "subscriptions_org_id_client_id_fkey";
            columns: ["org_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "subscriptions_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_org_id_product_id_fkey";
            columns: ["org_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "food_products";
            referencedColumns: ["org_id", "id"];
          },
        ];
      };
      suppliers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          phone: string | null;
          supplies: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          phone?: string | null;
          supplies?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          phone?: string | null;
          supplies?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          id: string;
          org_id: string;
          booking_id: string;
          client_id: string;
          pet_id: string;
          kind: Database["public"]["Enums"]["trip_kind"];
          trip_date: string;
          at_time: string;
          slot: Database["public"]["Enums"]["delivery_slot"];
          address_id: string | null;
          price_minor: number | null;
          tax_rate_bp: number;
          sac_code: string | null;
          status: Database["public"]["Enums"]["trip_status"];
          cancel_reason: string | null;
          run_id: string | null;
          run_position: number | null;
          done_at: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          booking_id: string;
          client_id: string;
          pet_id: string;
          kind: Database["public"]["Enums"]["trip_kind"];
          trip_date: string;
          at_time: string;
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          price_minor?: number | null;
          tax_rate_bp?: number;
          sac_code?: string | null;
          status?: Database["public"]["Enums"]["trip_status"];
          cancel_reason?: string | null;
          run_id?: string | null;
          run_position?: number | null;
          done_at?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          booking_id?: string;
          client_id?: string;
          pet_id?: string;
          kind?: Database["public"]["Enums"]["trip_kind"];
          trip_date?: string;
          at_time?: string;
          slot?: Database["public"]["Enums"]["delivery_slot"];
          address_id?: string | null;
          price_minor?: number | null;
          tax_rate_bp?: number;
          sac_code?: string | null;
          status?: Database["public"]["Enums"]["trip_status"];
          cancel_reason?: string | null;
          run_id?: string | null;
          run_position?: number | null;
          done_at?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_org_id_address_id_fkey";
            columns: ["org_id", "address_id"];
            isOneToOne: false;
            referencedRelation: "client_addresses";
            referencedColumns: ["org_id", "id"];
          },
          {
            foreignKeyName: "trips_org_id_booking_id_pet_id_fkey";
            columns: ["org_id", "booking_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["org_id", "id", "pet_id"];
          },
          {
            foreignKeyName: "trips_org_id_client_id_pet_id_fkey";
            columns: ["org_id", "client_id", "pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["org_id", "client_id", "id"];
          },
          {
            foreignKeyName: "trips_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_run_fkey";
            columns: ["org_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "delivery_runs";
            referencedColumns: ["org_id", "id"];
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
      course_balances: {
        Row: {
          course_id: string | null;
          org_id: string | null;
          client_id: string | null;
          pet_id: string | null;
          service_id: string | null;
          name: string | null;
          sessions: number | null;
          invoice_id: string | null;
          sessions_used: number | null;
          sessions_left: number | null;
        };
        Relationships: [];
      };
      credit_balances: {
        Row: {
          credit_id: string | null;
          org_id: string | null;
          client_id: string | null;
          kind: Database["public"]["Enums"]["credit_kind"] | null;
          amount_minor: number | null;
          expires_on: string | null;
          reason: string | null;
          created_at: string | null;
          left_minor: number | null;
          spendable: boolean | null;
        };
        Relationships: [];
      };
      invoice_balances: {
        Row: {
          invoice_id: string | null;
          org_id: string | null;
          client_id: string | null;
          booking_id: string | null;
          group_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"] | null;
          number: string | null;
          total_minor: number | null;
          paid_minor: number | null;
          credited_minor: number | null;
          due_minor: number | null;
          series_id: string | null;
          series_month: string | null;
          appointment_id: string | null;
        };
        Relationships: [];
      };
      pass_balances: {
        Row: {
          pass_id: string | null;
          org_id: string | null;
          client_id: string | null;
          name: string | null;
          days: number | null;
          starts_on: string | null;
          valid_until: string | null;
          invoice_id: string | null;
          days_used: number | null;
          days_left: number | null;
        };
        Relationships: [];
      };
      recipe_current: {
        Row: {
          recipe_id: string | null;
          org_id: string | null;
          version_id: string | null;
          version: number | null;
          name: string | null;
          rotation_position: number | null;
          is_retired: boolean | null;
          use_by_days: number | null;
        };
        Relationships: [];
      };
      stock_levels: {
        Row: {
          item_id: string | null;
          org_id: string | null;
          name: string | null;
          unit: Database["public"]["Enums"]["stock_unit"] | null;
          kind: Database["public"]["Enums"]["stock_kind"] | null;
          supplier_id: string | null;
          low_level: number | null;
          never_in_recipe: boolean | null;
          is_active: boolean | null;
          on_hand: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_intake: {
        Args: { p_submission: string };
        Returns: string;
      };
      accept_invitation_link: {
        Args: { p_token: string };
        Returns: string;
      };
      apply_package: {
        Args: { p_booking: string; p_package: string; p_price?: number };
        Returns: number;
      };
      appointment_price: {
        Args: { p_org: string; p_service: string; p_pet: string };
        Returns: number;
      };
      available_kennels: {
        Args: { p_org: string; p_kind: Database["public"]["Enums"]["booking_kind"]; p_start: string; p_end: string; p_client?: string; p_pets?: number };
        Returns: Database["public"]["Tables"]["kennels"]["Row"][];
      };
      batch_cost: {
        Args: { p_org: string; p_batch: string };
        Returns: number;
      };
      batch_recipients: {
        Args: { p_org: string; p_batch: string };
        Returns: { kind: string; on_date: string; pet_id: string; pet_name: string; client_id: string; client_name: string; phone: string; delivery_id: string }[];
      };
      check_bill_line: {
        Args: { p_mode: Database["public"]["Enums"]["tax_mode"]; p_intra: boolean; p_include: boolean; p_quantity: number; p_unit_price_minor: number; p_discount_minor: number; p_taxable_minor: number; p_tax_rate_bp: number; p_cgst_minor: number; p_sgst_minor: number; p_igst_minor: number; p_tax_minor: number };
        Returns: undefined;
      };
      check_privacy_access: {
        Args: { p_org: string };
        Returns: undefined;
      };
      check_report_access: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: undefined;
      };
      client_file_paths: {
        Args: { p_client: string };
        Returns: string[];
      };
      confirm_food_order: {
        Args: { p_order: string };
        Returns: string;
      };
      create_invitation_link: {
        Args: { p_org: string; p_role: Database["public"]["Enums"]["member_role"]; p_display_name: string };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string; p_display_name: string };
        Returns: string;
      };
      default_intake_notice: {
        Args: { p_org_name: string; p_language: string };
        Returns: string;
      };
      delivery_cutoff: {
        Args: { p_org: string; p_date: string; p_slot: Database["public"]["Enums"]["delivery_slot"] };
        Returns: string;
      };
      erase_client: {
        Args: { p_client: string };
        Returns: string[];
      };
      export_client: {
        Args: { p_client: string };
        Returns: Json;
      };
      first_delivery_day: {
        Args: { p_org: string; p_weekdays?: number[] };
        Returns: string;
      };
      first_free_start: {
        Args: { p_org: string; p_place: string; p_pet: string; p_day: string; p_minutes: number; p_cleanup: number; p_latest_end?: string; p_latest?: boolean };
        Returns: string;
      };
      fiscal_year_label: {
        Args: { p_date: string; p_start_month?: number };
        Returns: string;
      };
      food_bill_lines: {
        Args: { p_org: string; p_subscription: string; p_from: string; p_to: string; p_delivery: string };
        Returns: { part: string; quantity: number; unit_price_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: string }[];
      };
      food_order_paid: {
        Args: { p_token: string };
        Returns: string;
      };
      generate_care_tasks: {
        Args: { p_org: string; p_date: string };
        Returns: number;
      };
      get_invitation_link: {
        Args: { p_token: string };
        Returns: { org_name: string; role: Database["public"]["Enums"]["member_role"]; display_name: string; usable: boolean; already_member: boolean }[];
      };
      get_public_booking_form: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_public_food_form: {
        Args: { p_slug: string };
        Returns: Json;
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
      intake_upload_allowed: {
        Args: { p_name: string };
        Returns: boolean;
      };
      invite_member_by_email: {
        Args: { p_org: string; p_email: string; p_role: Database["public"]["Enums"]["member_role"]; p_display_name: string };
        Returns: undefined;
      };
      invoice_bookings: {
        Args: { p_org: string; p_booking: string; p_group: string; p_series?: string; p_month?: string };
        Returns: string[];
      };
      invoice_expected_lines: {
        Args: { p_org: string; p_booking: string; p_group: string; p_tax_mode: Database["public"]["Enums"]["tax_mode"]; p_series?: string; p_month?: string; p_appointment?: string };
        Returns: { quantity: number; unit_price_minor: number; discount_minor: number; tax_rate_bp: number }[];
      };
      issue_credit_note: {
        Args: { p_invoice: string; p_reason: string; p_totals: Json; p_lines: Json };
        Returns: Database["public"]["Tables"]["credit_notes"]["Row"];
      };
      issue_invoice: {
        Args: { p_invoice: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      make_recovery_codes: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      merge_clients: {
        Args: { p_keep: string; p_merge: string };
        Returns: string;
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
      my_rider_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_runs: {
        Args: { p_date?: string };
        Returns: Json;
      };
      new_token: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      occupancy_by_day: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { day: string; occupied: number; capacity: number; pets: number }[];
      };
      org_today: {
        Args: { p_org: string };
        Returns: string;
      };
      paths_in_org: {
        Args: { p_paths: string[]; p_org: string };
        Returns: boolean;
      };
      pet_health_problems: {
        Args: { p_org: string; p_pet: string; p_on: string };
        Returns: { problem: string; detail: string }[];
      };
      plan_subscription: {
        Args: { p_subscription: string; p_until: string };
        Returns: number;
      };
      recipe_cost_per_kg: {
        Args: { p_org: string; p_version: string; p_on?: string };
        Returns: number;
      };
      record_batch: {
        Args: { p_org: string; p_version: string; p_grams: number; p_packs: number; p_cooked_on: string; p_cook?: string; p_boarders_on?: string; p_note?: string };
        Returns: string;
      };
      record_purchase: {
        Args: { p_org: string; p_item: string; p_quantity: number; p_cost_minor: number; p_on: string; p_supplier?: string; p_use_by?: string; p_bill_number?: string; p_bill_path?: string; p_expense_category?: string };
        Returns: string;
      };
      recovery_codes_left: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      renew_request_link: {
        Args: { p_client: string };
        Returns: string;
      };
      report_extras: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { name: string; stays: number; quantity: number; amount_minor: number }[];
      };
      report_food: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { month: string; active_subscriptions: number; subscriptions_started: number; subscriptions_ended: number; trials: number; trials_subscribed: number; deliveries: number; kilos_delivered: number; food_value_minor: number; kilos_cooked: number; cooking_cost_minor: number; wasted_g: number; wasted_cost_minor: number }[];
      };
      report_food_riders: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { day: string; rider_id: string; rider_name: string; delivered: number; not_home: number; refused: number }[];
      };
      report_food_sources: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { source: Database["public"]["Enums"]["customer_source"]; started: number; still_active: number }[];
      };
      report_money: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { month: string; billed_minor: number; credited_minor: number; tax_minor: number; bills: number; received_minor: number; refunded_minor: number; spent_minor: number }[];
      };
      report_occupancy: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { day: string; boarding: number; day_boarding: number; capacity: number; kennels_used: number }[];
      };
      report_tax: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: { tax_rate_bp: number; bills: number; credit_notes: number; taxable_minor: number; cgst_minor: number; sgst_minor: number; igst_minor: number; tax_minor: number }[];
      };
      respond_to_invitation: {
        Args: { p_org: string; p_accept: boolean };
        Returns: undefined;
      };
      rider_mark_stop: {
        Args: { p_delivery: string; p_status: Database["public"]["Enums"]["delivery_status"]; p_proof_path?: string };
        Returns: undefined;
      };
      rider_mark_trip: {
        Args: { p_trip: string; p_status: Database["public"]["Enums"]["trip_status"] };
        Returns: undefined;
      };
      rider_upload_allowed: {
        Args: { p_object_name: string };
        Returns: boolean;
      };
      rotation_recipe: {
        Args: { p_org: string; p_index: number };
        Returns: string;
      };
      safe_date: {
        Args: { p_text: string };
        Returns: string;
      };
      save_invoice_draft: {
        Args: { p_invoice: string; p_totals: Json; p_lines: Json };
        Returns: undefined;
      };
      save_recipe_version: {
        Args: { p_recipe: string; p_details: Json; p_ingredients: Json };
        Returns: string;
      };
      session_meets_mfa: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      set_my_language: {
        Args: { p_language: string };
        Returns: undefined;
      };
      stay_charges: {
        Args: { p_org: string; p_bookings: string[] };
        Returns: { booking_id: string; part: string; quantity: number; unit_price_minor: number; discount_minor: number }[];
      };
      stay_media_visible: {
        Args: { p_name: string };
        Returns: boolean;
      };
      stay_range: {
        Args: { p_kind: Database["public"]["Enums"]["booking_kind"]; p_start: string; p_end: string };
        Returns: unknown;
      };
      storage_org_id: {
        Args: { p_object_name: string };
        Returns: string;
      };
      submit_booking_request: {
        Args: { p_token: string; p_payload: Json };
        Returns: number;
      };
      submit_food_order: {
        Args: { p_slug: string; p_payload: Json };
        Returns: Json;
      };
      submit_food_request: {
        Args: { p_token: string; p_payload: Json };
        Returns: undefined;
      };
      submit_intake: {
        Args: { p_slug: string; p_payload: Json };
        Returns: Json;
      };
      use_recovery_code: {
        Args: { p_code: string };
        Returns: number;
      };
      void_invoice: {
        Args: { p_invoice: string; p_reason: string };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      waiting_list: {
        Args: { p_org: string };
        Returns: { booking_id: string; waitlisted_at: string; has_space: boolean }[];
      };
    };
    Enums: {
      address_kind: "home" | "work" | "other";
      appointment_kind: "groom" | "swim" | "training" | "party" | "other";
      appointment_pricing: "fixed" | "by_size" | "by_coat" | "quote";
      appointment_status: "requested" | "confirmed" | "done" | "no_show" | "cancelled";
      boarder_food: "kitchen" | "kibble" | "own";
      booking_kind: "boarding" | "daycare";
      booking_status: "requested" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
      cancel_applies_to: "boarding" | "daycare" | "appointment";
      cancel_outcome: "refund" | "credit" | "keep";
      care_kind: "meal" | "medication" | "walk" | "play" | "cleaning" | "other";
      credit_kind: "cancellation" | "goodwill";
      customer_source: "boarding" | "referral" | "website" | "other";
      delivery_kind: "subscription" | "trial" | "order" | "item" | "replacement";
      delivery_slot: "morning" | "afternoon" | "evening";
      delivery_status: "planned" | "packed" | "out" | "delivered" | "not_home" | "refused" | "cancelled";
      food_goal: "lose" | "keep" | "gain";
      food_order_kind: "trial" | "subscription" | "pause" | "skip" | "more";
      food_order_status: "waiting_area" | "unpaid" | "paid" | "requested" | "confirmed" | "declined";
      food_plan: "full" | "topper";
      food_product_kind: "trial" | "subscription" | "by_kilo" | "item";
      incident_severity: "low" | "medium" | "high";
      intake_status: "new" | "accepted" | "rejected" | "spam";
      invoice_status: "draft" | "issued" | "void";
      member_role: "owner" | "manager" | "staff" | "rider";
      package_day: "first" | "middle" | "last";
      pay_period: "week" | "month";
      payment_method: "upi" | "cash" | "card" | "bank_transfer" | "other" | "credit";
      pet_coat: "short" | "double" | "long" | "curly" | "wire";
      pet_sex: "male" | "female" | "unknown";
      problem_kind: "damaged" | "late" | "wrong";
      problem_outcome: "replaced" | "refunded" | "none";
      service_kind: "boarding" | "daycare" | "addon";
      size_band: "small" | "medium" | "large";
      staff_skill: "cook" | "groomer" | "trainer" | "swim_supervisor" | "rider";
      stock_kind: "meat" | "organ" | "egg" | "grain" | "vegetable" | "oil" | "supplement" | "packaging" | "fuel" | "grooming" | "medicine" | "other";
      stock_move_kind: "purchase" | "used" | "waste" | "count";
      stock_unit: "g" | "ml" | "piece";
      task_status: "pending" | "done" | "skipped";
      tax_mode: "none" | "simple" | "gst_india";
      trip_kind: "pickup" | "drop";
      trip_status: "planned" | "out" | "done" | "not_home" | "cancelled";
      waste_reason: "spoiled" | "past_date" | "dropped" | "other";
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
