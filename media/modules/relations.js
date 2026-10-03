(function () {
  'use strict';

  window.PF = window.PF || {};

  const RELATION_TARGET_MAP = {
    'AmendmentAnnulation':  'Annulled',
    'AmendmentTermination': 'Terminated'
  };

  function resolveRelationTransitionName(fromState, targetDocument) {
    const toState = RELATION_TARGET_MAP[targetDocument];
    if (!toState) return null;
    const transitions = (PF.state.graphData && PF.state.graphData.transitions) || [];
    const tr = transitions.find(t => t.from === fromState && t.to === toState);
    return tr ? tr.name : null;
  }

  function getRelationsFor(stateName, actorName) {
    const list = (PF.state.DATA && PF.state.DATA.relations && PF.state.DATA.relations.relations) || [];
    const result = [];
    for (const rel of list) {
      if (!rel.isMine) continue;
      for (const st of (rel.sourceDocumentStates || [])) {
        if (st.name !== stateName) continue;
        if (!(st.actors || []).includes(actorName)) continue;
        result.push({
          relationName:        rel.name,
          targetDocument:      rel.targetDocument,
          targetDocumentTitle: rel.targetDocumentTitle || rel.targetDocument,
          targetState:         rel.targetState,
          transitionName:      resolveRelationTransitionName(stateName, rel.targetDocument)
        });
        break;
      }
    }
    return result;
  }

  function stateHasRelation(stateName) {
    const list = (PF.state.DATA && PF.state.DATA.relations && PF.state.DATA.relations.relations) || [];
    return list.some(rel =>
      rel.isMine &&
      (rel.sourceDocumentStates || []).some(st => st.name === stateName)
    );
  }

  PF.relations = {
    RELATION_TARGET_MAP,
    resolveRelationTransitionName,
    getRelationsFor,
    stateHasRelation
  };
})();