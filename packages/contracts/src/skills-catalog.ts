/** Expanded skill catalog + company industry → skill → yield rules. */

export type SkillCategory =
  | "agriculture"
  | "extraction"
  | "crafts"
  | "construction"
  | "technology"
  | "health"
  | "services"
  | "social"
  | "security"
  | "transport"
  | "science"
  | "governance";

export type SkillDef = {
  key: string;
  name: string;
  description: string;
  category: SkillCategory;
};

export const SKILL_CATALOG: SkillDef[] = [
  // Agriculture
  { key: "agriculture", name: "Agriculture", description: "Grow crops and manage farmland.", category: "agriculture" },
  { key: "animal_husbandry", name: "Animal husbandry", description: "Raise livestock and dairy.", category: "agriculture" },
  { key: "horticulture", name: "Horticulture", description: "Orchards, gardens, and specialty plants.", category: "agriculture" },
  { key: "viticulture", name: "Viticulture", description: "Grow grapes and make wine.", category: "agriculture" },
  { key: "beekeeping", name: "Beekeeping", description: "Keep bees and harvest honey.", category: "agriculture" },
  { key: "aquaculture", name: "Aquaculture", description: "Farm fish and shellfish.", category: "agriculture" },
  // Extraction
  { key: "mining", name: "Mining", description: "Extract ore and stone from the earth.", category: "extraction" },
  { key: "forestry", name: "Forestry", description: "Fell timber and manage forests.", category: "extraction" },
  { key: "fishing", name: "Fishing", description: "Catch wild fish at sea or inland.", category: "extraction" },
  { key: "drilling", name: "Drilling", description: "Oil, gas, and deep-well operations.", category: "extraction" },
  { key: "prospecting", name: "Prospecting", description: "Find mineral and resource deposits.", category: "extraction" },
  // Crafts / manufacturing
  { key: "manufacturing", name: "Manufacturing", description: "Run factories and assembly lines.", category: "crafts" },
  { key: "metallurgy", name: "Metallurgy", description: "Smelt and refine metals.", category: "crafts" },
  { key: "carpentry", name: "Carpentry", description: "Woodwork and fittings.", category: "crafts" },
  { key: "textiles", name: "Textiles", description: "Cloth, clothing, and fabric goods.", category: "crafts" },
  { key: "cooking", name: "Cooking", description: "Prepare food commercially.", category: "crafts" },
  { key: "brewing", name: "Brewing", description: "Brew beer and spirits.", category: "crafts" },
  { key: "crafts", name: "Crafts", description: "Handmade goods and artisanal work.", category: "crafts" },
  // Construction
  { key: "construction", name: "Construction", description: "Build structures and sites.", category: "construction" },
  { key: "engineering", name: "Engineering", description: "Design physical systems and infrastructure.", category: "construction" },
  { key: "architecture", name: "Architecture", description: "Design buildings and urban spaces.", category: "construction" },
  { key: "electrical", name: "Electrical", description: "Wiring, power, and electronics install.", category: "construction" },
  { key: "plumbing", name: "Plumbing", description: "Water and sanitation systems.", category: "construction" },
  // Technology
  { key: "programming", name: "Programming", description: "Software and computation.", category: "technology" },
  { key: "electronics", name: "Electronics", description: "Circuits and device hardware.", category: "technology" },
  { key: "robotics", name: "Robotics", description: "Automate machines and bots.", category: "technology" },
  { key: "data_analysis", name: "Data analysis", description: "Turn data into decisions.", category: "technology" },
  // Health
  { key: "medicine", name: "Medicine", description: "Diagnose and treat illness.", category: "health" },
  { key: "nursing", name: "Nursing", description: "Patient care and clinical support.", category: "health" },
  { key: "pharmacy", name: "Pharmacy", description: "Compound and dispense medicines.", category: "health" },
  { key: "veterinary", name: "Veterinary", description: "Animal health and surgery.", category: "health" },
  // Services / social
  { key: "management", name: "Management", description: "Organize people and work.", category: "services" },
  { key: "sales", name: "Sales", description: "Sell products and close deals.", category: "services" },
  { key: "hospitality", name: "Hospitality", description: "Hotels, tourism, and guest service.", category: "services" },
  { key: "teaching", name: "Teaching", description: "Educate others effectively.", category: "services" },
  { key: "journalism", name: "Journalism", description: "Investigate and publish news.", category: "social" },
  { key: "performing_arts", name: "Performing arts", description: "Music, theatre, and stage craft.", category: "social" },
  { key: "visual_arts", name: "Visual arts", description: "Painting, sculpture, and design.", category: "social" },
  // Security / transport
  { key: "security", name: "Security", description: "Protect people and property.", category: "security" },
  { key: "military", name: "Military", description: "Armed forces tactics and discipline.", category: "security" },
  { key: "logistics", name: "Logistics", description: "Move goods and people efficiently.", category: "transport" },
  { key: "piloting", name: "Piloting", description: "Fly aircraft (when aviation exists).", category: "transport" },
  { key: "seamanship", name: "Seamanship", description: "Operate ships and boats.", category: "transport" },
  { key: "driving", name: "Driving", description: "Operate road vehicles professionally.", category: "transport" },
  // Science / governance
  { key: "science", name: "Science", description: "Research and experimentation.", category: "science" },
  { key: "chemistry", name: "Chemistry", description: "Chemical processes and labs.", category: "science" },
  { key: "geology", name: "Geology", description: "Earth science and surveying.", category: "science" },
  { key: "law", name: "Law", description: "Legal reasoning and procedure.", category: "governance" },
  { key: "economics", name: "Economics", description: "Markets, trade, and finance.", category: "governance" },
  { key: "politics", name: "Politics", description: "Public office and coalition building.", category: "governance" },
  { key: "accounting", name: "Accounting", description: "Books, audits, and tax.", category: "governance" },
];

export type IndustryDef = {
  key: string;
  name: string;
  description: string;
  primarySkillKey: string;
  /** Products this industry is best at producing. */
  products: string[];
};

export const INDUSTRY_CATALOG: IndustryDef[] = [
  { key: "farm", name: "Farm", description: "Crop agriculture.", primarySkillKey: "agriculture", products: ["food", "crops"] },
  { key: "ranch", name: "Ranch", description: "Livestock.", primarySkillKey: "animal_husbandry", products: ["food", "goods"] },
  { key: "orchard", name: "Orchard", description: "Fruit and specialty plants.", primarySkillKey: "horticulture", products: ["food", "crops"] },
  { key: "fishery", name: "Fishery", description: "Wild catch or aquaculture.", primarySkillKey: "fishing", products: ["food"] },
  { key: "mine", name: "Mine", description: "Ore and minerals.", primarySkillKey: "mining", products: ["materials", "ore"] },
  { key: "lumber", name: "Lumber mill", description: "Timber harvest and milling.", primarySkillKey: "forestry", products: ["materials", "timber"] },
  { key: "oil", name: "Oil & gas", description: "Drilling and fuel.", primarySkillKey: "drilling", products: ["materials", "fuel"] },
  { key: "factory", name: "Factory", description: "Manufactured goods.", primarySkillKey: "manufacturing", products: ["goods", "materials"] },
  { key: "smelter", name: "Smelter", description: "Metal refining.", primarySkillKey: "metallurgy", products: ["materials"] },
  { key: "construction_firm", name: "Construction firm", description: "Build for clients.", primarySkillKey: "construction", products: ["materials", "goods"] },
  { key: "clinic", name: "Clinic", description: "Medical services and supplies.", primarySkillKey: "medicine", products: ["medicine"] },
  { key: "pharmacy", name: "Pharmacy", description: "Medicines.", primarySkillKey: "pharmacy", products: ["medicine"] },
  { key: "tech", name: "Tech company", description: "Software and electronics.", primarySkillKey: "programming", products: ["goods"] },
  { key: "logistics_co", name: "Logistics company", description: "Shipping and warehousing.", primarySkillKey: "logistics", products: ["goods"] },
  { key: "restaurant", name: "Restaurant", description: "Prepared food.", primarySkillKey: "cooking", products: ["food"] },
  { key: "school", name: "School", description: "Education.", primarySkillKey: "teaching", products: ["goods"] },
  { key: "general", name: "General company", description: "Mixed operations.", primarySkillKey: "management", products: ["food", "goods", "medicine", "materials"] },
];

/** Fallback skill if product is not tied to the company's industry. */
export const PRODUCT_SKILL: Record<string, string> = {
  food: "agriculture",
  crops: "agriculture",
  goods: "manufacturing",
  medicine: "medicine",
  materials: "mining",
  ore: "mining",
  timber: "forestry",
  fuel: "drilling",
};

/**
 * Skill-based yield multiplier.
 * Level 0 ≈ 0.55×, level 10 ≈ 1.0×, level 30 ≈ 2.0×, level 50 ≈ 3.0× (capped at 5×).
 * More skilled workers and more of them both help.
 */
export function skillYieldMultiplier(avgSkillLevel: number, workerCount: number): number {
  const skillFactor = 0.55 + avgSkillLevel / 20;
  const crewFactor = 1 + 0.08 * Math.min(Math.max(workerCount, 0), 12);
  return Math.min(5, Math.max(0.25, skillFactor * crewFactor));
}

export function effectiveProductionQuantity(
  baseQuantity: number,
  avgSkillLevel: number,
  workerCount: number,
): { quantity: number; multiplier: number } {
  const multiplier = skillYieldMultiplier(avgSkillLevel, workerCount);
  return {
    multiplier,
    quantity: Math.max(1, Math.floor(baseQuantity * multiplier)),
  };
}

export function industryByKey(key: string): IndustryDef {
  return INDUSTRY_CATALOG.find((i) => i.key === key) ?? INDUSTRY_CATALOG.find((i) => i.key === "general")!;
}
