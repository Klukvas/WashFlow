import type { LucideIcon } from 'lucide-react';
import {
  Rocket,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Car,
  Wrench,
  Building2,
  UserCog,
  HardHat,
  BarChart3,
  Globe,
  PhoneIncoming,
  Contact,
  CalendarCheck,
  UserPlus,
  Settings,
} from 'lucide-react';

export type TopicType = 'topic' | 'flow';

export interface TopicMeta {
  readonly slug: string;
  readonly icon: LucideIcon;
  readonly type: TopicType;
}

export const TOPICS: readonly TopicMeta[] = [
  // ─── Reference Topics ─────────────────────────
  { slug: 'getting-started', icon: Rocket, type: 'topic' },
  { slug: 'dashboard', icon: LayoutDashboard, type: 'topic' },
  { slug: 'orders', icon: ShoppingCart, type: 'topic' },
  { slug: 'clients', icon: Users, type: 'topic' },
  { slug: 'vehicles', icon: Car, type: 'topic' },
  { slug: 'services', icon: Wrench, type: 'topic' },
  { slug: 'branches', icon: Building2, type: 'topic' },
  { slug: 'users-roles', icon: UserCog, type: 'topic' },
  { slug: 'workforce', icon: HardHat, type: 'topic' },
  { slug: 'analytics', icon: BarChart3, type: 'topic' },
  { slug: 'public-booking', icon: Globe, type: 'topic' },
  // ─── Step-by-Step Flows ────────────────────────
  { slug: 'flow-client-via-order', icon: PhoneIncoming, type: 'flow' },
  { slug: 'flow-client-via-tabs', icon: Contact, type: 'flow' },
  { slug: 'flow-online-booking', icon: CalendarCheck, type: 'flow' },
  { slug: 'flow-new-employee', icon: UserPlus, type: 'flow' },
  { slug: 'flow-branch-setup', icon: Settings, type: 'flow' },
] as const;

export const TOPIC_SLUGS = new Set(TOPICS.map((t) => t.slug));
export const REFERENCE_TOPICS = TOPICS.filter((t) => t.type === 'topic');
export const FLOW_TOPICS = TOPICS.filter((t) => t.type === 'flow');
