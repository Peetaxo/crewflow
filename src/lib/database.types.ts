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
export type TimelogStatus = 'draft' | 'pending_ch' | 'pending_coo' | 'approved' | 'invoiced' | 'paid' | 'rejected';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'disputed';
export type ReceiptStatus = 'draft' | 'submitted' | 'approved' | 'attached' | 'reimbursed' | 'rejected';
export type RecruitmentStage = 'new' | 'interview_scheduled' | 'decision' | 'accepted' | 'rejected';

export interface Database {
  public: {
    Tables: {
      candidates: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          source: string | null;
          cal_booking_url: string | null;
          stage: RecruitmentStage;
          interview_date: string | null;
          note: string | null;
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
      event_assignments: {
        Row: {
          id: string;
          event_id: string;
          profile_id: string;
          assigned_at: string;
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
          status: InvoiceStatus;
          sent_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          ico: string | null;
          dic: string | null;
          bank_account: string | null;
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
  };
}
