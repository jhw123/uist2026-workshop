// Work-in-progress source UIs to start from. Modelled on the paper's scenarios: the
// "Find parks" cards (Figure 1 B), Fuji's profile page (Section 2) and a book list (Section 5.2.2).

export const SAMPLE_SOURCES = {
  parks: {
    title: "Find parks",
    code: `() => {
  return (
    <div className="min-h-screen bg-white p-4 font-sans">
      <input
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3"
        placeholder="Find parks"
      />
      <div className="flex gap-2 mb-4">
        <span className="px-3 py-1 bg-gray-100 rounded-md text-sm text-gray-700">Nearby</span>
        <span className="px-3 py-1 bg-gray-100 rounded-md text-sm text-gray-700">Epic views</span>
        <span className="px-3 py-1 bg-gray-100 rounded-md text-sm text-gray-700">Wildflowers</span>
      </div>
      <div className="border border-gray-200 rounded-md p-3 mb-3">
        <h2 className="font-semibold text-gray-900">Steep Ravine, Dipsea and Matt Davis</h2>
        <p className="text-sm text-gray-600">Stinson Beach, California</p>
        <p className="text-xs text-gray-500 mt-1">4.8 · Moderate · 6.60 mi · Est. 3h 41m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded-md p-3 mb-3">
        <h2 className="font-semibold text-gray-900">Bear Mountain, Appalachian Trail</h2>
        <p className="text-sm text-gray-600">Bear Mountain, New York</p>
        <p className="text-xs text-gray-500 mt-1">4.7 · Hard · 4.00 mi · Est. 2h 20m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded-md p-3 mb-3">
        <h2 className="font-semibold text-gray-900">Sunset Ridge, Griffith Park</h2>
        <p className="text-sm text-gray-600">Los Angeles, California</p>
        <p className="text-xs text-gray-500 mt-1">4.9 · Easy · 3.20 mi · Est. 1h 30m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded-md p-3 mb-3">
        <h2 className="font-semibold text-gray-900">Yosemite Falls Trail</h2>
        <p className="text-sm text-gray-600">Yosemite National Park, California</p>
        <p className="text-xs text-gray-500 mt-1">4.8 · Hard · 7.20 mi · Est. 6h 00m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded-md p-3 mb-3">
        <h2 className="font-semibold text-gray-900">Angel's Landing</h2>
        <p className="text-sm text-gray-600">Zion National Park, Utah</p>
        <p className="text-xs text-gray-500 mt-1">4.9 · Hard · 5.40 mi · Est. 4h 00m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
    </div>
  );
}`,
  },
  profile: {
    title: "Profile",
    code: `() => {
  return (
    <div className="min-h-screen bg-white p-6 font-sans">
      <div className="flex flex-col items-center">
        <img src="/stock/square0.jpg" className="w-24 h-24 rounded-full object-cover" />
        <h1 className="text-xl font-semibold mt-3 text-gray-900">Fuji</h1>
        <p className="text-sm text-gray-500">@fujimist</p>
        <p className="text-sm text-gray-700 text-center mt-2">
          Passionate nature photographer chasing light across mountains and coastlines.
        </p>
      </div>
      <div className="mt-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Contact</h2>
        <p className="text-sm text-gray-700">fuji@example.com</p>
        <p className="text-sm text-gray-700">+1 (555) 013-2026</p>
        <p className="text-sm text-gray-700">Seattle, WA</p>
      </div>
      <div className="mt-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Interests</h2>
        <ul className="text-sm text-gray-700">
          <li className="py-1">Film Camera</li>
          <li className="py-1">Lofi Music</li>
          <li className="py-1">Mid-Century Furniture</li>
          <li className="py-1">Music Production</li>
        </ul>
      </div>
    </div>
  );
}`,
  },
  books: {
    title: "Reading list",
    code: `() => {
  return (
    <div className="min-h-screen bg-white p-4 font-sans">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My reading list</h1>
      <div className="flex items-center gap-3 py-3 border-b border-gray-200">
        <img src="/stock/portrait0.jpg" className="w-12 h-16 object-cover" />
        <div>
          <h2 className="font-medium text-gray-900">The Design of Everyday Things</h2>
          <p className="text-sm text-gray-500">Don Norman</p>
        </div>
      </div>
      <div className="flex items-center gap-3 py-3 border-b border-gray-200">
        <img src="/stock/portrait1.jpg" className="w-12 h-16 object-cover" />
        <div>
          <h2 className="font-medium text-gray-900">Sketching User Experiences</h2>
          <p className="text-sm text-gray-500">Bill Buxton</p>
        </div>
      </div>
      <div className="flex items-center gap-3 py-3 border-b border-gray-200">
        <img src="/stock/portrait2.jpg" className="w-12 h-16 object-cover" />
        <div>
          <h2 className="font-medium text-gray-900">The Way We Think</h2>
          <p className="text-sm text-gray-500">Gilles Fauconnier and Mark Turner</p>
        </div>
      </div>
      <div className="flex items-center gap-3 py-3 border-b border-gray-200">
        <img src="/stock/portrait3.jpg" className="w-12 h-16 object-cover" />
        <div>
          <h2 className="font-medium text-gray-900">Atomic Design</h2>
          <p className="text-sm text-gray-500">Brad Frost</p>
        </div>
      </div>
    </div>
  );
}`,
  },
  blank: {
    title: "Blank",
    code: `() => {
  return (
    <div className="min-h-screen bg-white p-6 font-sans">
      <h1 className="text-xl font-semibold text-gray-900">Hello</h1>
      <p className="text-sm text-gray-600">Paste or write your React + Tailwind code in the code editor.</p>
    </div>
  );
}`,
  },
};

// Example images drawn for this rebuild (public/examples). Users mostly upload their own.
export const SAMPLE_EXAMPLES = [
  { file: "/examples/store-featured.svg", name: "Store: featured card" },
  { file: "/examples/health-dark-list.svg", name: "Dark list" },
  { file: "/examples/music-profile.svg", name: "Profile with carousel" },
  { file: "/examples/sketch-grid.svg", name: "Hand-drawn sketch" },
];
