// What every part of the page draws from: the snapshot, what the visitor has chosen, and the prices that follow from it.
import type { PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import type { ComparisonRole, PriceComparison, Selection } from '../src/price-comparison.ts';

export type RoleWording = Record<ComparisonRole, string>;
export const roleWordingOnPage: RoleWording = { cheapest: 'Cheapest', visitor: 'You', compared: 'Compared with', 'most-expensive': 'Most expensive' };

export type OpenPanel = 'product' | 'configuration' | 'currency' | 'visitor-place' | 'compared-place' | 'about-prices' | 'share' | null;

export type PageState = Selection & {
  mapArea: string;
  popUpPlaceCode: string | null;
  openPanel: OpenPanel;
  // The place list shows only this country's states or provinces until the visitor searches or asks for every place.
  placeListCountryCode: string | null;
  // What else changed when one spec was chosen: "Storage changed to 1TB."
  specChangeNote: string;
  // The visitor's own words for the post, kept exactly as typed, even when empty. Not typed yet: the sentence the page suggests.
  shareTextAsTyped: string | null;
  locationProblem: string;
};

export type PageView = {
  snapshot: PriceSnapshot;
  state: PageState;
  comparison: PriceComparison;
  // A shared link opens exactly as shared. When it was shared from another country than the one it is opened in, this is the opener's own
  // place, and the page names the shared place instead of calling it "you".
  openerPlaceCode: string | null;
  roleWording: RoleWording;
  // "you", or "the Netherlands" for a shared place: "$434 less than you".
  visitorInComparisons: string;
};


export const isPhoneWidth = () => matchMedia('(max-width: 720px)').matches;
