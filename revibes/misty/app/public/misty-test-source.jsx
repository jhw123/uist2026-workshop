() => {
  const interests = [
    {id:'INT-01', title:'Film Photography', detail:'A roll of film every weekend'},
    {id:'INT-02', title:'Trail Running', detail:'Five kilometres before breakfast'},
    {id:'INT-03', title:'Jazz Records', detail:'Collecting live sessions on vinyl'},
    {id:'INT-04', title:'Cooking', detail:'One new recipe every Sunday'}
  ];
  return (
    <main className="min-h-screen bg-white p-5 text-slate-800" style={{fontFamily:'Arial, sans-serif'}}>
      <header className="mb-4 border-b border-slate-200 pb-3 text-[10px] font-bold tracking-wider">MISTY TEST · 4821</header>
      <section aria-label="Profile" className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-bold">AC</div>
        <h1 className="text-xl font-bold">Avery Chen</h1>
        <p className="mt-1 text-[11px] text-slate-600">Weekend photographer. Daily coffee enthusiast.</p>
      </section>
      <section aria-label="Contact" className="my-4 border-y border-slate-200 py-3 text-[11px] text-slate-700">
        <p>Detroit, Michigan</p>
        <p className="mt-1">avery.test@example.com</p>
      </section>
      <section aria-label="Interests">
        <h2 className="mb-2 text-sm font-bold">Interests</h2>
        <div className="space-y-2">{interests.map(item => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <h3 className="text-xs font-bold">{item.title}</h3>
            <p className="mt-1 text-[10px] text-slate-600">{item.detail}</p>
            <span className="mt-1 block text-[9px] text-slate-500">{item.id}</span>
          </article>
        ))}</div>
      </section>
      <footer className="mt-4 border-t border-slate-200 pt-2 text-[9px] text-slate-500">SOURCE FOOTER · KEEP-73</footer>
    </main>
  );
}
