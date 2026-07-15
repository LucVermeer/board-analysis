// Gym kiosk (smart-TV wall dashboard) entity types.

import type { Gym } from './gyms';

/**
 * One resolved board on a kiosk, in slot order. `boardId` is always present
 * here because a board only makes it into the resolved list when its
 * presence-channel id is safe to expose (public, or the viewer can edit it).
 */
export type GymKioskBoard = {
  boardId: number;
  boardUuid: string;
  name: string;
  boardType: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

/**
 * A gym kiosk. `layout` is intentionally typed `unknown` (the JSON scalar):
 * stored layouts are read leniently, so consumers must parse with
 * `parseKioskLayoutLenient` from @boardsesh/kiosk rather than trust the shape.
 */
export type GymKiosk = {
  uuid: string;
  slug: string;
  name: string;
  layout: unknown;
  gym: Gym;
  boards: GymKioskBoard[];
  createdAt: string;
  updatedAt: string;
};

export type CreateGymKioskInput = {
  gymUuid: string;
  name: string;
  slug?: string;
};

export type UpdateGymKioskInput = {
  kioskUuid: string;
  name?: string;
  slug?: string;
  layout?: unknown;
};
