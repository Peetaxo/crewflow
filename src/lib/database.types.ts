export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = 'crew' | 'crewhead' | 'coo';
export type EventStatus = 'planning' | 'upcoming' | 'full' | 'past';
export type TimelogType = 'instal' | 'provoz' | 'deinstal';
export type TimelogStatus = 'draft' | 'pending_crew_confirmation' | 'pending_ch' | 'pending_coo' | 'approved' | 'invoiced' | 'paid' | 'rejected';
export type InvoiceStatus = 'draft' | 'sent' | 'paid';
export type InvoiceApprovalDocumentSource = 'powerapps_document_approval';
export type PowerAppsApprovalStatus = 'pending' | 'approved' | 'rejected' | 'unknown';
export type ReceiptStatus = 'draft' | 'submitted' | 'approved' | 'attached' | 'reimbursed' | 'rejected';
export type RecruitmentStage = 'new' | 'interview_scheduled' | 'decision' | 'accepted' | 'rejected';
export type FleetVehicleStatus = 'available' | 'reserved' | 'service' | 'out_of_order';
export type CrewRatingSource = 'initial' | 'event';

export interface Database {
  public: {
    Tables: {
      billing_group_members: {
        Row: {
          event_id: string
          group_id: string
        }
        Insert: {
          event_id: string
          group_id: string
        }
        Update: {
          event_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_group_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "billing_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_group_requests: {
        Row: {
          actor_id: string
          created_at: string
          payload: Json
          request_id: string
          result: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          payload: Json
          request_id: string
          result: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          payload?: Json
          request_id?: string
          result?: Json
        }
        Relationships: []
      }
      billing_group_state: {
        Row: {
          revision: number
          singleton: boolean
        }
        Insert: {
          revision?: number
          singleton?: boolean
        }
        Update: {
          revision?: number
          singleton?: boolean
        }
        Relationships: []
      }
      billing_groups: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          id: string;
          project_id: string;
          budget_package_id: string | null;
          event_id: string | null;
          section: string;
          name: string;
          units: string;
          amount: number;
          quantity: number;
          unit_price: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          budget_package_id?: string | null;
          event_id?: string | null;
          section: string;
          name: string;
          units?: string;
          amount?: number;
          quantity?: number;
          unit_price?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          budget_package_id?: string | null;
          event_id?: string | null;
          section?: string;
          name?: string;
          units?: string;
          amount?: number;
          quantity?: number;
          unit_price?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      budget_package_events: {
        Row: {
          budget_package_id: string;
          event_id: string;
          created_at: string;
        };
        Insert: {
          budget_package_id: string;
          event_id: string;
          created_at?: string;
        };
        Update: {
          budget_package_id?: string;
          event_id?: string;
          created_at?: string;
        };
      };
      budget_packages: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      candidates: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          tally_submission_id: string | null;
          tally_respondent_id: string | null;
          submitted_at: string | null;
          is_adult: boolean | null;
          has_ico: boolean | null;
          has_driving_license: boolean | null;
          can_drive_van: boolean | null;
          has_event_experience: boolean | null;
          source: string | null;
          utm_source: string | null;
          utm_content: string | null;
          cal_booking_url: string | null;
          cal_booking_uid: string | null;
          cal_booking_status: string | null;
          cal_event_type: string | null;
          stage: RecruitmentStage;
          interview_date: string | null;
          note: string | null;
          raw_payload: Json | null;
          cal_raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
      };
      clients: {
        Row: {
          id: string;
          name: string;
          ico: string | null;
          dic: string | null;
          street: string | null;
          zip: string | null;
          city: string | null;
          country: string | null;
          contact_person: string | null;
          email: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      crew_ratings: {
        Row: {
          id: string;
          profile_id: string;
          event_id: string | null;
          source: CrewRatingSource;
          rating: number;
          note: string | null;
          rated_by_profile_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          event_id?: string | null;
          source: CrewRatingSource;
          rating: number;
          note?: string | null;
          rated_by_profile_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          event_id?: string | null;
          source?: CrewRatingSource;
          rating?: number;
          note?: string | null;
          rated_by_profile_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      event_assignments: {
        Row: {
          id: string;
          event_id: string;
          profile_id: string;
          assigned_at: string;
        };
      };
      event_applications: {
        Row: {
          id: string;
          event_id: string;
          profile_id: string;
          status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'withdrawal_requested';
          note: string | null;
          planned_from: string | null;
          planned_to: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      events: {
        Row: {
          id: string;
          name: string;
          project_id: string | null;
          job_number: string | null;
          client_name: string | null;
          date_from: string | null;
          date_to: string | null;
          time_from: string | null;
          time_to: string | null;
          city: string | null;
          address: string | null;
          place_id: string | null;
          location_lat: number | null;
          location_lng: number | null;
          crew_needed: number | null;
          crew_filled: number | null;
          status: EventStatus;
          description: string | null;
          contact_person: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          dresscode: string | null;
          meeting_point: string | null;
          show_day_types: boolean | null;
          allow_crew_time_proposal: boolean | null;
          day_types: Json | null;
          phase_times: Json | null;
          phase_schedules: Json | null;
          created_at: string;
          updated_at: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          contractor_id: string;
          event_id: string | null;
          timelog_id: string | null;
          job_number: string | null;
          total_hours: number | null;
          amount_hours: number | null;
          amount_km: number | null;
          amount_receipts: number | null;
          total_amount: number | null;
          invoice_number: string | null;
          issue_date: string | null;
          taxable_supply_date: string | null;
          due_date: string | null;
          currency: string;
          supplier_snapshot: Json | null;
          customer_snapshot: Json | null;
          pdf_path: string | null;
          pdf_generated_at: string | null;
          status: InvoiceStatus;
          sent_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      invoice_approval_documents: {
        Row: {
          id: string;
          source: InvoiceApprovalDocumentSource;
          external_id: string | null;
          document_name: string;
          company: string | null;
          job_number: string | null;
          invoice_number: string | null;
          supplier_name: string | null;
          approval_status: PowerAppsApprovalStatus;
          approval_status_label: string | null;
          comment: string | null;
          approvers: string[] | null;
          requester: string | null;
          raw_payload: Json | null;
          matched_invoice_id: string | null;
          last_synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source?: InvoiceApprovalDocumentSource;
          external_id?: string | null;
          document_name: string;
          company?: string | null;
          job_number?: string | null;
          invoice_number?: string | null;
          supplier_name?: string | null;
          approval_status?: PowerAppsApprovalStatus;
          approval_status_label?: string | null;
          comment?: string | null;
          approvers?: string[] | null;
          requester?: string | null;
          raw_payload?: Json | null;
          matched_invoice_id?: string | null;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source?: InvoiceApprovalDocumentSource;
          external_id?: string | null;
          document_name?: string;
          company?: string | null;
          job_number?: string | null;
          invoice_number?: string | null;
          supplier_name?: string | null;
          approval_status?: PowerAppsApprovalStatus;
          approval_status_label?: string | null;
          comment?: string | null;
          approvers?: string[] | null;
          requester?: string | null;
          raw_payload?: Json | null;
          matched_invoice_id?: string | null;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      fleet_reservations: {
        Row: {
          id: string;
          vehicle_id: string;
          project_id: string;
          event_id: string | null;
          responsible_profile_id: string;
          starts_at: string;
          ends_at: string;
          note: string | null;
          has_conflict: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      fleet_vehicle_documents: {
        Row: {
          id: string;
          vehicle_id: string;
          file_name: string;
          storage_path: string | null;
          content_type: string | null;
          size_bytes: number | null;
          uploaded_by_profile_id: string | null;
          created_at: string;
        };
      };
      fleet_vehicles: {
        Row: {
          id: string;
          slug: string;
          name: string;
          plate: string;
          type: string;
          status: FleetVehicleStatus;
          capacity: string;
          inspection_valid_until: string;
          insurance_valid_until: string | null;
          service_due_at: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          job_number: string;
          event_id: string | null;
          hours: number;
          amount_hours: number;
          km: number;
          amount_km: number;
          amount_receipts: number;
          amount_meals: number;
          total_amount: number;
          created_at: string;
        };
      };
      invoice_timelogs: {
        Row: {
          id: string;
          invoice_id: string;
          timelog_id: string;
          created_at: string;
        };
      };
      invoice_receipts: {
        Row: {
          id: string;
          invoice_id: string;
          receipt_id: string;
          created_at: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          ico: string | null;
          dic: string | null;
          bank_account: string | null;
          iban: string | null;
          billing_street: string | null;
          billing_zip: string | null;
          billing_city: string | null;
          billing_country: string | null;
          hourly_rate: number | null;
          tags: string[] | null;
          avatar_color: string | null;
          avatar_bg: string | null;
          note: string | null;
          reliable: boolean | null;
          rating: number | null;
          reliability: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      projects: {
        Row: {
          id: string;
          job_number: string;
          name: string;
          client_id: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      receipts: {
        Row: {
          id: string;
          contractor_id: string;
          event_id: string | null;
          job_number: string | null;
          name: string;
          supplier: string | null;
          amount: number;
          paid_at: string | null;
          note: string | null;
          status: ReceiptStatus;
          created_at: string;
          updated_at: string;
        };
      };
      timelog_days: {
        Row: {
          id: string;
          timelog_id: string;
          date: string;
          time_from: string | null;
          time_to: string | null;
          day_type: TimelogType;
          note: string | null;
          created_at: string;
        };
      };
      timelogs: {
        Row: {
          id: string;
          event_id: string;
          contractor_id: string;
          km: number | null;
          note: string | null;
          status: TimelogStatus;
          submitted_at: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: AppRole;
        };
      };
    };
    Functions: {
      can_manage_billing_groups: { Args: never; Returns: boolean }
      read_billing_groups: { Args: never; Returns: Json }
      save_billing_group_atomic: {
        Args: {
          p_confirm_cross_project: boolean
          p_confirm_moves: boolean
          p_delete: boolean
          p_event_ids: string[]
          p_event_versions: Json
          p_expected_revision: number
          p_group_id: string
          p_name: string
          p_request_id: string
        }
        Returns: Json
      }
      approve_event_withdrawal: {
        Args: {
          p_event_id: string;
          p_profile_id: string;
          p_application_id: string;
        };
        Returns: Json;
      };
      create_invoice_atomic: {
        Args: {
          p_invoice: Json;
          p_items: Json;
          p_timelogs: Json;
          p_receipts: Json;
        };
        Returns: Array<{
          invoice_id: string;
          invoice_status: InvoiceStatus;
          invoice_updated_at: string;
          paid_at: string | null;
          timelogs: Json;
          receipts: Json;
        }>;
      };
      delete_event_atomic: {
        Args: {
          p_event_id: string;
          p_expected_updated_at: string;
        };
        Returns: Array<{
          event_id: string;
        }>;
      };
      delete_invoice_atomic: {
        Args: {
          p_invoice_id: string;
          p_expected_status: InvoiceStatus;
          p_expected_updated_at: string;
        };
        Returns: Array<{
          invoice_id: string;
          invoice_status: InvoiceStatus;
          invoice_updated_at: string;
          paid_at: string | null;
          timelogs: Json;
          receipts: Json;
        }>;
      };
      delete_timelog_atomic: {
        Args: {
          p_timelog_id: string;
          p_expected_updated_at: string;
          p_expected_status: TimelogStatus;
        };
        Returns: Json;
      };
      mark_invoice_paid_atomic: {
        Args: {
          p_invoice_id: string;
          p_expected_status: InvoiceStatus;
          p_expected_updated_at: string;
          p_paid_at: string;
        };
        Returns: Array<{
          invoice_id: string;
          invoice_status: InvoiceStatus;
          invoice_updated_at: string;
          paid_at: string | null;
          timelogs: Json;
          receipts: Json;
        }>;
      };
      mark_invoice_sent_atomic: {
        Args: {
          p_invoice_id: string;
          p_expected_updated_at: string;
          p_sent_at: string;
        };
        Returns: Array<{
          invoice_id: string;
          invoice_status: InvoiceStatus;
          invoice_updated_at: string;
          paid_at: string | null;
          timelogs: Json;
          receipts: Json;
        }>;
      };
      import_approved_timelog_atomic: {
        Args: {
          p_timelog_id: string | null;
          p_event_id: string;
          p_contractor_id: string;
          p_expected_updated_at: string | null;
          p_expected_status: TimelogStatus | null;
          p_km: number;
          p_note: string;
          p_days: Json;
        };
        Returns: Json;
      };
      assign_event_crew: {
        Args: {
          p_event_id: string;
          p_profile_id: string;
          p_application_id?: string | null;
          p_days?: Json;
        };
        Returns: Json;
      };
      list_event_crew_assignments: {
        Args: Record<string, never>;
        Returns: Array<{
          event_id: string;
          profile_id: string;
          first_name: string | null;
          last_name: string | null;
        }>;
      };
      next_self_billing_invoice_sequence: {
        Args: {
          p_invoice_year: number;
          p_supplier_profile_id: string;
        };
        Returns: number;
      };
      remove_event_crew: {
        Args: {
          p_event_id: string;
          p_profile_id: string;
        };
        Returns: Json;
      };
      save_timelog_atomic: {
        Args: {
          p_timelog_id: string | null;
          p_event_id: string;
          p_contractor_id: string;
          p_expected_updated_at: string | null;
          p_expected_status: TimelogStatus | null;
          p_km: number;
          p_note: string;
          p_status: TimelogStatus;
          p_days: Json;
        };
        Returns: Json;
      };
      set_current_user_role: {
        Args: {
          p_role: AppRole;
        };
        Returns: void;
      };
      transition_timelog_statuses_atomic: {
        Args: {
          p_targets: Json;
          p_expected_status: TimelogStatus;
          p_next_status: TimelogStatus;
        };
        Returns: Json;
      };
      transition_receipt_statuses_atomic: {
        Args: {
          p_receipts: Json;
          p_expected_status: ReceiptStatus;
          p_next_status: ReceiptStatus;
        };
        Returns: Json;
      };
      save_budget_package_events: {
        Args: {
          p_budget_package_id: string;
          p_event_ids: string[];
        };
        Returns: void;
      };
    };
  };
}
