export function buildChildrenMap(categories) {
  const map = {}
  for (const cat of categories) {
    const pid = cat.parentId === null || cat.parentId === undefined ? 'root' : String(cat.parentId)
    if (!map[pid]) map[pid] = []
    map[pid].push(cat)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => (a.name > b.name ? 1 : -1))
  }
  return map
}

export function flattenForSelect(categories) {
  const map = buildChildrenMap(categories)
  const out = []
  const walk = (id, depth) => {
    const children = map[id] || []
    for (const child of children) {
      out.push({ id: child.id, name: child.name, depth })
      walk(String(child.id), depth + 1)
    }
  }
  walk('root', 0)
  return out
}

export function findPath(categories, id) {
  const byId = {}
  for (const cat of categories) byId[cat.id] = cat
  const path = []
  let current = byId[id]
  let hops = 0
  while (current && hops < 1000) {
    path.unshift(current)
    current = current.parentId !== null && current.parentId !== undefined ? byId[current.parentId] : null
    hops += 1
  }
  return path
}