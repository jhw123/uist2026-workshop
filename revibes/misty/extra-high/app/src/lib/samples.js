// Starting material for the canvas. The source UIs are rebuilt from the paper's
// descriptions (Figure 1 B, the §2 scenario, the study's "book list" task); the
// example images were made for this revibe (scripts/make-assets.mjs).

const parkCard = (name, place, rating, level, miles, est) => `
        <div className="rounded-md border border-gray-200 p-3">
          <h3 className="font-semibold text-gray-900">${name}</h3>
          <p className="text-sm text-gray-600">${place}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <Star className="h-3 w-3 text-yellow-500" />
            <span>${rating} · ${level} · ${miles} mi · Est. ${est}</span>
          </div>
          <button className="mt-2 text-xs text-red-600">Delete</button>
        </div>`;

export const PARKS_CODE = `() => {
  return (
    <div className="min-h-full bg-white p-4">
      <input
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        placeholder="Find parks"
      />
      <div className="mt-3 flex gap-2">
        <button className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">Nearby</button>
        <button className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">Epic views</button>
        <button className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">Wildflowers</button>
      </div>
      <div className="mt-4 space-y-3">${[
        parkCard("Steep Ravine, Dipsea and Matt Davis", "Stinson Beach, California", "4.8", "Moderate", "6.60", "3h 41m"),
        parkCard("Bear Mountain, Appalachian Trail", "Bear Mountain, New York", "4.7", "Hard", "4.00", "2h 20m"),
        parkCard("Sunset Ridge, Griffith Park", "Los Angeles, California", "4.9", "Easy", "3.20", "1h 30m"),
        parkCard("Yosemite Falls Trail", "Yosemite National Park, California", "4.8", "Hard", "7.20", "6h 00m"),
        parkCard("Angel's Landing", "Zion National Park, Utah", "4.9", "Hard", "5.40", "4h 00m"),
      ].join("")}
      </div>
    </div>
  );
}`;

export const PROFILE_CODE = `() => {
  return (
    <div className="min-h-full bg-white p-6">
      <div className="flex flex-col items-center">
        <img src="/stock/portrait2.jpg" className="h-24 w-24 rounded-full object-cover" />
        <h1 className="mt-3 text-xl font-semibold text-gray-900">Fuji</h1>
        <p className="mt-1 text-center text-sm text-gray-600">
          Passionate nature photographer. Chasing light across mountains and coastlines.
        </p>
      </div>
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
        <div className="mt-2 space-y-1 text-sm text-gray-700">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4" /><span>fuji@example.com</span></div>
          <div className="flex items-center gap-2"><Phone className="h-4 w-4" /><span>(555) 012-3456</span></div>
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span>Portland, Oregon</span></div>
        </div>
      </div>
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Interests</h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          <li>Film Camera</li>
          <li>Lofi Music</li>
          <li>Mid-Century Furniture</li>
          <li>Music Production</li>
        </ul>
      </div>
    </div>
  );
}`;

const book = (title, author, progress) => `
        <div className="border-b border-gray-200 py-3">
          <p className="font-medium text-gray-900">${title}</p>
          <p className="text-sm text-gray-600">${author}</p>
          <p className="mt-1 text-xs text-gray-500">${progress}</p>
        </div>`;

export const BOOKS_CODE = `() => {
  return (
    <div className="min-h-full bg-white p-4">
      <h1 className="text-lg font-semibold text-gray-900">My Reading List</h1>
      <p className="text-sm text-gray-500">5 books</p>
      <div className="mt-3">${[
        book("The Design of Everyday Things", "Don Norman", "Reading · 62%"),
        book("Sketching User Experiences", "Bill Buxton", "Reading · 18%"),
        book("The Way We Think", "Gilles Fauconnier & Mark Turner", "Want to read"),
        book("Thinking with Type", "Ellen Lupton", "Finished"),
        book("Refactoring UI", "Adam Wathan & Steve Schoger", "Want to read"),
      ].join("")}
      </div>
    </div>
  );
}`;

export const SAMPLE_SOURCES = [
  { title: "Park finder", code: PARKS_CODE },
  { title: "Fuji's profile", code: PROFILE_CODE },
  { title: "Reading list", code: BOOKS_CODE },
];

export const SAMPLE_EXAMPLES = [
  { title: "Store: featured cards", src: "/samples/featured-store.png" },
  { title: "Music profile", src: "/samples/music-profile.png" },
  { title: "Dark category list", src: "/samples/dark-health-list.png" },
  { title: "Hand-drawn sketch", src: "/samples/sketch-wireframe.png" },
];
