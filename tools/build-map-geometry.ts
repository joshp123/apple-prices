// Writes assets/map/places.topojson: every country, with the United States and Canada drawn as their states, provinces and territories.
import { readFile, writeFile } from 'node:fs/promises';
import isoCountries from 'i18n-iso-countries';
import * as topojsonClient from 'topojson-client';
import * as topojsonServer from 'topojson-server';
import * as topojsonSimplify from 'topojson-simplify';

const naturalEarthStatesAndProvincesUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson';
const naturalEarthDetailedRegionsUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';
const unitedStates = '840', canada = '124', antarctica = '010', israel = '376', palestine = '275', russia = '643', ukraine = '804';
// Russia and Ukraine are drawn with the borders in Russia's constitution: Crimea and Sevastopol (already Russian in Natural Earth's
// regions), and the Donetsk, Luhansk, Zaporizhzhia and Kherson regions.
const ukrainianRegionsInRussiasConstitution = new Set(['UA-14', 'UA-09', 'UA-23', 'UA-65']);
// Natural Earth's detailed regions carry about eighteen times the points of the country outlines the rest of the map uses.
const shareOfDetailedRegionPointsDropped = 0.94;
const shareOfDetailKept = 0.42;

const world = JSON.parse(await readFile('node_modules/world-atlas/countries-50m.json', 'utf8'));
const countryGeometries = world.objects.countries.geometries;
const drawnSeparately = new Set([unitedStates, canada, antarctica, israel, palestine, russia, ukraine]);

type PlaceFeature = { type: 'Feature'; properties: { placeCode: string }; geometry: unknown };
const features: PlaceFeature[] = [];
let unnamedShapeCount = 0;

for (const geometry of countryGeometries) {
  if (drawnSeparately.has(geometry.id)) continue;
  const countryCode = geometry.properties.name === 'Kosovo' ? 'XK' : isoCountries.numericToAlpha2(geometry.id);
  features.push({ type: 'Feature', properties: { placeCode: countryCode ?? `unnamed-${++unnamedShapeCount}` }, geometry: topojsonClient.feature(world, geometry).geometry });
}
features.push({ type: 'Feature', properties: { placeCode: 'PS' }, geometry: topojsonClient.merge(world, countryGeometries.filter((geometry: { id: string }) => geometry.id === israel || geometry.id === palestine)) });

const detailedRegions = (await (await fetch(naturalEarthDetailedRegionsUrl)).json()).features
  .filter((region: { properties: { adm0_a3: string } }) => ['RUS', 'UKR'].includes(region.properties.adm0_a3));
let regionTopology = topojsonServer.topology({ regions: { type: 'FeatureCollection', features: detailedRegions } }, 1e5);
regionTopology = topojsonSimplify.presimplify(regionTopology);
regionTopology = topojsonSimplify.simplify(regionTopology, topojsonSimplify.quantile(regionTopology, shareOfDetailedRegionPointsDropped));
const regionGeometries = regionTopology.objects.regions.geometries;
const isRussianUnderItsConstitution = (region: { properties: { adm0_a3: string; iso_3166_2: string } }) =>
  region.properties.adm0_a3 === 'RUS' || ukrainianRegionsInRussiasConstitution.has(region.properties.iso_3166_2);
features.push({ type: 'Feature', properties: { placeCode: 'RU' }, geometry: topojsonClient.merge(regionTopology, regionGeometries.filter(isRussianUnderItsConstitution)) });
features.push({ type: 'Feature', properties: { placeCode: 'UA' }, geometry: topojsonClient.merge(regionTopology, regionGeometries.filter((region: never) => !isRussianUnderItsConstitution(region))) });

const statesAndProvinces = await (await fetch(naturalEarthStatesAndProvincesUrl)).json();
for (const feature of statesAndProvinces.features) {
  if (['US', 'CA'].includes(feature.properties.iso_a2)) features.push({ type: 'Feature', properties: { placeCode: feature.properties.iso_3166_2 }, geometry: feature.geometry });
}

// Natural Earth gives a few countries a second small outline under the same code (Australia's Ashmore and Cartier Islands); only the biggest keeps the code.
const outlineSize = (feature: PlaceFeature) => JSON.stringify(feature.geometry).length;
const biggestByPlaceCode = new Map<string, PlaceFeature>();
for (const feature of features) {
  const biggest = biggestByPlaceCode.get(feature.properties.placeCode);
  if (!biggest || outlineSize(feature) > outlineSize(biggest)) biggestByPlaceCode.set(feature.properties.placeCode, feature);
}
for (const feature of features) {
  if (biggestByPlaceCode.get(feature.properties.placeCode) !== feature) feature.properties.placeCode = `unnamed-${++unnamedShapeCount}`;
}

let topology = topojsonServer.topology({ places: { type: 'FeatureCollection', features } }, 1e5);
topology = topojsonSimplify.presimplify(topology);
topology = topojsonSimplify.simplify(topology, topojsonSimplify.quantile(topology, shareOfDetailKept));
topology = topojsonClient.quantize(topology, 2e4);
await writeFile('assets/map/places.topojson', JSON.stringify(topology));
console.log(`${features.length} outlines, ${unnamedShapeCount} without a place code`);
