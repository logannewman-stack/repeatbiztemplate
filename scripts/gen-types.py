#!/usr/bin/env python3
"""
Generate src/types/database.ts from a live Postgres schema.

Used to build the type file that ships with the template. Once you have a
real Supabase project you can switch to the official generator instead:

    npm run db:types

Usage, against any Postgres with the migrations applied:

    psql "$DB_URL" -At -f scripts/introspect.sql       > /tmp/cols.txt
    psql "$DB_URL" -At -f scripts/introspect-enums.sql > /tmp/enums.txt
    python3 scripts/gen-types.py /tmp/cols.txt /tmp/enums.txt > src/types/database.ts

Functions are listed by hand below — Postgres argument introspection does not
survive the round trip cleanly enough to be worth automating for a dozen of
them. Add new ones there when you add a migration that defines one.
"""
import sys, re
from collections import OrderedDict

PG_TO_TS = {
    'uuid': 'string', 'text': 'string', 'citext': 'string', 'character varying': 'string',
    'character': 'string', 'bpchar': 'string', 'inet': 'string',
    'integer': 'number', 'bigint': 'number', 'smallint': 'number',
    'numeric': 'number', 'real': 'number', 'double precision': 'number',
    'boolean': 'boolean',
    'timestamp with time zone': 'string', 'timestamp without time zone': 'string',
    'date': 'string', 'time without time zone': 'string', 'time with time zone': 'string',
    'jsonb': 'Json', 'json': 'Json',
    # PostgREST serializes ranges to their text form, e.g. ["2026-09-01 10:00+00",...)
    'tstzrange': 'string', 'tsrange': 'string', 'daterange': 'string',
    'int4range': 'string', 'numrange': 'string',
    'ARRAY': 'unknown[]',
}

def ts_type(pg, enums):
    pg = pg.strip()
    if pg.endswith('[]'):
        base = pg[:-2].strip()
        return ts_type(base, enums) + '[]'
    m = re.match(r'^(character varying|character|numeric|bpchar)\(', pg)
    if m:
        return PG_TO_TS[m.group(1)]
    if pg in enums:
        return f'Database["public"]["Enums"]["{pg}"]'
    return PG_TO_TS.get(pg, 'unknown')

def main():
    cols_path, enums_path = sys.argv[1], sys.argv[2]
    enums = OrderedDict()
    for line in open(enums_path):
        line = line.rstrip('\n')
        if not line: continue
        name, labels = line.split('|', 1)
        enums[name] = labels.split(',')

    tables = OrderedDict()
    for line in open(cols_path):
        line = line.rstrip('\n')
        if not line: continue
        kind, rel, col, typ, notnull, hasdef = line.split('|')
        tables.setdefault((kind, rel), []).append(
            (col, typ, notnull == 't', hasdef == 't')
        )

    out = []
    out.append('/**')
    out.append(' * ============================================================================')
    out.append(' * DATABASE TYPES — generated from the schema in supabase/migrations')
    out.append(' * ============================================================================')
    out.append(' * Do not edit by hand. Once you have a real Supabase project, regenerate with:')
    out.append(' *')
    out.append(' *     npm run db:types')
    out.append(' *')
    out.append(' * Timestamps are typed as `string` because PostgREST returns ISO-8601 text.')
    out.append(' * ============================================================================')
    out.append(' */')
    out.append('')
    out.append('export type Json =')
    out.append('  | string')
    out.append('  | number')
    out.append('  | boolean')
    out.append('  | null')
    out.append('  | { [key: string]: Json | undefined }')
    out.append('  | Json[];')
    out.append('')
    out.append('export interface Database {')
    out.append('  public: {')
    out.append('    Tables: {')

    for (kind, rel), cols in tables.items():
        if kind != 'r':
            continue
        out.append(f'      {rel}: {{')
        out.append('        Row: {')
        for col, typ, notnull, hasdef in cols:
            t = ts_type(typ, enums)
            out.append(f'          {col}: {t}{"" if notnull else " | null"};')
        out.append('        };')
        out.append('        Insert: {')
        for col, typ, notnull, hasdef in cols:
            t = ts_type(typ, enums)
            optional = (not notnull) or hasdef
            q = '?' if optional else ''
            nullable = '' if notnull else ' | null'
            out.append(f'          {col}{q}: {t}{nullable};')
        out.append('        };')
        out.append('        Update: {')
        for col, typ, notnull, hasdef in cols:
            t = ts_type(typ, enums)
            nullable = '' if notnull else ' | null'
            out.append(f'          {col}?: {t}{nullable};')
        out.append('        };')
        out.append('        Relationships: [];')
        out.append('      };')
    out.append('    };')

    out.append('    Views: {')
    for (kind, rel), cols in tables.items():
        if kind != 'v':
            continue
        out.append(f'      {rel}: {{')
        out.append('        Row: {')
        for col, typ, notnull, hasdef in cols:
            t = ts_type(typ, enums)
            out.append(f'          {col}: {t} | null;')
        out.append('        };')
        out.append('        Relationships: [];')
        out.append('      };')
    out.append('    };')

    # supabase-js requires Functions and CompositeTypes on every schema, even
    # when empty — omitting them collapses every query result to `never`.
    out.append('    Functions: {')
    out.append('      compute_no_show_risk: {')
    out.append('        Args: { p_no_shows: number; p_late_cancels: number; p_completed: number; p_days_since_last_visit: number };')
    out.append('        Returns: number;')
    out.append('      };')
    out.append('      compute_churn_risk: {')
    out.append('        Args: { p_days_since_last_visit: number; p_expected_interval: number; p_has_future_booking: boolean; p_completed: number; p_is_member: boolean };')
    out.append('        Returns: number;')
    out.append('      };')
    out.append('      refresh_client_metrics: {')
    out.append('        Args: { p_client_id: string };')
    out.append('        Returns: undefined;')
    out.append('      };')
    out.append('      grant_membership_credits: {')
    out.append("        Args: { p_membership_id: string; p_amount: number; p_reason?: Database['public']['Enums']['ledger_reason'] };")
    out.append('        Returns: number;')
    out.append('      };')
    out.append('      redeem_membership_credit: {')
    out.append('        Args: { p_membership_id: string; p_appointment_id: string };')
    out.append('        Returns: boolean;')
    out.append('      };')
    out.append('      generate_referral_code: {')
    out.append('        Args: Record<string, never>;')
    out.append('        Returns: string;')
    out.append('      };')
    out.append('      promotional_sends_this_week: {')
    out.append('        Args: { p_client_id: string };')
    out.append('        Returns: number;')
    out.append('      };')
    out.append('    };')

    out.append('    Enums: {')
    for name, labels in enums.items():
        union = ' | '.join(f"'{l}'" for l in labels)
        out.append(f'      {name}: {union};')
    out.append('    };')
    out.append('    CompositeTypes: Record<string, never>;')
    out.append('  };')
    out.append('}')
    out.append('')
    out.append('// --- Convenience aliases -------------------------------------------------')
    out.append('')
    out.append("type PublicSchema = Database['public'];")
    out.append('')
    out.append('export type Tables<T extends keyof PublicSchema["Tables"]> =')
    out.append('  PublicSchema["Tables"][T]["Row"];')
    out.append('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =')
    out.append('  PublicSchema["Tables"][T]["Insert"];')
    out.append('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =')
    out.append('  PublicSchema["Tables"][T]["Update"];')
    out.append('export type Views<T extends keyof PublicSchema["Views"]> =')
    out.append('  PublicSchema["Views"][T]["Row"];')
    out.append('export type Enums<T extends keyof PublicSchema["Enums"]> =')
    out.append('  PublicSchema["Enums"][T];')
    out.append('')
    named = [
        ('Business', 'businesses'), ('Location', 'locations'), ('Room', 'rooms'),
        ('Staff', 'staff'), ('StaffSchedule', 'staff_schedules'), ('TimeOff', 'staff_time_off'),
        ('Service', 'services'), ('ServiceCategory', 'service_categories'),
        ('Addon', 'addons'), ('Product', 'products'), ('Package', 'packages'),
        ('Client', 'clients'), ('ClientMetrics', 'client_metrics'),
        ('ClientNote', 'client_notes'), ('ClientFile', 'client_files'),
        ('Appointment', 'appointments'), ('AppointmentAddon', 'appointment_addons'),
        ('WaitlistEntry', 'waitlist_entries'),
        ('MembershipPlan', 'membership_plans'), ('Membership', 'memberships'),
        ('ClientPackage', 'client_packages'),
        ('Order', 'orders'), ('OrderItem', 'order_items'), ('Payment', 'payments'),
        ('GiftCard', 'gift_cards'), ('LoyaltyTransaction', 'loyalty_transactions'),
        ('Campaign', 'campaigns'), ('CampaignSend', 'campaign_sends'),
        ('MessageTemplate', 'message_templates'), ('Review', 'reviews'),
        ('Referral', 'referrals'), ('Offer', 'offers'), ('Form', 'forms'),
        ('FormSubmission', 'form_submissions'),
    ]
    for alias, tbl in named:
        out.append(f"export type {alias} = Tables<'{tbl}'>;")
    out.append('')
    out.append("export type AppointmentStatus = Enums<'appointment_status'>;")
    out.append("export type MembershipStatus = Enums<'membership_status'>;")
    out.append("export type ClientLifecycle = Enums<'client_lifecycle'>;")
    out.append("export type StaffRole = Enums<'staff_role'>;")
    out.append("export type BookingSource = Enums<'booking_source'>;")
    out.append("export type MessageChannel = Enums<'message_channel'>;")
    out.append("export type CampaignTrigger = Enums<'campaign_trigger'>;")
    out.append("export type SendStatus = Enums<'send_status'>;")
    out.append("export type OrderItemKind = Enums<'order_item_kind'>;")
    out.append('')
    print('\n'.join(out))

main()
