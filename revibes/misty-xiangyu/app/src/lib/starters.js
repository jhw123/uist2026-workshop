// Work-in-progress source UIs to start from. The park list follows Figure 1,
// the profile follows the usage scenario (section 2), the book list is one
// of the study's task bases (section 5.2.2).

export const STARTERS = [
  {
    name: "Find parks (Figure 1)",
    code: `() => {
  return (
    <div className="min-h-full bg-white p-4 font-sans">
      <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3" placeholder="Find parks" />
      <div className="flex gap-2 mb-4">
        <span className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-700">Nearby</span>
        <span className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-700">Epic views</span>
        <span className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-700">Wildflowers</span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="border border-gray-200 rounded p-3">
          <h3 className="font-semibold text-gray-900">Steep Ravine, Dipsea and Matt Davis</h3>
          <p className="text-sm text-gray-600">Stinson Beach, California</p>
          <p className="text-xs text-gray-500 mt-1">4.8 · Moderate · 6.60 mi · Est. 3h 41m</p>
          <button className="text-xs text-red-600 mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded p-3">
          <h3 className="font-semibold text-gray-900">Bear Mountain, Appalachian Trail</h3>
          <p className="text-sm text-gray-600">Bear Mountain, New York</p>
          <p className="text-xs text-gray-500 mt-1">4.7 · Hard · 4.00 mi · Est. 2h 20m</p>
          <button className="text-xs text-red-600 mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded p-3">
          <h3 className="font-semibold text-gray-900">Sunset Ridge, Griffith Park</h3>
          <p className="text-sm text-gray-600">Los Angeles, California</p>
          <p className="text-xs text-gray-500 mt-1">4.9 · Easy · 3.20 mi · Est. 1h 30m</p>
          <button className="text-xs text-red-600 mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded p-3">
          <h3 className="font-semibold text-gray-900">Yosemite Falls Trail</h3>
          <p className="text-sm text-gray-600">Yosemite National Park, California</p>
          <p className="text-xs text-gray-500 mt-1">4.8 · Hard · 7.20 mi · Est. 6h 00m</p>
          <button className="text-xs text-red-600 mt-2">Delete</button>
        </div>
      </div>
    </div>
  );
}`,
  },
  {
    name: "User profile (Fuji)",
    code: `() => {
  return (
    <div className="min-h-full bg-white p-5 font-sans">
      <div className="flex flex-col items-center">
        <img src="/stock/square0.svg" className="w-24 h-24 rounded-full object-cover" />
        <h1 className="text-xl font-bold text-gray-900 mt-3">Fuji</h1>
        <p className="text-sm text-gray-500">@fujimist</p>
        <p className="text-sm text-gray-700 text-center mt-2">Passionate nature photographer and weekend music producer.</p>
      </div>
      <div className="mt-6">
        <h2 className="font-semibold text-gray-900 mb-2">Contact</h2>
        <p className="text-sm text-gray-700">fuji@example.com</p>
        <p className="text-sm text-gray-700">(555) 123-4567</p>
      </div>
      <div className="mt-6">
        <h2 className="font-semibold text-gray-900 mb-2">Interests</h2>
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
  {
    name: "Book list",
    code: `() => {
  return (
    <div className="min-h-full bg-white p-4 font-sans">
      <h1 className="text-lg font-bold text-gray-900 mb-3">My Reading List</h1>
      <div className="flex flex-col gap-2">
        <div className="p-2 border-b border-gray-200">
          <p className="font-medium text-gray-900">The Left Hand of Darkness</p>
          <p className="text-sm text-gray-600">Ursula K. Le Guin · 1969</p>
        </div>
        <div className="p-2 border-b border-gray-200">
          <p className="font-medium text-gray-900">Piranesi</p>
          <p className="text-sm text-gray-600">Susanna Clarke · 2020</p>
        </div>
        <div className="p-2 border-b border-gray-200">
          <p className="font-medium text-gray-900">The Design of Everyday Things</p>
          <p className="text-sm text-gray-600">Don Norman · 1988</p>
        </div>
        <div className="p-2 border-b border-gray-200">
          <p className="font-medium text-gray-900">Station Eleven</p>
          <p className="text-sm text-gray-600">Emily St. John Mandel · 2014</p>
        </div>
      </div>
    </div>
  );
}`,
  },
  {
    name: "Blank",
    code: `() => {
  return (
    <div className="min-h-full bg-white p-4">
      <h1 className="text-lg font-bold">Hello</h1>
    </div>
  );
}`,
  },
];

export const SAMPLE_EXAMPLES = [
  { name: "Store page with featured card", url: "/examples/store-featured.svg" },
  { name: "Dark health categories list", url: "/examples/health-dark.svg" },
  { name: "Profile with playlist carousel", url: "/examples/music-profile.svg" },
  { name: "Hand-drawn sketch", url: "/examples/sketch.svg" },
];
