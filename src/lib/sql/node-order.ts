import type { VisualModel, VisualNode } from "./types";

const NON_PLAYABLE_KINDS = new Set(["start", "end", "result"]);

/**
 * The single display/playback order for SQL steps.
 *
 * Edges enforce dependency order; the walker's stable node order breaks ties
 * between independent branches. Cycles (for example recursive CTEs) retain
 * walker order rather than producing missing or unstable step numbers.
 */
export function playableNodesInOrder(model: VisualModel): VisualNode[] {
  const playable = model.nodes.filter((node) => !NON_PLAYABLE_KINDS.has(node.kind));
  if (playable.length < 2) return playable;

  const walkerIndex = new Map(playable.map((node, index) => [node.id, index]));
  const playableIds = new Set(walkerIndex.keys());
  const indegree = new Map(playable.map((node) => [node.id, 0]));
  const outgoing = new Map(playable.map((node) => [node.id, [] as string[]]));

  for (const edge of model.edges) {
    if (
      edge.source === edge.target ||
      !playableIds.has(edge.source) ||
      !playableIds.has(edge.target)
    ) {
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const byWalkerOrder = (a: VisualNode, b: VisualNode) =>
    (walkerIndex.get(a.id) ?? 0) - (walkerIndex.get(b.id) ?? 0);
  const ready = playable
    .filter((node) => indegree.get(node.id) === 0)
    .sort(byWalkerOrder);
  const ordered: VisualNode[] = [];
  const emitted = new Set<string>();

  while (ready.length) {
    const node = ready.shift()!;
    if (emitted.has(node.id)) continue;
    emitted.add(node.id);
    ordered.push(node);

    for (const targetId of outgoing.get(node.id) ?? []) {
      const nextDegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextDegree);
      if (nextDegree === 0) {
        const target = playable[walkerIndex.get(targetId) ?? -1];
        if (target) {
          ready.push(target);
          ready.sort(byWalkerOrder);
        }
      }
    }
  }

  // Preserve stable numbering for cyclic nodes rather than dropping them.
  for (const node of playable) {
    if (!emitted.has(node.id)) ordered.push(node);
  }

  return ordered;
}
