export interface Vehicle {
  id: string;
  name: string;
  color: string;
}

export interface ReservationView {
  id: string;
  vehicle_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  invited_emails: string[];
  destination?: string;
  purpose?: string;
  series_id?: string | null;
  recurrence_text?: string | null;
  profiles?: { name: string; email: string };
}
