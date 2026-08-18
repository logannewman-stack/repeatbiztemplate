import type { Service, Staff, Location, Room } from '@/types/database';

/** A concrete, bookable time on a specific provider. */
export interface Slot {
  /** ISO-8601 UTC. */
  startsAt: string;
  endsAt: string;
  staffId: string;
  staffName: string;
  roomId: string | null;
  /** Provider-busy windows, split when the service has a processing gap. */
  busyBlocks: Array<{ from: string; to: string }>;
  gapStartsAt: string | null;
  gapEndsAt: string | null;
  /** Price for this slot with this provider, before add-ons and discounts. */
  priceCents: number;
  durationMin: number;
  /**
   * True when this slot only exists because it fits inside another
   * appointment's processing gap. Useful for surfacing "we found room" copy.
   */
  fillsProcessingGap: boolean;
}

/** Slots for one calendar day, in the location's timezone. */
export interface DaySlots {
  /** YYYY-MM-DD in the location's timezone. */
  date: string;
  slots: Slot[];
  /** Set when the day produced nothing bookable. */
  closedReason?: 'closed' | 'fully_booked' | 'no_staff' | 'outside_window';
}

export interface BusyBlock {
  staffId: string | null;
  roomId: string | null;
  from: number; // epoch ms
  to: number;
}

export interface AvailabilityInput {
  service: Pick<
    Service,
    | 'id' | 'duration_min' | 'processing_time_min' | 'finish_time_min'
    | 'buffer_before_min' | 'buffer_after_min' | 'price_cents'
    | 'required_room_kind' | 'max_per_day'
  >;
  /** Providers eligible for this service, already filtered by location. */
  staff: Array<
    Pick<Staff, 'id' | 'display_name' | 'price_multiplier' | 'buffer_after_min'> & {
      /** Overrides from service_staff, when present. */
      priceOverrideCents?: number | null;
      durationOverrideMin?: number | null;
    }
  >;
  /** Recurring weekly shifts for those providers. */
  schedules: Array<{
    staff_id: string;
    weekday: number;
    start_time: string; // HH:MM:SS
    end_time: string;
    effective_from: string;
    effective_to: string | null;
  }>;
  /** Time off, breaks, and business-wide closures, as absolute instants. */
  unavailable: Array<{ staffId: string | null; from: string; to: string }>;
  /** Existing busy blocks from appointment_busy_blocks. */
  busy: Array<{
    staff_id: string | null;
    room_id: string | null;
    /** Postgres tstzrange serialized by PostgREST, e.g. ["2026-09-01 10:00+00",...). */
    block: string;
  }>;
  location: Pick<Location, 'id' | 'timezone' | 'hours' | 'hour_overrides'>;
  businessTimezone: string;
  rooms: Array<Pick<Room, 'id' | 'kind' | 'capacity'>>;
  /** Inclusive range of dates to search, YYYY-MM-DD in location time. */
  fromDate: string;
  toDate: string;
  rules: {
    slotIntervalMinutes: number;
    minLeadTimeMinutes: number;
    maxAdvanceBookingDays: number;
    defaultBufferBeforeMinutes: number;
    defaultBufferAfterMinutes: number;
    allowProcessingTimeOverlap: boolean;
  };
  /** Members can book earlier than the public. */
  priorityBookingDays?: number;
  /** Reference "now"; injectable so the engine is deterministic under test. */
  now?: Date;
}
