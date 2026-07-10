import type { Shoot, StaffLeave, Vehicle } from '@/lib/db/types';

/** Row shapes the /production server page passes into its client tabs. */

export type ShootRow = Shoot & {
  clients: { name: string } | null;
  vehicles: { name: string } | null;
};

export type LeaveRow = StaffLeave & {
  profiles: { full_name: string } | null;
};

export type VehicleRow = Vehicle;

export interface ClientOption {
  id: string;
  name: string;
}

export interface ProfileOption {
  id: string;
  full_name: string;
}
