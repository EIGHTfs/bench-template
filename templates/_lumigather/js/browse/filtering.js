  /* ─── Filtering ─── */
  function getFiltered() {
    let list = [...apiImages, ...userImages];
    if (activeFilter !== "all") list = list.filter(p => p.cat === activeFilter);
    if (activeDir)             list = list.filter(p => p.dirId === activeDir);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.cat || "").toLowerCase().includes(q) ||
        (p.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }

