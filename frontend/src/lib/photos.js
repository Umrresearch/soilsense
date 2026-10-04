// Photography from Unsplash (free under the Unsplash License — https://unsplash.com/license).
// Served from Unsplash's image CDN with on-the-fly resizing; credits are shown in the site footer.
const CDN = 'https://images.unsplash.com/';

export const PHOTOS = {
  rows:       { id: 'photo-1560493676-04071c5f467b', alt: 'Long rows of green crops running to the horizon at sunset', by: 'Dan Meyers', page: 'https://unsplash.com/photos/IQVFVH0ajag' },
  pivot:      { id: 'photo-1692369584496-3216a88f94c1', alt: 'Centre-pivot irrigation spraying water over a green crop', by: 'Lumin Osity', page: 'https://unsplash.com/photos/6DMht7wYt6g' },
  soil:       { id: 'photo-1492496913980-501348b61469', alt: 'Cupped hands holding a mound of rich soil', by: 'Gabriel Jimenez', page: 'https://unsplash.com/photos/jin4W1HqgL4' },
  dew:        { id: 'photo-1446608943998-cbd52b140335', alt: 'Water droplets resting on a green leaf', by: 'dan carlson', page: 'https://unsplash.com/photos/G86MS2ZsiJA' },
  harvest:    { id: 'photo-1752775312083-1cefe2f93358', alt: 'A young plant growing out of brown soil', by: 'Sercan Naya', page: 'https://unsplash.com/photos/dnKOzWK2Ue0' },
  sprouts:    { id: 'photo-1586771107445-d3ca888129ff', alt: 'Young green sprouts in furrowed soil under low sun', by: 'Jan Kopřiva', page: 'https://unsplash.com/photos/LTMaAwxanGk' },
  paddy:      { id: 'photo-1662392559315-fb7035900d1f', alt: 'A seedling growing beside a drip irrigation line', by: 'Eric Brehm', page: 'https://unsplash.com/photos/fZDIGIZ1e8E' },
  aerial:     { id: 'photo-1525858628969-2c3e8d8e1b42', alt: 'Aerial view of green farmland', by: 'Ivan Bandura', page: 'https://unsplash.com/photos/g_1_FXigeGc' },
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
