export const starterCode = `() => {
  const interests = [
    ['Film camera', 'Collecting moments in analogue'],
    ['Lofi music', 'A soundtrack for slow mornings'],
    ['Mid-century furniture', 'Objects with a story'],
    ['Music production', 'Making a little noise']
  ];
  return (
    <main className="min-h-screen bg-white text-slate-800 p-6" style={{fontFamily:'Arial, sans-serif'}}>
      <header className="flex items-center justify-between text-xs text-slate-500 mb-7"><span>9:41</span><span>••• ▰</span></header>
      <section className="text-center">
        <img src="/assets/portrait.svg" alt="Sunset over the mountains" className="w-20 h-20 rounded-full mx-auto mb-3 object-cover" />
        <h1 className="text-2xl font-bold">Fuji</h1>
        <p className="text-xs text-slate-500 mt-1">@fujimist</p>
        <p className="text-sm leading-relaxed text-slate-600 mt-4">Passionate nature photographer.<br/>Finding beauty in everyday things.</p>
      </section>
      <section className="border-y border-slate-100 py-4 my-5 space-y-2 text-xs text-slate-600">
        <p>San Francisco, California</p><p>fuji@example.com</p>
      </section>
      <section aria-label="Interests">
        <h2 className="font-bold text-sm mb-3">Interests</h2>
        <div className="space-y-2">{interests.map(([title,description]) => (
          <article key={title} className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-medium">{title}</h3>
            <p className="text-[10px] text-slate-500 mt-1">{description}</p>
          </article>
        ))}</div>
      </section>
    </main>
  );
}`;
export function initialWorkspace() {
  return {
    version: 1, name:'A little inspiration',
    nodes:[
      {id:'ref-wellness',type:'example',name:'Everyday wellness',x:64,y:90,image:'/assets/wellness.svg',kind:'Screenshot',crop:null},
      {id:'source-profile',type:'source',name:'Fuji’s profile',x:540,y:90,code:starterCode,groups:[],error:null}
    ], edges:[], view:{x:0,y:0,zoom:.84}, selected:'source-profile'
  };
}
