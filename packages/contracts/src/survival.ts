/** Survival needs drain / restore rates (real-time). */

/** Points lost per real hour when not eating/drinking. */
export const HUNGER_DRAIN_PER_HOUR = 4;
export const THIRST_DRAIN_PER_HOUR = 6;
export const ENERGY_DRAIN_PER_HOUR = 2;

/** How much one inventory unit restores. */
export const FOOD_RESTORE = 35;
export const WATER_RESTORE = 40;
export const FOOD_ENERGY_BONUS = 5;

/** HP damage per hour while critically hungry/thirsty. */
export const STARVATION_HP_PER_HOUR = 8;
export const DEHYDRATION_HP_PER_HOUR = 12;

export const CRITICAL_HUNGER = 20;
export const CRITICAL_THIRST = 20;

export const SUPPLY_ITEM_KEYS = ["food", "water"] as const;
export type SupplyItemKey = (typeof SUPPLY_ITEM_KEYS)[number];

export const SUPPLY_PRICES_CENTS: Record<SupplyItemKey, number> = {
  food: 250, // 2.50 ORB per ration
  water: 150,
};

export function isSupplyItemKey(key: string): key is SupplyItemKey {
  return (SUPPLY_ITEM_KEYS as readonly string[]).includes(key);
}
