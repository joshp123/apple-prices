// What every part of the page draws from: the snapshot, what the visitor has chosen, and the prices that follow from it.
import type { PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import type { ComparisonRole, PriceComparison, Selection } from '../src/price-comparison.ts';

export type RoleWording = Record<ComparisonRole, string>;
export const roleWordingOnPage: RoleWording = { cheapest: 'Cheapest', visitor: 'You', compared: 'Compared with', 'most-expensive': 'Most expensive' };

export type PageState = Selection & {
  // The place whose pop-up is open on the map.
  popUpPlaceCode: string | null;
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
