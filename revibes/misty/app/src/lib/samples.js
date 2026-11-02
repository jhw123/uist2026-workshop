// Starter work-in-progress UIs, written from the paper's descriptions
// (Figure 1B "Find parks" list, and Fuji's profile page from Section 2).

export const PARKS = `() => {
  return (
    <div className="min-h-full bg-white p-4 font-sans">
      <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3" placeholder="Find parks" />
      <div className="flex gap-2 mb-4">
        <span className="px-3 py-1 text-sm bg-gray-100 rounded">Nearby</span>
        <span className="px-3 py-1 text-sm bg-gray-100 rounded">Epic views</span>
        <span className="px-3 py-1 text-sm bg-gray-100 rounded">Wildflowers</span>
      </div>
      <div className="border border-gray-200 rounded p-3 mb-3">
        <h2 className="font-semibold">Steep Ravine, Dipsea and Matt Davis</h2>
        <p className="text-sm text-gray-600">Stinson Beach, California</p>
        <p className="text-xs text-gray-500 mt-1">4.8 · Moderate · 6.60 mi · Est. 3h 41m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded p-3 mb-3">
        <h2 className="font-semibold">Bear Mountain, Appalachian Trail</h2>
        <p className="text-sm text-gray-600">Bear Mountain, New York</p>
        <p className="text-xs text-gray-500 mt-1">4.7 · Hard · 4.00 mi · Est. 2h 20m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded p-3 mb-3">
        <h2 className="font-semibold">Sunset Ridge, Griffith Park</h2>
        <p className="text-sm text-gray-600">Los Angeles, California</p>
        <p className="text-xs text-gray-500 mt-1">4.9 · Easy · 3.20 mi · Est. 1h 30m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded p-3 mb-3">
        <h2 className="font-semibold">Yosemite Falls Trail</h2>
        <p className="text-sm text-gray-600">Yosemite National Park, California</p>
        <p className="text-xs text-gray-500 mt-1">4.8 · Hard · 7.20 mi · Est. 6h 00m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
      <div className="border border-gray-200 rounded p-3 mb-3">
        <h2 className="font-semibold">Angel's Landing</h2>
        <p className="text-sm text-gray-600">Zion National Park, Utah</p>
        <p className="text-xs text-gray-500 mt-1">4.9 · Hard · 5.40 mi · Est. 4h 00m</p>
        <button className="text-xs text-red-600 mt-2">Delete</button>
      </div>
    </div>
  );
}`;

export const PROFILE = `() => {
  return (
    <div className="min-h-full bg-white p-5 font-sans text-gray-800">
      <div className="flex flex-col items-center">
        <img src="/stock/square0.jpg" className="w-24 h-24 rounded-full object-cover" />
        <h1 className="text-xl font-semibold mt-3">Fuji</h1>
        <p className="text-sm text-gray-500">@fujimist</p>
        <p className="text-sm text-center mt-2">Passionate nature photographer and lofi music enthusiast based in Seattle.</p>
      </div>
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Contact</h2>
        <p className="text-sm">fuji@example.com</p>
        <p className="text-sm">(206) 555-0142</p>
      </div>
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Interests</h2>
        <ul className="text-sm">
          <li className="py-1 border-b border-gray-200">Film Camera</li>
          <li className="py-1 border-b border-gray-200">Lofi Music</li>
          <li className="py-1 border-b border-gray-200">Mid-Century Furniture</li>
          <li className="py-1 border-b border-gray-200">Music Production</li>
        </ul>
      </div>
    </div>
  );
}`;

export const SAMPLES = [
  { name: 'Find parks (Figure 1)', code: PARKS },
  { name: "Fuji's profile (Section 2)", code: PROFILE },
];
