module.exports = {
    'common.cancel': 'Cancel',
    // ============ Plurals ============
    'plural.states.one': '{n} state',
    'plural.states.other': '{n} states',
    'plural.transitions.one': '{n} transition',
    'plural.transitions.other': '{n} transitions',
    'plural.actors.one': '{n} actor',
    'plural.actors.other': '{n} actors',
    'plural.rows.one': '{n} row',
    'plural.rows.other': '{n} rows',
    'plural.roles.one': '{n} role',
    'plural.roles.other': '{n} roles',

    // ============ State ============
    'msg.state.deleted': 'State "{name}" deleted.',
    'msg.state.added': 'State "{name}" added.',
    'msg.state.saved': 'State "{name}" saved.',
    'err.state.notFound': 'State "{name}" not found.',
    'err.state.existsInFlow': 'State "{name}" already exists in documentFlow.json.',
    'err.state.existsRename': 'State "{name}" already exists — rename impossible.',
    'err.state.invalidCode': 'State code must be an identifier (letters/digits/_, starting with a letter).',

    // ============ Transition ============
    'msg.transition.saved': 'Transition "{name}" saved.',
    'msg.transition.created': 'Transition "{name}" created.',
    'msg.transition.deleted': 'Transition "{name}" deleted.',
    'msg.transitions.deleted': 'Transitions deleted: {n}.',
    'msg.transition.flowRuleRenameFailed': 'flowRules not renamed: {message}',
    'err.transition.invalidCode': 'Invalid transition code: "{name}".',
    'err.transition.exists': 'Transition "{name}" already exists.',
    'err.transition.existsInOther': 'Transition "{name}" already exists in another state.',
    'err.transition.notFound': 'Transition "{name}" not found.',
    'err.transition.notFoundByOriginal': 'Transition "{original}" not found.',
    'err.transition.duplicateInForm': 'Duplicate transition code in form: "{name}".',
    'err.transition.noTo': 'Transition "{name}" has no target state.',
    'err.transition.noFrom': 'Source state not specified.',
    'err.transition.noToTarget': 'Target state not specified.',
    'err.transition.fromNotFound': 'Source state not found: {from}.',
    'err.transition.toNotFound': 'Target state not found: {to}.',
    'err.transition.noSourceFrom': 'Transition has no source state.',

    // ============ Graph ============
    'msg.graph.saved': 'Positions saved to documentFlow.ui.json',

    // ============ Flow generation ============
    'msg.flow.generated': 'Skeleton saved: {states}, {transitions}.',

    // ============ Auth ============
    'msg.auth.saved': 'Authorization saved: {rows} for {doc}.',
    'msg.auth.actorSaved': 'Authorization of actor "{name}" saved ({roles}).',
    'err.auth.noFile': 'authorization.csv not found.',
    'err.auth.rolesNotArray': 'roles must be an array.',
    'err.auth.emptyRow': 'Every row must have ApplicationRole and Actor filled.',
    'err.auth.duplicateRow': 'Duplicate row: {role} / {actor} / {op}',

    // ============ Actor ============
    'msg.actor.added': 'Actor "{name}" added.',
    'msg.actor.deleted': 'Actor "{name}" removed from all states and authorization.',
    'msg.actor.nowhereFound': 'Actor "{name}" not found anywhere.',
    'msg.actor.removedFromState': 'Actor "{actor}" removed from "{state}".',
    'msg.actor.copied': 'Actor "{name}" copied into {states}{skipped}.',
    'msg.actor.copiedSkipped': ', skipped: {n}',
    'msg.actor.copyNothing': 'Nothing added: actor "{name}" already exists in all selected states.',
    'msg.actor.created': 'Actor "{new}" created as a copy of "{old}"{details}.',
    'msg.actor.createdDetails': ' ({states})',
    'msg.actor.renamed': 'Actor "{old}" renamed to "{new}".',
    'msg.actor.permSaved': 'Permissions of actor "{actor}" in state "{state}" saved.',
    'msg.actor.transitionExists': 'Actor "{actor}" already has transition "{transition}".',
    'msg.actor.transitionNotExists': 'Actor "{actor}" has no transition "{transition}".',
    'err.actor.invalidName': 'Invalid actor name: {name}.',
    'err.actor.exists': 'Actor "{name}" already exists.',
    'err.actor.existsInFlow': 'Actor "{name}" already exists in documentFlow.json.',
    'err.actor.notFound': 'Actor "{name}" not found.',
    'err.actor.notFoundInState': 'Actor "{actor}" not found in state "{state}".',
    'err.actor.sameName': 'Name matches the source.',
    'err.actor.noName': 'Actor name not provided.',
    'err.actor.noOldNew': 'oldName/newName not provided.',
    'err.actor.copyParams': 'Required copy parameters not provided.',
    'err.actor.sourceStateNotFound': 'Source state not found: {from}.',
    'err.actor.sourceActorNotFound': 'Actor not found in source state.',
    'err.actor.alreadyInState': 'Actor "{actor}" already exists in state "{state}".',
    'err.actor.permParams': 'stateName/actorName/perm not provided.',
    'err.actor.stateActorParams': 'actor/state not provided.',
    'err.actor.stateTransitionParams': 'actor/transition not provided.',
    'err.actor.noState': 'State name not provided.',

    // ============ Attachment ============
    'msg.attachment.addedToDoc': 'Attachment "{code}" added to document.',
    'msg.attachment.removedFromDoc': 'Attachment "{code}" removed from document.',
    'err.attachment.noCode': 'Attachment code not provided.',
    'err.attachment.dirNotFound': 'AttachmentType catalog not found (configuration/@config-*/infrastructure/masterEntity/AttachmentType).',
    'err.attachment.dirNotConfigured': 'AttachmentType catalog not found.',
    'err.attachment.projectNotFound': 'AttachmentType not found in project.',
    'err.attachment.invalidCode': 'Invalid attachment code.',
    'err.attachment.invalidCodeWithName': 'Invalid attachment code: {code}.',
    'err.attachment.existsInDoc': 'Attachment "{code}" already exists in document.',
    'err.attachment.existsInCatalog': 'Code "{code}" already exists in catalog.',
    'err.attachment.unknownMode': 'Unknown permission mode: {mode}.',

    // ============ ClientAction ============
    'msg.clientAction.deleted': 'Deleted ClientAction/{name}.js',
    'msg.clientAction.created': 'Created ClientAction/{name}.js',
    'msg.clientAction.renamed': 'ClientAction/{old}.js → {new}.js',
    'msg.clientAction.notFound': 'File ClientAction/{name}.js not found.',
    'msg.clientAction.willCreate': 'File ClientAction/{name}.js not found. Create in current document?',
    'msg.clientAction.createBtn': 'Create',
    'err.clientAction.noAction': 'actionToRunBefore value is not set.',
    'err.clientAction.invalidName': 'Invalid action name: {name}.',
    'confirm.clientAction.delete': 'Delete file ClientAction/{name}.js?',
    'confirm.clientAction.deleteOk': 'Delete',

    // ============ FlowRule ============
    'err.flowRule.invalidCode': 'Invalid transition code: {name}.',
    'msg.flowRule.willCreate': 'File flowRules/{name}.js not found. Create?',
    'msg.flowRule.createBtn': 'Create',

    // ============ Compare ============
    'msg.compare.applied': 'Actions applied: {n}{warnings}.',
    'msg.compare.warnings': ' (warnings: {n})',
    'err.compare.cancelled': 'Cancelled by user.',
    'err.compare.noOtherPath': 'Reference document path not provided.',
    'err.compare.noActions': 'No actions selected to apply.',
    'err.compare.readFailed': 'Failed to read reference: {path}.',
    'err.compare.folderInvalid': 'documentFlow.json not found in the selected folder',
    'confirm.compare.remove': 'Selected actions include {n} deleting. This is irreversible within the apply.\n\nContinue?',
    'confirm.compare.remove.ok': 'Continue',
    'confirm.compare.pickFolder': 'Choose another document folder',

    // ============ Extension ============
    'msg.extension.configNotFound': 'Configuration files not found — skeleton creation mode is available.',
    'err.extension.prefix': 'Error: {message}',

    // ============ Relations ============
    'rel.issue.sourceNotFound': 'sourceDocument "{name}" not found in any @config-*/document/',
    'rel.issue.targetNotFound': 'targetDocument "{name}" not found in any @config-*/document/',
    'rel.issue.stateMissing': 'State "{state}" is missing in {doc}',
    'rel.issue.actorMissing': 'Actor "{actor}" is missing in {doc}',
    'rel.issue.duplicate': 'Duplicated in packages: {list}',

    // ============ compare-apply warnings ============
    'warn.stateNotFound': 'State not found: {name}',
    'warn.transitionNotFound': 'Transition not found: {name}',
    'warn.actorNotFoundInState': 'Actor not found: {state} / {actor}',
    'warn.stateAlreadyAbsent': 'State already absent: {name}',
    'warn.transitionAlreadyAbsent': 'Transition already absent: {name}',
    'warn.unknownAction': 'Unknown action: {kind} (skipped)',
    'warn.applyError': 'Error applying {kind}: {message}',
    'warn.clientActionNotFound': 'ClientAction {name}.js not found in reference — transition copied without file',

    // ============ ClientAction rename errors ============
    'err.clientAction.noNames': 'oldName/newName not provided.',
    'err.clientAction.invalidRename': 'Invalid action name.',
    'err.clientAction.renameNotFound': 'File ClientAction/{name}.js not found.',
    'err.clientAction.renameExists': 'File ClientAction/{name}.js already exists.',

    // ============ FlowRule rename errors ============
    'err.flowRule.renameExists': 'flowRules/{name}.js already exists.',

    // ============ initialState ============
    'msg.initialState.set': 'Initial state: {name}',
    'msg.initialState.cleared': 'Initial state cleared.',
};