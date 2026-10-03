// Photography from Unsplash (free under the Unsplash License — https://unsplash.com/license).
// Served from Unsplash's image CDN with on-the-fly resizing; credits are shown in the site footer.
const CDN = 'https://images.unsplash.com/';

export const PHOTOS = {
  caneRows:   { id: 'photo-1606707761700-86b58f251a01', alt: 'Rows of young sugarcane stretching to the horizon', by: 'Ashwini Chaudhary (Monty)', page: 'https://unsplash.com/photos/dXoEk6gfV50' },
  tractor:    { id: 'photo-1606711387932-5ba25bbad5e6', alt: 'Red tractor parked beside a sugarcane field', by: 'Ashwini Chaudhary (Monty)', page: 'https://unsplash.com/photos/egeN7GYoONs' },
  harvest:    { id: 'photo-1790858986801-4980485e653a', alt: 'Farmer harvesting sugarcane by hand', by: 'proudlyswazi', page: 'https://unsplash.com/photos/ITx3KuAHA48' },
  concrete:   { id: 'photo-1600730424902-a3a3be6af112', alt: 'Brutalist concrete building with a stepped facade', by: 'Mark McLaughlin', page: 'https://unsplash.com/photos/8_UDWAPHISM' },
  silos:      { id: 'photo-1692632477775-8a8f4410d425', alt: 'Grain silos and a conveyor tower against the sky', by: 'Cyrus Crossan', page: 'https://unsplash.com/photos/lz3RZ7COLGw' },
  sprinklers: { id: 'photo-1738598665698-7fd7af4b5e0c', alt: 'Sprinklers irrigating a crop field', by: 'Being Organic in EU', page: 'https://unsplash.com/photos/ZYiOik4jels' },
  drip:       { id: 'photo-1640677117376-573b9dbb8ea8', alt: 'Young plants in rows with drip irrigation lines', by: 'Anil Sharma', page: 'https://unsplash.com/photos/tlRkBCY9vsI' },
  aerial:     { id: 'photo-1516822277566-bb38424a2b77', alt: 'Aerial view of farm fields in strips', by: 'jean wimmerlin', page: 'https://unsplash.com/photos/RUj5b4YXaHE' },
  farmers:    { id: 'photo-1707721690544-781fe6ede937', alt: 'Women farmers working together in a field', by: 'EqualStock', page: 'https://unsplash.com/photos/71L0v2kw424' },
};

/** Responsive src/srcSet for an Unsplash photo. */
export function img(photo, { w = 1200, h, q = 70 } = {}) {
  const u = (width) => `${CDN}${photo.id}?w=${width}${h ? `&h=${Math.round((h * width) / w)}` : ''}&q=${q}&auto=format&fit=crop`;
  return {
    src: u(w),
    srcSet: [Math.round(w / 2), w, Math.round(w * 1.5)].map((x) => `${u(x)} ${x}w`).join(', '),
    alt: photo.alt,
  };
}
