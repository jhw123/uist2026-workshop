// Sample material: the work-in-progress UIs and example images from the paper.

export const FUJI_PROFILE_CODE = `() => {
  return (
    <div className="w-full h-full bg-gray-100 p-6 flex flex-col items-center overflow-y-auto">
      <img src="/stock/square0.jpg" alt="avatar" className="w-24 h-24 rounded-full object-cover border-2 border-white shadow" />
      <h1 className="mt-4 text-xl font-bold text-gray-900">Fuji</h1>
      <p className="mt-2 text-center text-gray-600 text-sm">
        Passionate nature photographer. Find me by the water, or in the woods.
      </p>
      <div className="mt-3 text-center text-sm text-gray-500">
        <p>Email: photos@fuji.net</p>
        <p>Phone: +123 456 7890</p>
      </div>
      <div className="w-full mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Interests</h2>
        <div className="bg-white rounded-lg px-4 py-3 mb-2 text-sm text-gray-800 shadow-sm">Film Camera</div>
        <div className="bg-white rounded-lg px-4 py-3 mb-2 text-sm text-gray-800 shadow-sm">Lofi Music</div>
        <div className="bg-white rounded-lg px-4 py-3 mb-2 text-sm text-gray-800 shadow-sm">Mid-Century Furniture</div>
        <div className="bg-white rounded-lg px-4 py-3 mb-2 text-sm text-gray-800 shadow-sm">Music Production</div>
      </div>
    </div>
  );
}`

export const PARKS_CODE = `() => {
  return (
    <div className="w-full h-full bg-white p-4 overflow-y-auto">
      <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm placeholder-gray-400" placeholder="Find parks" />
      <div className="flex gap-2 mt-3">
        <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-md">Nearby</span>
        <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-md">Epic views</span>
        <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-md">Wildflowers</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-semibold text-gray-900">Steep Ravine, Dipsea and Matt Davis</h3>
          <p className="text-sm text-gray-600">Stinson Beach, California</p>
          <p className="text-xs text-gray-500 mt-1">⭐ 4.8 · Moderate · 6.60 mi · Est. 3h 41m</p>
          <button className="text-red-500 text-xs mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-semibold text-gray-900">Bear Mountain, Appalachian Trail</h3>
          <p className="text-sm text-gray-600">Bear Mountain, New York</p>
          <p className="text-xs text-gray-500 mt-1">⭐ 4.7 · Hard · 4.00 mi · Est. 2h 20m</p>
          <button className="text-red-500 text-xs mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-semibold text-gray-900">Sunset Ridge, Griffith Park</h3>
          <p className="text-sm text-gray-600">Los Angeles, California</p>
          <p className="text-xs text-gray-500 mt-1">⭐ 4.9 · Easy · 3.20 mi · Est. 1h 30m</p>
          <button className="text-red-500 text-xs mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-semibold text-gray-900">Yosemite Falls Trail</h3>
          <p className="text-sm text-gray-600">Yosemite National Park, California</p>
          <p className="text-xs text-gray-500 mt-1">⭐ 4.8 · Hard · 7.20 mi · Est. 6h 00m</p>
          <button className="text-red-500 text-xs mt-2">Delete</button>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <h3 className="font-semibold text-gray-900">Angel's Landing</h3>
          <p className="text-sm text-gray-600">Zion National Park, Utah</p>
          <p className="text-xs text-gray-500 mt-1">⭐ 4.9 · Hard · 5.40 mi · Est. 4h 00m</p>
          <button className="text-red-500 text-xs mt-2">Delete</button>
        </div>
      </div>
    </div>
  );
}`

export interface SampleExample {
  id: string
  label: string
  src: string
  note: string
}

export const SAMPLE_EXAMPLES: SampleExample[] = [
  { id: 'health-categories', label: 'Health Categories (dark list)', src: '/examples/health-categories.png', note: 'Recreated from the paper, scenario step 1' },
  { id: 'music-profile', label: 'Music profile (carousel, Edit button)', src: '/examples/music-profile.png', note: 'Recreated from the paper, scenario steps 6 and 10' },
  { id: 'apple-store', label: 'Store products (featured card)', src: '/examples/apple-store.png', note: 'Recreated from the paper, Figure 1 A' },
  { id: 'sketch-dashboard', label: 'Hand-drawn sketch (profile grid)', src: '/examples/sketch-dashboard.png', note: 'Our own sketch, for the sketch-blending task' },
]

export const SAMPLE_SOURCES = [
  { id: 'fuji', label: "Fuji's profile page", code: FUJI_PROFILE_CODE },
  { id: 'parks', label: 'Find parks list', code: PARKS_CODE },
]
