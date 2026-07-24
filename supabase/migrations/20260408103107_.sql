
-- =============================================
-- 1. ENUM TYPES
-- =============================================
CREATE TYPE public.app_role AS ENUM ('crew', 'crewhead', 'coo');
CREATE TYPE public.event_status AS ENUM ('planning', 'upcoming', 'full', 'past');
CREATE TYPE public.timelog_type AS ENUM ('instal', 'provoz', 'deinstal');
CREATE TYPE public.timelog_status AS ENUM ('draft', 'pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid', 'rejected');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'disputed');
CREATE TYPE public.receipt_status AS ENUM ('draft', 'submitted', 'approved', 'attached', 'reimbursed', 'rejected');
CREATE TYPE public.recruitment_stage AS ENUM ('new', 'interview_scheduled', 'decision', 'accepted', 'rejected');

-- =============================================
-- 2. TABLES
-- =============================================

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  ico TEXT,
  dic TEXT,
  bank_account TEXT,
  billing_street TEXT,
  billing_zip TEXT,
  billing_city TEXT,
  billing_country TEXT DEFAULT 'CZ',
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  avatar_color TEXT DEFAULT '#6366f1',
  avatar_bg TEXT DEFAULT '#e0e7ff',
  note TEXT,
  reliability NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles (separate table per security best practices)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ico TEXT,
  dic TEXT,
  street TEXT,
  zip TEXT,
  city TEXT,
  country TEXT DEFAULT 'CZ',
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number TEXT,
  client_name TEXT,
  date_from DATE,
  date_to DATE,
  time_from TEXT,
  time_to TEXT,
  city TEXT,
  crew_needed INTEGER DEFAULT 0,
  crew_filled INTEGER DEFAULT 0,
  status public.event_status NOT NULL DEFAULT 'planning',
  description TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  dresscode TEXT,
  meeting_point TEXT,
  show_day_types BOOLEAN DEFAULT false,
  day_types JSONB DEFAULT '[]'::jsonb,
  phase_times JSONB DEFAULT '{}'::jsonb,
  phase_schedules JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Assignments
CREATE TABLE public.event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

-- Timelogs
CREATE TABLE public.timelogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  km NUMERIC(10,2) DEFAULT 0,
  note TEXT,
  status public.timelog_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Timelog Days
CREATE TABLE public.timelog_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timelog_id UUID NOT NULL REFERENCES public.timelogs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_from TEXT,
  time_to TEXT,
  day_type public.timelog_type NOT NULL DEFAULT 'provoz',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  timelog_id UUID REFERENCES public.timelogs(id) ON DELETE SET NULL,
  job_number TEXT,
  total_hours NUMERIC(10,2) DEFAULT 0,
  amount_hours NUMERIC(10,2) DEFAULT 0,
  amount_km NUMERIC(10,2) DEFAULT 0,
  amount_receipts NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipts
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  job_number TEXT,
  name TEXT NOT NULL,
  supplier TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_at DATE,
  note TEXT,
  status public.receipt_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidates
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  cal_booking_url TEXT,
  stage public.recruitment_stage NOT NULL DEFAULT 'new',
  interview_date TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 3. INDEXES
-- =============================================
CREATE INDEX idx_event_assignments_event ON public.event_assignments(event_id);
CREATE INDEX idx_event_assignments_profile ON public.event_assignments(profile_id);
CREATE INDEX idx_timelogs_event ON public.timelogs(event_id);
CREATE INDEX idx_timelogs_contractor ON public.timelogs(contractor_id);
CREATE INDEX idx_timelogs_status ON public.timelogs(status);
CREATE INDEX idx_invoices_contractor ON public.invoices(contractor_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_receipts_contractor ON public.receipts(contractor_id);
CREATE INDEX idx_receipts_event ON public.receipts(event_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_candidates_stage ON public.candidates(stage);

-- =============================================
-- 4. UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_timelogs_updated_at BEFORE UPDATE ON public.timelogs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 5. AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  -- Default role: crew
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'crew');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 6. HAS_ROLE SECURITY DEFINER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: get profile id for current user
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- =============================================
-- 7. RLS POLICIES
-- =============================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "CrewHead and COO can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "CrewHead and COO can update profiles" ON public.profiles
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

-- USER_ROLES
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "COO can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'coo'));

-- CLIENTS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrewHead and COO can manage clients" ON public.clients
  FOR ALL USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

CREATE POLICY "Crew can view clients" ON public.clients
  FOR SELECT USING (public.has_role(auth.uid(), 'crew'));

-- PROJECTS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrewHead and COO can manage projects" ON public.projects
  FOR ALL USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

CREATE POLICY "Crew can view projects" ON public.projects
  FOR SELECT USING (public.has_role(auth.uid(), 'crew'));

-- EVENTS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrewHead and COO can manage events" ON public.events
  FOR ALL USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

CREATE POLICY "Crew can view assigned events" ON public.events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_assignments ea
      WHERE ea.event_id = id AND ea.profile_id = public.current_profile_id()
    )
  );

-- EVENT_ASSIGNMENTS
ALTER TABLE public.event_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrewHead and COO can manage assignments" ON public.event_assignments
  FOR ALL USING (
    public.has_role(auth.uid(), 'crewhead') OR public.has_role(auth.uid(), 'coo')
  );

CREATE POLICY "Crew can view own assignments" ON public.event_assignments
  FOR SELECT USING (profile_id = public.current_profile_id());

-- TIMELOGS
ALTER TABLE public.timelogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crew can manage own timelogs" ON public.timelogs
  FOR ALL USING (contractor_id = public.current_profile_id());

CREATE POLICY "CrewHead can view all timelogs" ON public.timelogs
  FOR SELECT USING (public.has_role(auth.uid(), 'crewhead'));

CREATE POLICY "COO can manage all timelogs" ON public.timelogs
  FOR ALL USING (public.has_role(auth.uid(), 'coo'));

-- TIMELOG_DAYS
ALTER TABLE public.timelog_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage timelog days via timelog" ON public.timelog_days
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.timelogs t
      WHERE t.id = timelog_id AND (
        t.contractor_id = public.current_profile_id()
        OR public.has_role(auth.uid(), 'crewhead')
        OR public.has_role(auth.uid(), 'coo')
      )
    )
  );

-- INVOICES
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crew can view own invoices" ON public.invoices
  FOR SELECT USING (contractor_id = public.current_profile_id());

CREATE POLICY "COO can manage all invoices" ON public.invoices
  FOR ALL USING (public.has_role(auth.uid(), 'coo'));

CREATE POLICY "CrewHead can view all invoices" ON public.invoices
  FOR SELECT USING (public.has_role(auth.uid(), 'crewhead'));

-- RECEIPTS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crew can manage own receipts" ON public.receipts
  FOR ALL USING (contractor_id = public.current_profile_id());

CREATE POLICY "CrewHead can view all receipts" ON public.receipts
  FOR SELECT USING (public.has_role(auth.uid(), 'crewhead'));

CREATE POLICY "COO can manage all receipts" ON public.receipts
  FOR ALL USING (public.has_role(auth.uid(), 'coo'));

-- CANDIDATES
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrewHead can manage candidates" ON public.candidates
  FOR ALL USING (public.has_role(auth.uid(), 'crewhead'));

CREATE POLICY "COO can view candidates" ON public.candidates
  FOR SELECT USING (public.has_role(auth.uid(), 'coo'));

-- =============================================
-- 8. AUTO-INVOICE ON TIMELOG APPROVAL
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_timelog_approved()
RETURNS TRIGGER AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_total_hours NUMERIC;
  v_job TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending_coo' THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.contractor_id;

    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (td.time_to::time - td.time_from::time)) / 3600.0
    ), 0) INTO v_total_hours
    FROM public.timelog_days td WHERE td.timelog_id = NEW.id;

    SELECT p.job_number INTO v_job
    FROM public.events e
    LEFT JOIN public.projects p ON p.id = e.project_id
    WHERE e.id = NEW.event_id;

    INSERT INTO public.invoices (
      contractor_id, event_id, timelog_id, job_number,
      total_hours, amount_hours, amount_km, amount_receipts, total_amount, status
    ) VALUES (
      NEW.contractor_id, NEW.event_id, NEW.id, v_job,
      v_total_hours,
      v_total_hours * COALESCE(v_profile.hourly_rate, 0),
      NEW.km * 5.0,
      COALESCE((SELECT SUM(amount) FROM public.receipts WHERE event_id = NEW.event_id AND contractor_id = NEW.contractor_id AND status = 'approved'), 0),
      (v_total_hours * COALESCE(v_profile.hourly_rate, 0)) + (NEW.km * 5.0) + COALESCE((SELECT SUM(amount) FROM public.receipts WHERE event_id = NEW.event_id AND contractor_id = NEW.contractor_id AND status = 'approved'), 0),
      'draft'
    );

    NEW.status := 'invoiced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_timelog_approved
  BEFORE UPDATE ON public.timelogs
  FOR EACH ROW EXECUTE FUNCTION public.handle_timelog_approved();
;
