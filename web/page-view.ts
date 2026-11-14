// What every part of the page draws from: the snapshot, what the visitor has chosen, and the prices that follow from it.
import type { PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import type { PlacesOnPriceLine } from '../src/price-line.ts';
import type { PriceComparison, Selection } from '../src/price-comparison.ts';

export type OpenPanel = 'product' | 'configuration' | 'currency' | 'visitor-place' | 'compared-place' | 'all-prices' | 'about-prices' | 'share' | null;

export type PageState = Selection & {
  mapArea: string;
  popUpPlaceCode: string | null;
  popUpOpenedFrom: 'map' | 'price-line';
  openPanel: OpenPanel;
  // The place list shows only this country's states or provinces until the visitor searches or asks for every place.
  placeListCountryCode: string | null;
  // Not chosen: the price line follows the map, states and provinces when the map shows the United States or Canada.
  placesOnPriceLine: PlacesOnPriceLine | null;
  // What else changed when one spec was chosen: "Storage changed to 1TB."
  specChangeNote: string;
  // The visitor's own words for the post, kept exactly as typed, even when empty. Not typed yet: the sentence the page suggests.
  shareTextAsTyped: string | null;
  locationProblem: string;
};

export type PageView = { snapshot: PriceSnapshot; state: PageState; comparison: PriceComparison };

export const placesShownOnPriceLine = (state: PageState): PlacesOnPriceLine =>
  state.placesOnPriceLine ?? (['united-states', 'canada', 'us-north-east'].includes(state.mapArea) ? 'states-and-provinces' : 'countries');

export const isPhoneWidth = () => matchMedia('(max-width: 720px)').matches;
