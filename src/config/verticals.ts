/**
 * ============================================================================
 * VERTICAL PRESETS
 * ============================================================================
 * Every appointment business has the same skeleton (services, staff, repeat
 * cadence) but different vocabulary, cadences, and upsell shapes. Picking a
 * vertical in `brand.ts` loads the right defaults so a new client build starts
 * ~80% configured instead of blank.
 *
 * `rebookIntervalDays` is the single most important number in this file. It
 * drives the pre-selected date on the rebooking prompt, the "due for a visit"
 * detection, and the lapse/winback thresholds.
 * ============================================================================
 */

import type { VerticalKey } from './brand';

export interface VerticalPreset {
  label: string;
  /** What a customer is called in the UI. */
  clientNoun: string;
  clientNounPlural: string;
  /** What a provider is called. Stylist / therapist / injector / groomer. */
  providerNoun: string;
  providerNounPlural: string;
  /** What a booking is called. Appointment / session / visit / reservation. */
  visitNoun: string;
  visitNounPlural: string;
  /** Typical days between visits for the flagship service. */
  rebookIntervalDays: number;
  /** Multiplier on the interval before a client counts as lapsed. */
  lapseMultiplier: number;
  /** Services seeded for a fresh build. Prices in cents. */
  seedServices: Array<{
    name: string;
    durationMin: number;
    /** Gap in the middle where the provider can serve another client. */
    processingMin?: number;
    priceCents: number;
    rebookIntervalDays: number;
    category: string;
  }>;
  /** Add-ons that move average ticket. Shown during booking + at checkout. */
  seedAddons: Array<{ name: string; durationMin: number; priceCents: number }>;
  /** Membership shapes that actually sell in this vertical. */
  seedMembershipPlans: Array<{
    name: string;
    priceCents: number;
    interval: 'month' | 'year';
    includedVisits: number;
    discountPct: number;
    pitch: string;
  }>;
  /** Retail attach — the cheapest average-ticket lever in most verticals. */
  seedProducts: Array<{ name: string; priceCents: number }>;
  /** Whether intake/consent forms are required before the first visit. */
  requiresIntakeForm: boolean;
  requiresConsentForm: boolean;
}

export const verticals: Record<VerticalKey, VerticalPreset> = {
  hair_salon: {
    label: 'Hair Salon',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'stylist', providerNounPlural: 'stylists',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 42,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: 'Haircut & Style', durationMin: 60, priceCents: 6500, rebookIntervalDays: 42, category: 'Hair' },
      { name: 'Root Touch-Up', durationMin: 90, processingMin: 35, priceCents: 11000, rebookIntervalDays: 28, category: 'Color' },
      { name: 'Full Highlight', durationMin: 180, processingMin: 45, priceCents: 22500, rebookIntervalDays: 84, category: 'Color' },
      { name: 'Balayage', durationMin: 210, processingMin: 45, priceCents: 27500, rebookIntervalDays: 98, category: 'Color' },
      { name: 'Blowout', durationMin: 45, priceCents: 5500, rebookIntervalDays: 14, category: 'Styling' },
      { name: 'Deep Conditioning Treatment', durationMin: 30, priceCents: 4500, rebookIntervalDays: 42, category: 'Treatments' },
    ],
    seedAddons: [
      { name: 'Gloss / Toner', durationMin: 20, priceCents: 3500 },
      { name: 'Olaplex Bond Builder', durationMin: 15, priceCents: 3000 },
      { name: 'Scalp Treatment', durationMin: 15, priceCents: 2500 },
      { name: 'Extra Length / Thickness', durationMin: 30, priceCents: 2500 },
    ],
    seedMembershipPlans: [
      { name: 'Blowout Club', priceCents: 12900, interval: 'month', includedVisits: 3, discountPct: 10, pitch: 'Three blowouts a month plus 10% off everything else.' },
      { name: 'Color Club', priceCents: 19900, interval: 'month', includedVisits: 1, discountPct: 15, pitch: 'A monthly root touch-up and 15% off color services.' },
    ],
    seedProducts: [
      { name: 'Shampoo — Placeholder Brand', priceCents: 3200 },
      { name: 'Conditioner — Placeholder Brand', priceCents: 3400 },
      { name: 'Heat Protectant Spray', priceCents: 2800 },
      { name: 'Dry Shampoo', priceCents: 2600 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },

  nail_salon: {
    label: 'Nail Salon',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'technician', providerNounPlural: 'technicians',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 21,
    lapseMultiplier: 2.5,
    seedServices: [
      { name: 'Classic Manicure', durationMin: 30, priceCents: 3000, rebookIntervalDays: 14, category: 'Hands' },
      { name: 'Gel Manicure', durationMin: 45, priceCents: 4500, rebookIntervalDays: 21, category: 'Hands' },
      { name: 'Full Set — Acrylic', durationMin: 90, priceCents: 7500, rebookIntervalDays: 28, category: 'Enhancements' },
      { name: 'Acrylic Fill', durationMin: 60, priceCents: 5000, rebookIntervalDays: 21, category: 'Enhancements' },
      { name: 'Classic Pedicure', durationMin: 45, priceCents: 4500, rebookIntervalDays: 28, category: 'Feet' },
      { name: 'Spa Pedicure', durationMin: 60, priceCents: 6500, rebookIntervalDays: 28, category: 'Feet' },
    ],
    seedAddons: [
      { name: 'Nail Art (per nail)', durationMin: 5, priceCents: 500 },
      { name: 'French Tips', durationMin: 15, priceCents: 1500 },
      { name: 'Paraffin Dip', durationMin: 10, priceCents: 1200 },
      { name: 'Callus Treatment', durationMin: 10, priceCents: 1000 },
      { name: 'Chrome / Cat-Eye Finish', durationMin: 10, priceCents: 1500 },
    ],
    seedMembershipPlans: [
      { name: 'Nail Club', priceCents: 8900, interval: 'month', includedVisits: 2, discountPct: 10, pitch: 'Two gel manicures a month, never lose your slot.' },
      { name: 'Hands & Feet Club', priceCents: 14900, interval: 'month', includedVisits: 3, discountPct: 15, pitch: 'Two manicures and a pedicure every month.' },
    ],
    seedProducts: [
      { name: 'Cuticle Oil Pen', priceCents: 1600 },
      { name: 'At-Home Repair Kit', priceCents: 2400 },
      { name: 'Hand Cream', priceCents: 1800 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },

  med_spa: {
    label: 'Med Spa',
    clientNoun: 'patient', clientNounPlural: 'patients',
    providerNoun: 'provider', providerNounPlural: 'providers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 90,
    lapseMultiplier: 1.6,
    seedServices: [
      { name: 'Neurotoxin — Consultation & Treatment', durationMin: 45, priceCents: 45000, rebookIntervalDays: 105, category: 'Injectables' },
      { name: 'Dermal Filler', durationMin: 60, priceCents: 65000, rebookIntervalDays: 270, category: 'Injectables' },
      { name: 'HydraFacial', durationMin: 60, priceCents: 19500, rebookIntervalDays: 28, category: 'Facials' },
      { name: 'Chemical Peel', durationMin: 45, priceCents: 15000, rebookIntervalDays: 42, category: 'Facials' },
      { name: 'Laser Hair Removal — Small Area', durationMin: 30, priceCents: 12500, rebookIntervalDays: 42, category: 'Laser' },
      { name: 'Microneedling', durationMin: 75, priceCents: 32500, rebookIntervalDays: 42, category: 'Skin' },
    ],
    seedAddons: [
      { name: 'LED Light Therapy', durationMin: 20, priceCents: 5000 },
      { name: 'Dermaplaning', durationMin: 20, priceCents: 6500 },
      { name: 'Booster Serum', durationMin: 5, priceCents: 7500 },
      { name: 'Lip Hydration Boost', durationMin: 15, priceCents: 9500 },
    ],
    seedMembershipPlans: [
      { name: 'Glow Membership', priceCents: 19900, interval: 'month', includedVisits: 1, discountPct: 15, pitch: 'A monthly facial, member pricing on injectables, and banked credit that rolls over.' },
      { name: 'VIP Membership', priceCents: 39900, interval: 'month', includedVisits: 1, discountPct: 20, pitch: 'Everything in Glow plus 20% off all treatments and priority booking.' },
    ],
    seedProducts: [
      { name: 'Medical-Grade SPF 46', priceCents: 4200 },
      { name: 'Retinol Serum 0.5%', priceCents: 8800 },
      { name: 'Vitamin C Serum', priceCents: 9500 },
      { name: 'Post-Treatment Recovery Balm', priceCents: 3600 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: true,
  },

  massage: {
    label: 'Massage Studio',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'therapist', providerNounPlural: 'therapists',
    visitNoun: 'session', visitNounPlural: 'sessions',
    rebookIntervalDays: 28,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: '60-Minute Swedish Massage', durationMin: 60, priceCents: 9500, rebookIntervalDays: 28, category: 'Massage' },
      { name: '90-Minute Swedish Massage', durationMin: 90, priceCents: 13500, rebookIntervalDays: 28, category: 'Massage' },
      { name: '60-Minute Deep Tissue', durationMin: 60, priceCents: 11000, rebookIntervalDays: 21, category: 'Massage' },
      { name: 'Prenatal Massage', durationMin: 60, priceCents: 10500, rebookIntervalDays: 21, category: 'Specialty' },
      { name: 'Sports Recovery', durationMin: 75, priceCents: 12500, rebookIntervalDays: 14, category: 'Specialty' },
    ],
    seedAddons: [
      { name: 'Hot Stones', durationMin: 15, priceCents: 2500 },
      { name: 'CBD Balm Application', durationMin: 10, priceCents: 2000 },
      { name: 'Aromatherapy', durationMin: 5, priceCents: 1500 },
      { name: 'Scalp & Foot Focus', durationMin: 15, priceCents: 2200 },
    ],
    seedMembershipPlans: [
      { name: 'Monthly Massage', priceCents: 8900, interval: 'month', includedVisits: 1, discountPct: 10, pitch: 'One 60-minute massage every month, credits roll over for 3 months.' },
      { name: 'Twice-Monthly', priceCents: 16500, interval: 'month', includedVisits: 2, discountPct: 15, pitch: 'Two sessions a month plus 15% off add-ons and extra sessions.' },
    ],
    seedProducts: [
      { name: 'Recovery Balm', priceCents: 2800 },
      { name: 'Massage Ball Set', priceCents: 2200 },
      { name: 'Epsom Soak', priceCents: 1800 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: false,
  },

  barbershop: {
    label: 'Barbershop',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'barber', providerNounPlural: 'barbers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 21,
    lapseMultiplier: 2.5,
    seedServices: [
      { name: "Men's Haircut", durationMin: 30, priceCents: 3500, rebookIntervalDays: 21, category: 'Cuts' },
      { name: 'Haircut & Beard Trim', durationMin: 45, priceCents: 5000, rebookIntervalDays: 21, category: 'Cuts' },
      { name: 'Skin Fade', durationMin: 40, priceCents: 4200, rebookIntervalDays: 14, category: 'Cuts' },
      { name: 'Hot Towel Shave', durationMin: 30, priceCents: 4000, rebookIntervalDays: 21, category: 'Shaves' },
      { name: 'Kids Cut', durationMin: 25, priceCents: 2800, rebookIntervalDays: 28, category: 'Cuts' },
    ],
    seedAddons: [
      { name: 'Beard Oil Finish', durationMin: 5, priceCents: 1000 },
      { name: 'Eyebrow Cleanup', durationMin: 10, priceCents: 1200 },
      { name: 'Gray Blending', durationMin: 20, priceCents: 2500 },
      { name: 'Neck Shave', durationMin: 10, priceCents: 1000 },
    ],
    seedMembershipPlans: [
      { name: 'Cut Club', priceCents: 5900, interval: 'month', includedVisits: 2, discountPct: 10, pitch: 'Two cuts a month, standing chair time, no waiting.' },
      { name: 'Full Groom', priceCents: 9900, interval: 'month', includedVisits: 2, discountPct: 15, pitch: 'Two cuts plus beard work and 15% off products.' },
    ],
    seedProducts: [
      { name: 'Matte Clay Pomade', priceCents: 2200 },
      { name: 'Beard Oil', priceCents: 2400 },
      { name: 'Aftershave Balm', priceCents: 1900 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },

  lash_brow: {
    label: 'Lash & Brow Studio',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'artist', providerNounPlural: 'artists',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 21,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: 'Classic Lash Full Set', durationMin: 120, priceCents: 15000, rebookIntervalDays: 21, category: 'Lashes' },
      { name: 'Volume Lash Full Set', durationMin: 150, priceCents: 20000, rebookIntervalDays: 21, category: 'Lashes' },
      { name: 'Lash Fill — 2 Week', durationMin: 60, priceCents: 6500, rebookIntervalDays: 14, category: 'Lashes' },
      { name: 'Lash Fill — 3 Week', durationMin: 75, priceCents: 8000, rebookIntervalDays: 21, category: 'Lashes' },
      { name: 'Brow Lamination', durationMin: 60, priceCents: 9500, rebookIntervalDays: 42, category: 'Brows' },
      { name: 'Brow Wax & Tint', durationMin: 30, priceCents: 5500, rebookIntervalDays: 28, category: 'Brows' },
    ],
    seedAddons: [
      { name: 'Lash Bath', durationMin: 10, priceCents: 1500 },
      { name: 'Colored Accent Lashes', durationMin: 15, priceCents: 2000 },
      { name: 'Brow Tint', durationMin: 15, priceCents: 2500 },
      { name: 'Lip Wax', durationMin: 10, priceCents: 1200 },
    ],
    seedMembershipPlans: [
      { name: 'Lash Club', priceCents: 12900, interval: 'month', includedVisits: 2, discountPct: 10, pitch: 'Two fills a month at a locked-in rate, standing appointment held for you.' },
      { name: 'Brow Club', priceCents: 4900, interval: 'month', includedVisits: 1, discountPct: 10, pitch: 'Monthly brow shaping plus 10% off everything else.' },
    ],
    seedProducts: [
      { name: 'Lash Cleanser', priceCents: 2200 },
      { name: 'Lash Sealant', priceCents: 2600 },
      { name: 'Brow Growth Serum', priceCents: 4800 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: false,
  },

  waxing: {
    label: 'Waxing Studio',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'specialist', providerNounPlural: 'specialists',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 28,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: 'Brazilian Wax', durationMin: 30, priceCents: 6500, rebookIntervalDays: 28, category: 'Body' },
      { name: 'Bikini Wax', durationMin: 20, priceCents: 4500, rebookIntervalDays: 28, category: 'Body' },
      { name: 'Full Leg Wax', durationMin: 45, priceCents: 7500, rebookIntervalDays: 35, category: 'Body' },
      { name: 'Underarm Wax', durationMin: 15, priceCents: 2500, rebookIntervalDays: 28, category: 'Body' },
      { name: 'Brow Wax', durationMin: 15, priceCents: 2500, rebookIntervalDays: 21, category: 'Face' },
    ],
    seedAddons: [
      { name: 'Ingrown Treatment', durationMin: 5, priceCents: 1200 },
      { name: 'Soothing Serum', durationMin: 5, priceCents: 1000 },
      { name: 'Add Underarms', durationMin: 15, priceCents: 2000 },
    ],
    seedMembershipPlans: [
      { name: 'Smooth Club', priceCents: 5900, interval: 'month', includedVisits: 1, discountPct: 15, pitch: 'One Brazilian a month at member pricing plus 15% off any add-on.' },
    ],
    seedProducts: [
      { name: 'Ingrown Hair Serum', priceCents: 2800 },
      { name: 'Exfoliating Mitt', priceCents: 1200 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: false,
  },

  tanning: {
    label: 'Tanning Studio',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'technician', providerNounPlural: 'technicians',
    visitNoun: 'session', visitNounPlural: 'sessions',
    rebookIntervalDays: 10,
    lapseMultiplier: 3.0,
    seedServices: [
      { name: 'Spray Tan — Full Body', durationMin: 20, priceCents: 4500, rebookIntervalDays: 10, category: 'Spray' },
      { name: 'Express Spray Tan', durationMin: 15, priceCents: 3500, rebookIntervalDays: 10, category: 'Spray' },
      { name: 'Red Light Therapy', durationMin: 20, priceCents: 3000, rebookIntervalDays: 7, category: 'Wellness' },
    ],
    seedAddons: [
      { name: 'Contouring', durationMin: 10, priceCents: 2000 },
      { name: 'Rapid Developer', durationMin: 0, priceCents: 1000 },
      { name: 'Barrier Cream Prep', durationMin: 5, priceCents: 800 },
    ],
    seedMembershipPlans: [
      { name: 'Unlimited Glow', priceCents: 7900, interval: 'month', includedVisits: 4, discountPct: 20, pitch: 'Up to four spray tans a month plus 20% off products.' },
    ],
    seedProducts: [
      { name: 'Tan Extender Lotion', priceCents: 2600 },
      { name: 'pH Balancing Wash', priceCents: 1900 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },

  pet_grooming: {
    label: 'Pet Grooming',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'groomer', providerNounPlural: 'groomers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 42,
    lapseMultiplier: 1.8,
    seedServices: [
      { name: 'Full Groom — Small Dog', durationMin: 90, priceCents: 6500, rebookIntervalDays: 42, category: 'Grooming' },
      { name: 'Full Groom — Large Dog', durationMin: 150, priceCents: 9500, rebookIntervalDays: 42, category: 'Grooming' },
      { name: 'Bath & Brush', durationMin: 60, priceCents: 4500, rebookIntervalDays: 28, category: 'Bath' },
      { name: 'Nail Trim', durationMin: 15, priceCents: 1800, rebookIntervalDays: 28, category: 'Quick Services' },
    ],
    seedAddons: [
      { name: 'De-shedding Treatment', durationMin: 20, priceCents: 2500 },
      { name: 'Teeth Brushing', durationMin: 10, priceCents: 1200 },
      { name: 'Ear Cleaning', durationMin: 10, priceCents: 1000 },
      { name: 'Specialty Shampoo', durationMin: 5, priceCents: 1500 },
    ],
    seedMembershipPlans: [
      { name: 'Grooming Plan', priceCents: 6900, interval: 'month', includedVisits: 1, discountPct: 10, pitch: 'A monthly bath and brush with your full groom slot always reserved.' },
    ],
    seedProducts: [
      { name: 'Detangling Spray', priceCents: 1800 },
      { name: 'Paw Balm', priceCents: 1400 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: false,
  },

  chiropractic: {
    label: 'Chiropractic',
    clientNoun: 'patient', clientNounPlural: 'patients',
    providerNoun: 'doctor', providerNounPlural: 'doctors',
    visitNoun: 'visit', visitNounPlural: 'visits',
    rebookIntervalDays: 7,
    lapseMultiplier: 3.0,
    seedServices: [
      { name: 'New Patient Exam', durationMin: 45, priceCents: 12500, rebookIntervalDays: 7, category: 'Intake' },
      { name: 'Adjustment', durationMin: 15, priceCents: 6500, rebookIntervalDays: 7, category: 'Care' },
      { name: 'Adjustment + Soft Tissue', durationMin: 30, priceCents: 9500, rebookIntervalDays: 7, category: 'Care' },
      { name: 'Re-Evaluation', durationMin: 30, priceCents: 8500, rebookIntervalDays: 42, category: 'Care' },
    ],
    seedAddons: [
      { name: 'Therapeutic Ultrasound', durationMin: 10, priceCents: 2500 },
      { name: 'Electrical Stimulation', durationMin: 15, priceCents: 2500 },
      { name: 'Traction Table', durationMin: 15, priceCents: 3000 },
    ],
    seedMembershipPlans: [
      { name: 'Wellness Plan', priceCents: 14900, interval: 'month', includedVisits: 4, discountPct: 20, pitch: 'Four adjustments a month at roughly half the drop-in rate.' },
      { name: 'Family Plan', priceCents: 24900, interval: 'month', includedVisits: 8, discountPct: 25, pitch: 'Eight visits a month shared across your household.' },
    ],
    seedProducts: [
      { name: 'Cervical Support Pillow', priceCents: 6500 },
      { name: 'Foam Roller', priceCents: 3200 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: true,
  },

  physical_therapy: {
    label: 'Physical Therapy',
    clientNoun: 'patient', clientNounPlural: 'patients',
    providerNoun: 'therapist', providerNounPlural: 'therapists',
    visitNoun: 'visit', visitNounPlural: 'visits',
    rebookIntervalDays: 7,
    lapseMultiplier: 2.5,
    seedServices: [
      { name: 'Initial Evaluation', durationMin: 60, priceCents: 17500, rebookIntervalDays: 7, category: 'Intake' },
      { name: 'Follow-Up Treatment', durationMin: 45, priceCents: 12500, rebookIntervalDays: 7, category: 'Care' },
      { name: 'Dry Needling', durationMin: 30, priceCents: 9500, rebookIntervalDays: 14, category: 'Specialty' },
    ],
    seedAddons: [
      { name: 'Cupping', durationMin: 15, priceCents: 3500 },
      { name: 'Manual Therapy Extension', durationMin: 15, priceCents: 4000 },
    ],
    seedMembershipPlans: [
      { name: 'Recovery Plan', priceCents: 29900, interval: 'month', includedVisits: 4, discountPct: 20, pitch: 'Four visits a month with a locked weekly slot.' },
    ],
    seedProducts: [
      { name: 'Resistance Band Set', priceCents: 2800 },
      { name: 'Home Exercise Kit', priceCents: 4500 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: true,
  },

  dental: {
    label: 'Dental / Hygiene',
    clientNoun: 'patient', clientNounPlural: 'patients',
    providerNoun: 'provider', providerNounPlural: 'providers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 182,
    lapseMultiplier: 1.4,
    seedServices: [
      { name: 'Cleaning & Exam', durationMin: 60, priceCents: 15000, rebookIntervalDays: 182, category: 'Preventive' },
      { name: 'Deep Cleaning (per quadrant)', durationMin: 60, priceCents: 27500, rebookIntervalDays: 90, category: 'Periodontal' },
      { name: 'Whitening', durationMin: 60, priceCents: 39500, rebookIntervalDays: 365, category: 'Cosmetic' },
    ],
    seedAddons: [
      { name: 'Fluoride Treatment', durationMin: 10, priceCents: 4500 },
      { name: 'Sealants (per tooth)', durationMin: 10, priceCents: 5500 },
      { name: 'Whitening Touch-Up Trays', durationMin: 15, priceCents: 12500 },
    ],
    seedMembershipPlans: [
      { name: 'Preventive Plan', priceCents: 3900, interval: 'month', includedVisits: 0, discountPct: 20, pitch: 'Two cleanings a year included plus 20% off all other treatment. No insurance required.' },
    ],
    seedProducts: [
      { name: 'Electric Toothbrush', priceCents: 8900 },
      { name: 'Prescription Fluoride Paste', priceCents: 2400 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: true,
  },

  personal_training: {
    label: 'Personal Training',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'trainer', providerNounPlural: 'trainers',
    visitNoun: 'session', visitNounPlural: 'sessions',
    rebookIntervalDays: 4,
    lapseMultiplier: 4.0,
    seedServices: [
      { name: '1-on-1 Training — 60 min', durationMin: 60, priceCents: 9000, rebookIntervalDays: 4, category: 'Training' },
      { name: '1-on-1 Training — 30 min', durationMin: 30, priceCents: 5500, rebookIntervalDays: 4, category: 'Training' },
      { name: 'Partner Session', durationMin: 60, priceCents: 12000, rebookIntervalDays: 7, category: 'Training' },
      { name: 'Movement Assessment', durationMin: 75, priceCents: 12500, rebookIntervalDays: 90, category: 'Assessment' },
    ],
    seedAddons: [
      { name: 'Nutrition Check-In', durationMin: 15, priceCents: 2500 },
      { name: 'Recovery / Stretch Block', durationMin: 20, priceCents: 3000 },
    ],
    seedMembershipPlans: [
      { name: '2x / Week', priceCents: 62000, interval: 'month', includedVisits: 8, discountPct: 15, pitch: 'Eight sessions a month with your times reserved for the whole month.' },
      { name: '3x / Week', priceCents: 87000, interval: 'month', includedVisits: 12, discountPct: 20, pitch: 'Twelve sessions a month at the best per-session rate we offer.' },
    ],
    seedProducts: [
      { name: 'Protein Blend', priceCents: 4900 },
      { name: 'Lifting Straps', priceCents: 2200 },
    ],
    requiresIntakeForm: true,
    requiresConsentForm: true,
  },

  auto_detailing: {
    label: 'Auto Detailing',
    clientNoun: 'customer', clientNounPlural: 'customers',
    providerNoun: 'detailer', providerNounPlural: 'detailers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 42,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: 'Express Wash & Wax', durationMin: 60, priceCents: 8500, rebookIntervalDays: 28, category: 'Exterior' },
      { name: 'Full Interior Detail', durationMin: 180, priceCents: 22500, rebookIntervalDays: 90, category: 'Interior' },
      { name: 'Full Detail — Interior & Exterior', durationMin: 300, priceCents: 39500, rebookIntervalDays: 90, category: 'Complete' },
      { name: 'Ceramic Coating', durationMin: 480, priceCents: 95000, rebookIntervalDays: 730, category: 'Protection' },
    ],
    seedAddons: [
      { name: 'Engine Bay Cleaning', durationMin: 30, priceCents: 5500 },
      { name: 'Headlight Restoration', durationMin: 45, priceCents: 8500 },
      { name: 'Pet Hair Removal', durationMin: 45, priceCents: 6500 },
      { name: 'Odor Treatment', durationMin: 30, priceCents: 7500 },
    ],
    seedMembershipPlans: [
      { name: 'Maintenance Plan', priceCents: 14900, interval: 'month', includedVisits: 2, discountPct: 15, pitch: 'Two express washes a month plus 15% off any full detail.' },
    ],
    seedProducts: [
      { name: 'Ceramic Detail Spray', priceCents: 2800 },
      { name: 'Microfiber Towel Set', priceCents: 2200 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },

  generic: {
    label: 'Appointment Business',
    clientNoun: 'client', clientNounPlural: 'clients',
    providerNoun: 'provider', providerNounPlural: 'providers',
    visitNoun: 'appointment', visitNounPlural: 'appointments',
    rebookIntervalDays: 30,
    lapseMultiplier: 2.0,
    seedServices: [
      { name: 'Service A — Standard', durationMin: 60, priceCents: 8500, rebookIntervalDays: 30, category: 'Core Services' },
      { name: 'Service B — Extended', durationMin: 90, priceCents: 12500, rebookIntervalDays: 45, category: 'Core Services' },
      { name: 'Service C — Express', durationMin: 30, priceCents: 4500, rebookIntervalDays: 21, category: 'Core Services' },
      { name: 'Service D — Premium', durationMin: 120, priceCents: 19500, rebookIntervalDays: 60, category: 'Premium' },
      { name: 'New Client Consultation', durationMin: 30, priceCents: 0, rebookIntervalDays: 30, category: 'Consultations' },
    ],
    seedAddons: [
      { name: 'Add-On One', durationMin: 15, priceCents: 2500 },
      { name: 'Add-On Two', durationMin: 20, priceCents: 3500 },
      { name: 'Add-On Three', durationMin: 10, priceCents: 1500 },
    ],
    seedMembershipPlans: [
      { name: 'Essential Membership', priceCents: 9900, interval: 'month', includedVisits: 1, discountPct: 10, pitch: 'One visit a month plus 10% off everything else.' },
      { name: 'Premium Membership', priceCents: 17900, interval: 'month', includedVisits: 2, discountPct: 15, pitch: 'Two visits a month, 15% off, and priority booking.' },
    ],
    seedProducts: [
      { name: 'Retail Product A', priceCents: 2800 },
      { name: 'Retail Product B', priceCents: 3600 },
      { name: 'Retail Product C', priceCents: 1900 },
    ],
    requiresIntakeForm: false,
    requiresConsentForm: false,
  },
};

import { brand } from './brand';

/** The preset for the currently configured vertical. */
export const vertical: VerticalPreset = verticals[brand.vertical];
