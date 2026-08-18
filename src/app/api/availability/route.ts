import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { loadAvailability } from '@/lib/booking/queries';
import { loadBusiness } from '@/lib/booking/queries';
import { demoServices, demoSlots, isSupabaseConfigured } from '@/lib/demo';
import { addDays } from '@/lib/utils';

const querySchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(1).max(90).default(21),
  addonIds: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { serviceId, staffId, locationId, fromDate, days, addonIds } = parsed.data;

  // Demo mode: synthesize a calendar so a fresh clone is clickable.
  if (!isSupabaseConfigured()) {
    const service = demoServices().find((s) => s.id === serviceId);
    if (!service) {
      return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
    }
    return NextResponse.json({
      days: demoSlots(service, fromDate, days, staffId),
      demo: true,
    });
  }

  const business = await loadBusiness();
  if (!business) {
    return NextResponse.json({ error: 'Business not configured.' }, { status: 500 });
  }

  const result = await loadAvailability({
    businessId: business.id,
    serviceId,
    staffId: staffId ?? null,
    locationId: locationId ?? null,
    fromDate,
    toDate: addDays(fromDate, days - 1).toISOString().slice(0, 10),
    addonIds: addonIds ? addonIds.split(',').filter(Boolean) : [],
  });

  // Strip the internal busy-block detail before it reaches the browser.
  return NextResponse.json({
    days: result.map((day) => ({
      date: day.date,
      closedReason: day.closedReason,
      slots: day.slots.map((s) => ({
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        staffId: s.staffId,
        staffName: s.staffName,
        priceCents: s.priceCents,
        durationMin: s.durationMin,
      })),
    })),
  });
}
